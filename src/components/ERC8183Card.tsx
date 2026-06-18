import React, { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useEscrowStore, useAppStore } from '../store';
import { addresses, escrowAbi, arcTestnet, erc20Abi } from '../lib/contracts';
import { getAddress, isAddress, parseUnits, formatUnits, decodeEventLog } from 'viem';
import { CheckCircle2, Circle, AlertCircle, RefreshCw } from 'lucide-react';

export function ERC8183Card() {
  const { walletAddress, getPublicClient, getWalletClient, switchToArcTestnet } = useWallet();
  const { addTransaction } = useAppStore();
  const store = useEscrowStore();
  
  const [loadingStep, setLoadingStep] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [formInputs, setFormInputs] = useState({
    provider: store.provider,
    evaluator: store.evaluator,
    jobDetailsHash: store.jobDetailsHash,
    budgetAmount: store.budgetAmount,
  });

  const [jobState, setJobState] = useState<{status?: number, budget?: bigint, token?: string} | null>(null);

  useEffect(() => {
    setFormInputs({
       provider: store.provider,
       evaluator: store.evaluator,
       jobDetailsHash: store.jobDetailsHash,
       budgetAmount: store.budgetAmount,
    });
  }, [store.provider, store.evaluator, store.jobDetailsHash, store.budgetAmount]);

  // Fetch job status if we have a job ID
  useEffect(() => {
    if (store.jobId !== null && store.escrowAddress) {
       checkJobStatus();
    }
  }, [store.jobId, store.escrowAddress]);

  const checkJobStatus = async () => {
    if (store.jobId === null || !store.escrowAddress) return;
    try {
      const publicClient = getPublicClient();
      if (!publicClient) return;
      
      const idNum = parseInt(store.jobId as any, 10);
      if (isNaN(idNum) || idNum <= 0) return;

      const data = await (publicClient as any).readContract({
        address: store.escrowAddress as `0x${string}`,
        abi: escrowAbi,
        functionName: 'jobs',
        args: [BigInt(idNum)]
      });

      if (data) {
        setJobState({
          token: data[2],
          budget: data[3],
          status: data[4]
        });
      }
    } catch (err) {
      console.error("Failed to read job state", err);
    }
  };

  const sanitizeInput = (val: string) => val.replace(/[\\s\\u200B-\\u200D\\uFEFF]/g, '');

  const executeTx = async (
    stepIdx: number, 
    actionName: string, 
    prepare: () => Promise<{address: `0x${string}`, abi: any, functionName: string, args: any[]}>,
    onSuccess: (receipt: any) => void
  ) => {
    try {
      setErrorMsg(null);
      setLoadingStep(stepIdx);
      if (!walletAddress) throw new Error('Wallet not connected');
      await switchToArcTestnet();

      const publicClient = getPublicClient();
      const walletClient = getWalletClient();
      if (!publicClient || !walletClient) throw new Error('Clients not initialized');

      const txConfig = await prepare();

      // Get gas price directly
      const { request } = await (publicClient as any).simulateContract({
         ...txConfig,
         account: walletAddress as `0x${string}`,
      });

      const hash = await (walletClient as any).writeContract(request);

      addTransaction({
        hash,
        action: actionName,
        timestamp: Date.now(),
        status: 'pending',
        chainId: arcTestnet.id,
        from: walletAddress,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'reverted') {
         throw new Error(`Transaction reverted: ${hash}`);
      }

      addTransaction({
        hash,
        action: actionName,
        timestamp: Date.now(),
        status: 'success',
        chainId: arcTestnet.id,
        from: walletAddress,
      });

      await onSuccess(receipt);
    } catch (err: any) {
      console.error(err);
      if (err?.code === 4001) {
        setErrorMsg('Transaction rejected by user.');
      } else {
        setErrorMsg(err?.message || err?.shortMessage || 'Transaction failed. See console for details.');
      }
    } finally {
      setLoadingStep(null);
    }
  };

  const handleCreateJob = async () => {
    const prov = sanitizeInput(formInputs.provider);
    const evalAddr = sanitizeInput(formInputs.evaluator);
    const hash = sanitizeInput(formInputs.jobDetailsHash);

    const errors: Record<string, string> = {};
    if (!isAddress(prov, { strict: false })) errors.provider = 'Invalid provider address';
    if (!isAddress(evalAddr, { strict: false })) errors.evaluator = 'Invalid evaluator address';
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) errors.jobDetailsHash = 'Invalid 32-byte hash (must be 0x + 64 hex chars)';
    
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    executeTx(0, 'Create Job', async () => ({
      address: getAddress(sanitizeInput(store.escrowAddress)),
      abi: escrowAbi,
      functionName: 'createJob',
      args: [getAddress(prov), getAddress(evalAddr), hash as `0x${string}`]
    }), async (receipt) => {
      // Parse event to get ID
      for (const log of receipt.logs) {
        try {
           const decoded: any = decodeEventLog({
             abi: escrowAbi,
             data: log.data,
             topics: log.topics,
           });
           if (decoded.eventName === 'JobCreated') {
             const jobId = Number((decoded.args as any).jobId);
             store.setJobId(jobId);
             store.setJobData({
               provider: prov,
               evaluator: evalAddr,
               jobDetailsHash: hash
             });
             store.setStep(1);
             break;
           }
        } catch (e) {}
      }
    });
  };

  const getValidatedJobId = () => {
    if (store.jobId === null) throw new Error("No active job ID");
    const idNum = parseInt(store.jobId as any, 10);
    if (isNaN(idNum) || idNum <= 0) throw new Error("Invalid Job ID. Must be a positive number.");
    return BigInt(idNum);
  };

  const handleSetBudget = () => {
    executeTx(1, 'Set Budget', async () => {
      const budget = parseUnits(formInputs.budgetAmount.trim() || '0', 6);
      if (budget <= 0n) throw new Error("Budget must be > 0");
      
      return {
        address: getAddress(sanitizeInput(store.escrowAddress)),
        abi: escrowAbi,
        functionName: 'setBudget',
        args: [getValidatedJobId(), addresses.usdcErc20, budget]
      };
    }, async () => {
       store.setJobData({ budgetAmount: formInputs.budgetAmount.trim() });
       store.setStep(2);
       await checkJobStatus();
    });
  };

  const handleFundEscrow = async () => {
    if (!store.jobId) return;

    try {
      setErrorMsg(null);
      setLoadingStep(2);
      await switchToArcTestnet();
      const publicClient = getPublicClient();
      const walletClient = getWalletClient();
      if (!publicClient || !walletClient) throw new Error('Clients not initialized');

      const budget = parseUnits(store.budgetAmount || '0', 6);
      const escrowAddr = getAddress(sanitizeInput(store.escrowAddress));

      // Phase 1: Approve USDC
      const allowance: any = await (publicClient as any).readContract({
        address: addresses.usdcErc20,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [getAddress(walletAddress!), escrowAddr]
      });

      if (allowance < budget) {
        const { request: approveReq } = await (publicClient as any).simulateContract({
          address: addresses.usdcErc20,
          abi: erc20Abi,
          functionName: 'approve',
          args: [escrowAddr, budget],
          account: walletAddress as `0x${string}`,
        });

        const approveHash = await (walletClient as any).writeContract(approveReq);
        addTransaction({
          hash: approveHash,
          action: 'Approve USDC',
          timestamp: Date.now(),
          status: 'pending',
          chainId: arcTestnet.id,
          from: walletAddress!,
        });

        const appReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
        if (appReceipt.status === 'reverted') throw new Error('USDC Approval Reverted');
        
        addTransaction({
            hash: approveHash,
            action: 'Approve USDC',
            timestamp: Date.now(),
            status: 'success',
            chainId: arcTestnet.id,
            from: walletAddress!,
        });
      }

      // Phase 2: Fund
      const { request: fundReq } = await (publicClient as any).simulateContract({
         address: escrowAddr,
         abi: escrowAbi,
         functionName: 'fundJob',
         args: [getValidatedJobId()],
         account: walletAddress as `0x${string}`,
      });

      const fundHash = await (walletClient as any).writeContract(fundReq);
      addTransaction({
          hash: fundHash,
          action: 'Fund Job',
          timestamp: Date.now(),
          status: 'pending',
          chainId: arcTestnet.id,
          from: walletAddress!,
      });
      const fundReceipt = await publicClient.waitForTransactionReceipt({ hash: fundHash });
      if (fundReceipt.status === 'reverted') throw new Error('Fund Job Reverted');
      
      addTransaction({
            hash: fundHash,
            action: 'Fund Job',
            timestamp: Date.now(),
            status: 'success',
            chainId: arcTestnet.id,
            from: walletAddress!,
      });
      store.setStep(3);
      await checkJobStatus();
    } catch (err: any) {
        console.error(err);
        if (err?.code === 4001) setErrorMsg('Transaction rejected by user.');
        else setErrorMsg(err?.message || err?.shortMessage || 'Transaction failed');
    } finally {
        setLoadingStep(null);
    }
  };

  const handleSubmitWork = () => {
    executeTx(3, 'Submit Work', async () => {
      // Create a dummy result hash for this demo
      const resultBytes = "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)))
         .map(b => b.toString(16).padStart(2, '0')).join('');
         
      return {
        address: getAddress(sanitizeInput(store.escrowAddress)),
        abi: escrowAbi,
        functionName: 'submitWork',
        args: [getValidatedJobId(), resultBytes as `0x${string}`]
      };
    }, async () => {
       store.setStep(4);
       await checkJobStatus();
    });
  };

  const handleCompleteJob = () => {
    executeTx(4, 'Complete Job', async () => ({
      address: getAddress(sanitizeInput(store.escrowAddress)),
      abi: escrowAbi,
      functionName: 'completeJob',
      args: [getValidatedJobId()]
    }), async () => {
       store.setStep(5);
       await checkJobStatus();
    });
  };

  const generateRandomHash = () => {
     const hash = "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)))
             .map(b => b.toString(16).padStart(2, '0')).join('');
     setFormInputs(p => ({ ...p, jobDetailsHash: hash }));
  };

  const stepClassParent = (idx: number) => {
    if (store.step > idx) return "opacity-60 transition-opacity duration-300"; // Completed
    if (store.step === idx) return "opacity-100 transition-opacity duration-300"; // Active
    return "opacity-30 pointer-events-none transition-opacity duration-300 filter grayscale"; // Pending
  };

  const stepNumberClass = (idx: number) => {
    if (store.step > idx) return "z-10 flex h-8 w-8 items-center justify-center rounded-full border border-stone-600 bg-stone-900 text-sm font-mono p-0 m-0 text-stone-400 shrink-0";
    if (store.step === idx) return "z-10 flex h-8 w-8 items-center justify-center rounded-full step-active text-sm font-bold text-black font-mono shrink-0";
    return "flex h-8 w-8 items-center justify-center rounded-full border border-stone-800 bg-transparent text-sm font-mono text-stone-500 shrink-0";
  };

  const stepCardClass = (idx: number) => {
    if (store.step === idx) return "flex-1 rounded-xl border-2 border-amber-600/30 bg-stone-900/50 p-5 shadow-lg relative bottom-1";
    return "flex-1 rounded-xl border border-stone-800 bg-stone-900/20 p-4 relative bottom-1 hover:border-stone-700 transition-colors";
  };

  const btnClass = "mt-4 w-full flex justify-center rounded bg-amber-600 py-3 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wide";
  const inputClass = "w-full rounded border border-subtle bg-stone-950 px-3 py-2.5 text-xs font-mono text-stone-200 outline-none focus:border-amber-600/50 focus:ring-1 focus:ring-amber-600/50 transition-all";
  const inputErrClass = "w-full rounded border border-red-500/50 bg-stone-950 px-3 py-2.5 text-xs font-mono text-stone-200 outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all";

  return (
    <div className="flex flex-col h-full w-full max-w-3xl">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-serif-display text-4xl italic text-stone-100">Escrow Lifecycle</h1>
          <p className="mt-2 text-stone-500 text-sm">ERC-8183 Standard Agentic Workflow</p>
        </div>
        <div className="rounded bg-amber-600/10 px-3 py-1.5 text-[10px] font-bold text-amber-500 ring-1 ring-amber-600/30">
          JOB ID: {store.jobId !== null ? store.jobId : "PENDING"}
        </div>
      </div>

      <div className="relative flex flex-col gap-6">
        
        {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm flex gap-3 items-start animate-in fade-in slide-in-from-top-2">
               <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
               <span className="break-all">{errorMsg}</span>
            </div>
        )}

        {/* Step 1: Create Job */}
        <div className={`flex items-stretch gap-6 ${stepClassParent(0)}`}>
          <div className="relative flex flex-col items-center">
            <div className={stepNumberClass(0)}>01</div>
            <div className="w-px bg-stone-800 absolute top-8 bottom-[-24px] -z-10"></div>
          </div>
          <div className={stepCardClass(0)}>
            <h4 className={`text-lg font-medium mb-4 ${store.step === 0 ? 'text-amber-500' : 'text-stone-300'}`}>Create Job</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-stone-500">Provider Address</label>
                  <input 
                    type="text" 
                    value={formInputs.provider}
                    onChange={e => {setFormInputs(p => ({...p, provider: e.target.value})); setFieldErrors(e => ({...e, provider: ''}))}}
                    className={fieldErrors.provider ? inputErrClass : inputClass}
                    placeholder="0x..." 
                    autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
                    disabled={store.step > 0}
                  />
                  {fieldErrors.provider && <p className="text-[10px] text-red-500 mt-1">{fieldErrors.provider}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-stone-500">Evaluator Address</label>
                  <input 
                    type="text" 
                    value={formInputs.evaluator}
                    onChange={e => {setFormInputs(p => ({...p, evaluator: e.target.value})); setFieldErrors(e => ({...e, evaluator: ''}))}}
                    className={fieldErrors.evaluator ? inputErrClass : inputClass}
                    placeholder="0x..." 
                    autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
                    disabled={store.step > 0}
                  />
                  {fieldErrors.evaluator && <p className="text-[10px] text-red-500 mt-1">{fieldErrors.evaluator}</p>}
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[10px] uppercase tracking-wider text-stone-500">Job Details Hash (bytes32)</label>
                  <div className="flex gap-2">
                      <input 
                      type="text" 
                      value={formInputs.jobDetailsHash}
                      onChange={e => {setFormInputs(p => ({...p, jobDetailsHash: e.target.value})); setFieldErrors(e => ({...e, jobDetailsHash: ''}))}}
                      className={`${fieldErrors.jobDetailsHash ? inputErrClass : inputClass} text-[10px]`}
                      placeholder="0x..." 
                      autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
                      disabled={store.step > 0}
                      />
                      {store.step === 0 && (
                        <button onClick={generateRandomHash} className="px-3 shrink-0 rounded border border-subtle bg-stone-900 text-stone-400 hover:text-white hover:bg-stone-800 transition-colors" title="Generate Random Hash">
                            <RefreshCw className="w-4 h-4"/>
                        </button>
                      )}
                  </div>
                  {fieldErrors.jobDetailsHash && <p className="text-[10px] text-red-500 mt-1">{fieldErrors.jobDetailsHash}</p>}
                </div>
            </div>
            {store.step === 0 && (
              <button 
                onClick={handleCreateJob} disabled={loadingStep === 0}
                className={btnClass}
              >
                {loadingStep === 0 ? 'Creating...' : 'Submit Tx: Create Job'}
              </button>
            )}
          </div>
        </div>

        {/* Step 2: Set Budget */}
        <div className={`flex items-stretch gap-6 ${stepClassParent(1)}`}>
          <div className="relative flex flex-col items-center">
            <div className={stepNumberClass(1)}>02</div>
            <div className="w-px bg-stone-800 absolute top-8 bottom-[-24px] -z-10"></div>
          </div>
          <div className={stepCardClass(1)}>
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className={`text-lg font-medium ${store.step === 1 ? 'text-amber-500' : 'text-stone-300'}`}>Set Budget & Parameters</h4>
              {jobState?.budget !== undefined && store.step > 1 && (
                <div className="text-xs font-mono text-stone-400">Budget: {formatUnits(jobState.budget, 6)} USDC</div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[10px] uppercase tracking-wider text-stone-500">Budget Amount (USDC)</label>
                  <input 
                    type="number" 
                    min="0.01" step="0.01"
                    value={formInputs.budgetAmount}
                    onChange={e => setFormInputs(p => ({...p, budgetAmount: e.target.value}))}
                    className={inputClass}
                    placeholder="e.g. 10.50" 
                    disabled={store.step > 1}
                  />
               </div>
            </div>
            {store.step === 1 && (
              <button 
                onClick={handleSetBudget} disabled={loadingStep === 1}
                className={btnClass}
              >
                {loadingStep === 1 ? 'Setting...' : 'Submit Tx: Set USDC Budget'}
              </button>
            )}
          </div>
        </div>

        {/* Step 3: Fund Escrow */}
        <div className={`flex items-stretch gap-6 ${stepClassParent(2)}`}>
          <div className="relative flex flex-col items-center">
            <div className={stepNumberClass(2)}>03</div>
            <div className="w-px bg-stone-800 absolute top-8 bottom-[-24px] -z-10"></div>
          </div>
          <div className={stepCardClass(2)}>
             <h4 className={`text-lg font-medium mb-2 ${store.step === 2 ? 'text-amber-500' : 'text-stone-300'}`}>Fund Escrow</h4>
             <p className="text-xs text-stone-500 mb-4 leading-relaxed">
               Approves USDC allowance and funds the escrow contract in identical on-chain cycles.
             </p>
             {store.step === 2 && (
               <button 
                 onClick={handleFundEscrow} disabled={loadingStep === 2}
                 className={btnClass}
               >
                 {loadingStep === 2 ? 'Funding (2 Txs)...' : 'Approve & Fund USDC'}
               </button>
             )}
          </div>
        </div>

        {/* Step 4: Submit Work */}
        <div className={`flex items-stretch gap-6 ${stepClassParent(3)}`}>
          <div className="relative flex flex-col items-center">
            <div className={stepNumberClass(3)}>04</div>
            <div className="w-px bg-stone-800 absolute top-8 bottom-[-24px] -z-10"></div>
          </div>
          <div className={stepCardClass(3)}>
             <h4 className={`text-lg font-medium mb-2 ${store.step === 3 ? 'text-amber-500' : 'text-stone-300'}`}>Submit Work</h4>
             <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                Typically dispatched by the Provider wallet to signal delivery completion.
             </p>
             {store.step === 3 && (
               <button 
                 onClick={handleSubmitWork} disabled={loadingStep === 3}
                 className={btnClass}
               >
                 {loadingStep === 3 ? 'Submitting...' : 'Submit Tx: Upload Result'}
               </button>
             )}
          </div>
        </div>

        {/* Step 5: Complete Job */}
        <div className={`flex items-stretch gap-6 ${stepClassParent(4)}`}>
          <div className="relative flex flex-col items-center">
            <div className={stepNumberClass(4)}>05</div>
          </div>
          <div className={stepCardClass(4)}>
             <h4 className={`text-lg font-medium mb-2 ${store.step === 4 ? 'text-amber-500' : 'text-stone-300'}`}>Complete Job</h4>
             <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                Authorized Evaluator validates work and releases the locked USDC payout.
             </p>
             {store.step === 4 && (
               <button 
                 onClick={handleCompleteJob} disabled={loadingStep === 4}
                 className={btnClass}
               >
                 {loadingStep === 4 ? 'Completing...' : 'Submit Tx: Complete Escrow'}
               </button>
             )}
          </div>
        </div>

        {store.step === 5 && (
            <div className="mt-8 rounded-xl border border-green-500/30 bg-green-500/10 p-8 text-center animate-in fade-in slide-in-from-bottom-4">
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-xl font-serif-display text-green-400">Escrow Complete</h3>
                <p className="text-sm text-green-500/70 mt-2 max-w-md mx-auto">The agentic escrow has resolved successfully, updating verifiable metadata to Arc Testnet.</p>
                <button onClick={store.resetJob} className="mt-6 px-6 py-2.5 bg-stone-900 border border-stone-700 rounded-full text-sm font-bold text-stone-300 hover:text-white hover:bg-stone-800 transition-colors uppercase tracking-wider">Start New Job</button>
            </div>
        )}

      </div>
    </div>
  );
}
