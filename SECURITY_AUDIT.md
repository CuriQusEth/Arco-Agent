# Arc Network - Web3 Security Audit & Integration Report

**Target:** Arco Agentic Escrow (ERC-8183 Implementation)
**Network:** Arc Testnet (Chain ID `0x4cef52` / `5042002`)
**Scope:** Frontend Architecture, Smarts Contract Integration, React/Vite/Zustand State, Viem Implementation.

---

## 1. ARC CHAIN COMPLIANCE
**SEVERITY:** High
**LOCATION:** `src/lib/contracts.ts` (Addresses Configuration)
**PROBLEM:** The application successfully identifies the 18-decimal gas vs. 6-decimal USDC discrepancy, satisfying core Arc constraints. However, the custom escrow contract fallback is hardcoded to `0x0000000000000000000000000000000000000001`. 
**IMPACT:** Any transaction (Create Job, Set Budget) initiated prior to manual user configuration via the settings modal will revert on-chain natively, burning gas and generating console errors.
**FIX:** 
```typescript
// Enforce null/undefined and throw explicitly if no valid escrow contract is set
export const addresses = {
  // ... Circle infrastructure
  defaultEscrow: null, 
}
// Throw inside executeTx if store.escrowAddress === null
```

## 2. WALLET INTEGRATION
**SEVERITY:** Critical
**LOCATION:** `src/hooks/useWallet.ts`
**PROBLEM:** The wallet connection exclusively relies on a raw `window.ethereum` global object injection.
**IMPACT:** Conflicts in EIP-6963 multi-wallet environments. If a user has both Rabby and Coinbase Wallet installed, the application blindly connects to whichever provider injected last, offering no discovery mechanism or selector. This leads to split-brain states where the user signs with a different account than expected.
**FIX:** Implement EIP-6963 discovery events to catalog multiple providers before selecting one.
```typescript
window.addEventListener("eip6963:announceProvider", (event) => {
  // Map providers and allow user selection in UI
});
window.dispatchEvent(new Event("eip6963:requestProvider"));
```

## 3. VIEM IMPLEMENTATION REVIEW
**SEVERITY:** High
**LOCATION:** `src/components/ERC8183Card.tsx` - `handleFundEscrow()`
**PROBLEM:** The app executes `simulateContract` for `fundJob` immediately upon successful `waitForTransactionReceipt` of the `approve` transaction. 
**IMPACT:** Race Condition. Even though the receipt for approval is minted, the specific decentralized RPC node handling the `simulateContract` read-call for Phase 2 might be milliseconds behind and processing an older state block. The simulation will falsely revert with "ERC20: Insufficient Allowance".
**FIX:** Add block confirmations, a manual delay, or catch the simulation revert and retry with exponential backoff on testnet.

## 4. REACT & TYPESCRIPT REVIEW
**SEVERITY:** Critical
**LOCATION:** `src/components/ERC8183Card.tsx` - `useEffect` dependencies
**PROBLEM:** The `jobDetailsHash` fallback defaults to an inline `Math.random()` generator within the `useEffect`.
**IMPACT:** React Render Instability. Whenever sibling parameters (like `budgetAmount`) change, the `useEffect` re-evaluates. Since the component sets form state, it causes infinite UI churn or silently overwrites user hashes if initialized improperly.
**FIX:** Generate the default random hash inside the Zustand store or during the component mount exclusively, never inline within a reactive effect.

## 5. STATE MANAGEMENT REVIEW
**SEVERITY:** Medium
**LOCATION:** `src/store/index.ts` - `useEscrowStore`
**PROBLEM:** Zustand persistence is globally caching sensitive operational parameters (`provider`, `evaluator`) using `localStorage`.
**IMPACT:** Privacy risk on shared machines. A user visiting the application later can see the complete counterparty address map from the previous session.
**FIX:** Use the `partialize` filter in Zustand middleware to omit sensitive inputs.
```typescript
partialize: (state) => ({ step: state.step, jobId: state.jobId }), // Exclude PII
```

## 6. SECURITY REVIEW
**SEVERITY:** High
**LOCATION:** `src/components/ERC8183Card.tsx` - Input Fields
**PROBLEM:** The `budgetAmount` input relies on `<input type="number">`.
**IMPACT:** The HTML5 number input accepts specific non-numeric characters like "e", "E", "+", and "-". If a user inputs `1e18` or `-50`, passing this unvalidated string directly into `viem`'s `parseUnits` will cause fatal unhandled exceptions, crashing the entire React tree because the application lacks React Error Boundaries.
**FIX:** Apply strict regex sanitation before calling `parseUnits`.
```typescript
const sanitizedAmt = formInputs.budgetAmount.replace(/[^0-9.]/g, '');
const budget = parseUnits(sanitizedAmt || '0', 6);
```

## 7. ERC-8183 / ESCROW LOGIC REVIEW
**SEVERITY:** Medium
**LOCATION:** `src/components/ERC8183Card.tsx` - `handleFundEscrow()`
**PROBLEM:** Phase 1 (Approve) and Phase 2 (TransferFrom/Fund) are grouped linearly.
**IMPACT:** If the user rejects the Phase 2 transaction, their wallet retains a permanent infinite (or high) token approval directed at the specific Job/Escrow contract. If the escrow factory has a proxy-upgrade vulnerability, these funds can be swept in the future.
**FIX:** If Phase 2 is canceled via a `4001` error, automatically propose a transaction to rewrite the USDC `approve` allowance back to `0`. Or upgrade to Permit2 architectures.

## 8. BALANCE & TOKEN HANDLING
**SEVERITY:** Low
**LOCATION:** `src/components/BalanceWidget.tsx`
**PROBLEM:** `formatBal` implicitly defaults to string `'0.0000'` if `nativeBalance === null`. 
**IMPACT:** UI Misrepresentation. A disconnected or pending RPC status masquerades as an empty wallet, which confuses users who expect a skeleton loader or a distinct `---` state before the RPC resolves their funds.

## 9. UX & PRODUCT REVIEW
**SEVERITY:** Medium
**LOCATION:** `src/App.tsx`
**PROBLEM:** There is no graceful degradation for connection failures. If the RPC endpoint goes offline, the global UI throws silent promise rejections inside `useWallet`.
**IMPACT:** The user clicking "Connect" perceives the application as broken.
**FIX:** Expose `viem` network connection health to the UI and show a toast if the Arc public endpoints throttle the IP.

## 10. PERFORMANCE REVIEW
**SEVERITY:** Low
**LOCATION:** Entire file hierarchy
**PROBLEM:** The application performs heavy multi-contract interactions directly inside React UI components rather than extracting them to decoupled action classes or separated `useMutation` hooks.
**IMPACT:** Bloated components and difficult testing environments, leading to larger JS bundles than strictly necessary.

## 11. PRODUCTION READINESS REVIEW
**SEVERITY:** Critical
**LOCATION:** System-wide
**BLOCKERS:**
1. Hardcoded 18-decimal vs 6-decimal assumptions inside the budget logic without querying the contract's actual decimal map per-job (What if EURC is 18 decimals in a different deployment?).
2. Total absence of Sentry or telemetry for on-chain failures.
3. Use of `as any` casting inside `useWallet.ts` disabling TypeScript compile-time validations for ABI mismatching.

---

### A. Top 10 Most Dangerous Issues
1. EIP-6963 single-provider clobbering (Wallet connection failures).
2. `parseUnits` fatality handling (Client crashing on exponential notations).
3. Zustand PII cache leaks (Local storage tracking).
4. Synchronous simulated read mapping (RPC node race conditions).
5. Hanging token approvals (Approval granted but transaction reverted).
6. Viem `as any` typings bypassing strict TS.
7. Random hash recursion inside React effects.
8. Unvalidated `parseInt()` execution acting upon contract state `BigInt` outputs.
9. Missing global React Error Boundaries.
10. Unenforced minimum budget bounds before emitting on-chain events.

### B. Arc-Specific Integration Mistakes
The application handles the `18` vs `6` decimal USDC discrepancy well structurally, recognizing that native value transfers evaluate to 18 decimals while the ERC-20 interface accesses the same liquidity pool using 6 decimals. However, the logic assumes `USDC = 6 decimals` implicitly in `setBudget()` rather than cross-referencing with the `fetchBalances` decimal check dynamically.

### C. Production Launch Blockers
Before Mainnet: 
- Implement EIP-6963 dynamic multi-provider discovery routing.
- Integrate `@tanstack/react-query` to manage asynchronous RPC polling rather than using raw `useEffect` cycles.
- Remove all `(publicClient as any)` casts by fully integrating `parseAbi([]) as const` literals for strict static checking.

### D. Refactoring Recommendations
- Move all Viem contract configurations (`executeTx`) out of `ERC8183Card.tsx` into a dedicated `useEscrowTransactions()` custom hook.
- Implement an atomic `TransactionNotification` context capable of managing parallel Tx queuing.

### E. Security Hardening Checklist
- [x] Input trailing whitespace sanitization.
- [x] Non-checksum address processing (viem strict: false).
- [ ] Implement Regex `^\d+(\.\d{1,6})?$` blocking exponential inputs `<input type="text" pattern="[0-9]*">`.
- [ ] Limit `getGasPrice` overhead polling limits to prevent RPC ban.
- [ ] Zero-out pending allowances on `completeJob` revert scenarios.
- [ ] Sanitize arbitrary bytecode out of bytes32 random generator contexts.

### F. Final Score: 68/100 (Needs Remediation)
The application architecture is functional, cleanly designed, and fundamentally understands exactly how Arc Network operates. However, it requires a complete refactor of its error handling borders, asynchronous RPC waiting layers, and input parameter sanitization to be deemed safely "Production Grade" handling unconstrained user capital on Mainnet.
