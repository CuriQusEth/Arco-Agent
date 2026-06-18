# ARC - WEB3 SECURITY & INTEGRATION AUDIT REPORT

**Target Contract:** `0x0747EEf0706327138c69792bF28Cd525089e4583` (Arc Testnet ERC-8183 Reference implementation)
**Objective:** Strict compliance check regarding ERC-8183 specification, React State, Viem Integration, Role Privileges, and Arc Network robustness.

---

## PHASE 1 — ARC ERC-8183 COMPLIANCE AUDIT

**SEVERITY:** High
**FILE:** `src/lib/contracts.ts`
**FUNCTION:** `escrowAbi`
**CODE:**
```typescript
'event JobCreated(uint256 indexed jobId, address indexed provider, address indexed evaluator, bytes32 jobDetailsHash)'
```
**PROBLEM:** The frontend ABI maps `JobCreated` with a `bytes32` value instead of a `string description` and missing `hook`. The Arc testnet reference contract emits `string description` and `address hook` for EIP compliance.
**IMPACT:** `decodeEventLog` throws an error or fails to find the event signature during execution, leading to the frontend failing to extract `jobId`. The UI will hang at "Job ID: PENDING".
**FIX:** Reconcile the ABI with Arc specification.
**CORRECTED CODE:**
```typescript
'event JobCreated(uint256 indexed jobId, address indexed provider, address indexed evaluator, string description, address hook)'
```

---

## PHASE 2 — CONTRACT INTERACTION AUDIT

**SEVERITY:** Critical
**FILE:** `src/components/ERC8183Card.tsx`
**FUNCTION:** `handleFundEscrow`
**CODE:**
```typescript
const { request: approveReq } = await (publicClient as any).simulateContract({
    address: addresses.usdcErc20,
    abi: erc20Abi,
    functionName: 'approve',
    args: [escrowAddr, budget],
    account: walletAddress as `0x${string}`
});
const approveHash = await walletClient.writeContract(approveReq);
await publicClient.waitForTransactionReceipt({ hash: approveHash });

const { request: fundReq } = await (publicClient as any).simulateContract({ /* fund */ });
```
**PROBLEM:** The frontend uses synchronous consecutive RPC calls where the receipt of `approve` triggers a simulated `fund` read. On decentralized RPCs, the reading node might not have ingested the newly minted block from the previous `approve` receipt.
**IMPACT:** The simulation for `fund` throws "ERC20: Insufficient Allowance" ("The contract returned 0x"). The user is left with approved USDC but a broken UI state holding a rejected Phase 2 step.
**FIX:** Add block confirmation delays, or wrap the simulation in a retry mechanism with exponential backoff on testnet.

---

## PHASE 3 — EVENT DECODING AUDIT

**SEVERITY:** Medium
**FILE:** `src/components/ERC8183Card.tsx`
**FUNCTION:** `handleCreateJob` -> `decodeEventLog`
**CODE:**
```typescript
const rawJobId = (decoded.args as any).jobId;
const jobIdStr = typeof rawJobId === 'bigint' ? rawJobId.toString() : String(rawJobId);
store.setJobId(jobIdStr);
```
**PROBLEM:** While string conversion is safe, throwing away block constraints or ignoring whether `JobCreated` matches the caller's provider and evaluator can lead to capturing an incorrect `jobId` if the transaction was batched.
**IMPACT:** Potential desync if RPC yields dirty logs.
**FIX:** Verify the topic payload strictly against the ABI signature.

---

## PHASE 4 — ERC-8183 ROLE MODEL AUDIT

**SEVERITY:** Critical
**FILE:** `src/components/ERC8183Card.tsx`
**FUNCTION:** `handleCompleteJob` / `handleSubmitWork`
**CODE:**
```typescript
executeTx(4, 'Complete Job', async () => ({ ... }), async () => { store.setStep(5); });
```
**PROBLEM:** Total lack of role validation on critical state transitions. `complete` is intended strictly for the Evaluator. `submit` is intended strictly for the Provider. 
**IMPACT:** Any connected wallet (e.g., the Client or Provider) can click "Complete Job" and attempt to execute the transaction. The smart contract will correctly revert the transaction as unauthorized ("returned no data (0x)" or explicit revert string), wasting user gas and creating a severely confusing UX.
**FIX:** Enforce role-based locking in UI.
**CORRECTED CODE:**
```typescript
const handleCompleteJob = () => {
    if (walletAddress?.toLowerCase() !== store.evaluator?.toLowerCase()) {
        setErrorMsg(`Only the Evaluator (${store.evaluator}) can complete this job.`);
        return;
    }
    executeTx(4, ...);
}
```

---

## PHASE 5 — REACT AUDIT

**SEVERITY:** Medium
**FILE:** `src/components/ERC8183Card.tsx`
**FUNCTION:** `handleSubmitWork`
**CODE:**
```typescript
const resultBytes = stringToHex(formInputs.jobDetailsHash || '', { size: 32 });
```
**PROBLEM:** The frontend uses the *initial job description input* (`formInputs.jobDetailsHash`), which was meant for `description`, as the `deliverable` payload in the `submit` workflow.
**IMPACT:** The provider natively submits the initial job request text as the finalized deliverable on-chain. There is no independent file for inputting the deliverable IPFS hash or metadata pointing to the final work. 
**FIX:** Add a separate `deliverable` input field in the Zustand store and React form specifically for Phase 3 (Submit).

---

## PHASE 6 — ZUSTAND AUDIT

**SEVERITY:** High
**FILE:** `src/store/index.ts`
**FUNCTION:** `partialize`
**CODE:**
```typescript
partialize: (state) => ({ 
  step: state.step, 
  jobId: state.jobId,
  escrowAddress: state.escrowAddress
}),
```
**PROBLEM:** Roles (`provider`, `evaluator`) are completely wiped from state upon browser refresh. 
**IMPACT:** If a user completes Step 1, refreshes the page, and proceeds to Step 2, the UI’s role locks (`walletAddress !== store.provider`) will falsely trigger because `store.provider` is null. The user is soft-locked.
**FIX:** Persist role dependencies that the UI requires for validation, or hydrate them dynamically via RPC reads on mount.
**CORRECTED CODE:**
```typescript
partialize: (state) => ({ step: state.step, jobId: state.jobId, escrowAddress: state.escrowAddress, provider: state.provider, evaluator: state.evaluator }),
```

---

## PHASE 7 — SECURITY AUDIT

**SEVERITY:** High
**FILE:** `src/components/ERC8183Card.tsx`
**FUNCTION:** `handleSetBudget`
**CODE:**
```typescript
const cleanBudgetStr = formInputs.budgetAmount.replace(/[^0-9.]/g, '');
const parsedAmt = cleanBudgetStr.split('.').length > 2 ? cleanBudgetStr.split('.').slice(0, 2).join('.') : cleanBudgetStr;
const budget = parseUnits(parsedAmt || '0', 6);
```
**PROBLEM:** Even with sanitization, if the wallet is fundamentally spoofed or if the Arc Testnet RPC endpoint returns manipulated `chainIds`, the transaction signs natively without EIP-155 replay protection enforcement checks. Additionally, not catching simulated errors before passing to `writeContract` leads to generic Viem stack traces.
**IMPACT:** Frontrunning, replay vectors natively to specific unverified contracts.
**FIX:** Strictly check `walletClient.getChainId() === arcTestnet.id` before executing the `writeContract`.

---

## PHASE 8 — ARC TESTNET READINESS

**SEVERITY:** Low
**FILE:** System-Wide
**PROBLEM:** The system does not actively notify the user of RPC limits. 
**IMPACT:** Arc Testnet throttles heavy block-polling. `waitForTransactionReceipt` polling may hit `429 Too Many Requests`.
**FIX:** Implement an exponential backoff loop for fetching receipts over `viem`'s generic aggressive polling logic using `@tanstack/react-query`.

---

## PHASE 9 — PRODUCTION READINESS

**SEVERITY:** Critical
**FILE:** `src/components/ERC8183Card.tsx`
**PROBLEM:** Total lack of cross-chain compatibility boundaries. The frontend attempts to execute `executeTx` even if the user is on Ethereum Mainnet. It calls `switchToArcTestnet()`, but EIP-6963 multi-wallets routinely ignore chain modification requests asynchronously while returning success.
**IMPACT:** Transaction fails or, worse, transmits to a malicious clone contract on a different EVM network.
**FIX:** Directly poll `walletClient.getChainId()` blocking mechanism immediately inside `executeTx` *after* attempting the switch.

---

## PHASE 10 — REQUIRED OUTPUT (Summary view complete above)

### FINAL REPORT

**1. Top 5 Critical Issues:**
* `JobCreated` ABI Parameter Mismatch prevents `jobId` acquisition.
* Missing Role Privileges for `submit` (Provider) and `complete` (Evaluator) triggering revert collisions.
* Zustand failing to persist `provider/evaluator` leading to post-refresh soft locks.
* RPC Block Sync Race Condition between `approve` mining and `fund` simulation reads.
* `deliverable` payload referencing the original setup description hash incorrectly in Phase 3.

**2. Arc ERC-8183 Compliance Score:** 85/100 (Architecture is structurally 8183 perfect, but ABI string-to-bytes mismatches prevent indexing).
**3. Frontend Architecture Score:** 72/100 (Lacks Error Boundaries, relies on dangerous sequential promises).
**4. Security Score:** 80/100 (Form input sanitization is strong, but missing critical verification of network states post-mutation attempt).
**5. Production Readiness Score:** 55/100 (Needs dedicated React Query integration to stabilize polling).

**6. Launch Blockers:** Fix Role Based Validations. Fix Zustand Persistence. 
**7. Must-Fix Before Mainnet:** Extract `fund` simulated race conditions into separated asynchronous UI hooks (e.g. user manually clicking "Fund" after "Approve" rather than automated sequentially). 
**8. Nice-To-Have Improvements:** Implement ERC-8183 `hook` integrations instead of explicitly disabling them with `0x000..000`.
**9. Refactoring Opportunities:** Create a centralized `TransactionEngine` hook to abstract Viem away from the React component tree entirely.
**10. Final Decision:** **NO-GO.** Do not launch on Mainnet until Role locks and ABI alignments are completely secured.
