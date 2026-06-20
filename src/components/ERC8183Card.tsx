import React, { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useEscrowStore, useAppStore } from '../store';
import { addresses, escrowAbi, identityAbi, arcTestnet, erc20Abi } from '../lib/contracts';
import { getAddress, isAddress, isHex, parseUnits, formatUnits, decodeEventLog } from 'viem';
import { CheckCircle2, Circle, AlertCircle, RefreshCw } from 'lucide-react';

export function ERC8183Card() {
  const { walletAddress, nativeBalance, usdcBalance, getPublicClient, getWalletClient, switchToArcTestnet } = useWallet();
  const { addTransaction, updateTransaction, addMyJob } = useAppStore();
  const store = useEscrowStore();
  
  const [loadingStep, setLoadingStep] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [formInputs, setFormInputs] = useState({
    provider: store.providerAgentId || '',
    evaluator: store.evaluatorAgentId || '',
    jobDetailsHash: store.jobDetailsHash || '',
    budgetAmount: store.budgetAmount || '',
    hookAddress: '',
  });

  const [jobState, setJobState] = useState<{status?: number, budget?: bigint, token?: string, expiredAt?: bigint} | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (jobState?.expiredAt) {
      const calculateTimeInfo = () => {
        const now = Math.floor(Date.now() / 1000);
        const expiresAt = Number(jobState.expiredAt);
        const diff = expiresAt - now;
        setTimeRemaining(diff > 0 ? diff : 0);
      };
      
      calculateTimeInfo();
      interval = setInterval(calculateTimeInfo, 1000);
    } else {
       setTimeRemaining(null);
    }
    return () => clearInterval(interval);
  }, [jobState?.expiredAt]);

  useEffect(() => {
    setFormInputs(prev => ({
       ...prev,
       provider: store.providerAgentId || '',
       evaluator: store.evaluatorAgentId || '',
       jobDetailsHash: store.jobDetailsHash || '',
       budgetAmount: store.budgetAmount || ''
    }));
  }, [store.providerAgentId, store.evaluatorAgentId, store.jobDetailsHash, store.budgetAmount]);

  // Fetch job status if we have a job ID
  useEffect(() => {
    if (store.jobId !== null && store.escrowAddress) {
       checkJobStatus();
    }
  }, [store.jobId, store.escrowAddress]);

  const checkJobStatus = async () => {
    if (store.jobId === null || !store.escrowAddress) return;
    try {
      setErrorMsg(null);
      const publicClient = getPublicClient();
      if (!publicClient) return;
      
      let idBigInt: bigint;
      try {
        idBigInt = BigInt(store.jobId);
      } catch (e) {
        setErrorMsg("Invalid Job ID format.");
        return;
      }

      const data: any = await (publicClient as any).readContract({
        address: store.escrowAddress as `0x${string}`,
        abi: escrowAbi,
        functionName: 'getJob',
        args: [idBigInt]
      });

      if (data) {
        setJobState(prev => ({
          ...prev, 
          token: '0x3600000000000000000000000000000000000000', // USDC
          budget: data.budget,
          status: data.status,
          expiredAt: data.expiredAt
        }));
        
        // Sync local step with on-chain truth
        const status = data.status;
        const budget = data.budget;
        
        if (status === 0 /* Open */) {
            if (budget === 0n) {
                 store.setStep(1); // Needs budget
            } else {
                 store.setStep(2); // Needs funding
            }
        } else if (status === 1 /* Funded */) {
            store.setStep(3); // Needs submission
        } else if (status === 2 /* Submitted */) {
            store.setStep(4); // Needs completion
        } else if (status === 3 /* Completed */) {
            store.setStep(5); // Done
        } else if (status === 4 /* Rejected */ || status === 5 /* Expired */) {
            store.setStep(5); // Done
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Failed to read job state: ${err.shortMessage || err.message}`);
    }
  };

  const sanitizeInput = (val?: string) => (val || '').replace(/[\s\u200B-\u200D\uFEFF]/g, '');

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
      if (!store.escrowAddress || !isAddress(sanitizeInput(store.escrowAddress))) {
        throw new Error('Valid Target Escrow Contract is required. Please set it in Settings.');
      }
      
      const cleanAddress = sanitizeInput(store.escrowAddress).toLowerCase();
      if (cleanAddress === '0x0000000000000000000000000000000000000001' || cleanAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error('Please configure a valid Escrow contract. The current address is a placeholder (0x...1 or 0x...0).');
      }

      await switchToArcTestnet();

      const publicClient = getPublicClient();
      const walletClient = getWalletClient();
      if (!publicClient || !walletClient) throw new Error('Clients not initialized');

      // Verify chain ID actually changed before simulating/signing
      const currentChainId = await (walletClient as any).getChainId();
      if (currentChainId !== arcTestnet.id) {
         throw new Error(`Wallet is still on chainId ${currentChainId}. Please switch to Arc Testnet (${arcTestnet.id}) in your wallet.`);
      }

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

      updateTransaction(hash, {
        status: 'success',
      });

      await onSuccess(receipt);
    } catch (err: any) {
      // Removed direct console.error(err) to prevent BigInt serialization crash in preview logs
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
    const provAgentId = sanitizeInput(formInputs.provider);
    const evalAgentId = sanitizeInput(formInputs.evaluator);
    const hash = sanitizeInput(formInputs.jobDetailsHash);
    const hookStr = sanitizeInput(formInputs.hookAddress);

    const errors: Record<string, string> = {};
    if (!provAgentId || !/^\d+$/.test(provAgentId)) errors.provider = 'Invalid Provider Agent ID';
    if (!evalAgentId || !/^\d+$/.test(evalAgentId)) errors.evaluator = 'Invalid Evaluator Agent ID';
    if (!hash) errors.jobDetailsHash = 'Job description/ID is required';
    if (hookStr && !isAddress(hookStr, { strict: false })) errors.hookAddress = 'Invalid hook address';
    
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoadingStep(0);
    setErrorMsg(null);

    try {
      const publicClient = getPublicClient();
      if (!publicClient) throw new Error("Client not initialized");

      // Verify Provider Agent
      let provOwner: string;
      try {
        provOwner = await (publicClient as any).readContract({
          address: addresses.identityRegistry,
          abi: identityAbi,
          functionName: 'ownerOf',
          args: [BigInt(provAgentId)]
        }) as string;
      } catch (e) {
        throw new Error(`Provider Agent ${provAgentId} does not exist or has no owner.`);
      }

      // Verify Evaluator Agent
      let evalOwner: string;
      try {
        evalOwner = await (publicClient as any).readContract({
          address: addresses.identityRegistry,
          abi: identityAbi,
          functionName: 'ownerOf',
          args: [BigInt(evalAgentId)]
        }) as string;
      } catch (e) {
         throw new Error(`Evaluator Agent ${evalAgentId} does not exist or has no owner.`);
      }

      // Check if hook is a contract
      if (hookStr && hookStr !== '0x0000000000000000000000000000000000000000') {
         const code = await publicClient.getBytecode({ address: hookStr as `0x${string}` });
         if (!code || code === '0x') {
             throw new Error('Hook address must be a deployed contract, not an EOA.');
         }
      }

      executeTx(0, 'Create Job', async () => ({
        address: getAddress(sanitizeInput(store.escrowAddress)),
        abi: escrowAbi,
        functionName: 'createJob',
        args: [
          getAddress(provOwner), 
          getAddress(evalOwner), 
          BigInt(Math.floor(Date.now()/1000) + (3600 * 24 * 30)), // expire in 30 days
          hash, 
          hookStr ? getAddress(hookStr) : "0x0000000000000000000000000000000000000000"
        ]
      }), async (receipt) => {
        let foundJobId = false;
        let rawFallbackJobId: string | null = null;
  
        for (const log of receipt.logs) {
          if (log.topics && log.topics.length > 1) {
             rawFallbackJobId = BigInt(log.topics[1] as string).toString();
          }
          try {
             const decoded: any = decodeEventLog({
               abi: escrowAbi,
               data: log.data,
               topics: log.topics,
             });
             if (decoded.eventName === 'JobCreated') {
               const rawJobId = (decoded.args as any).jobId;
               const jobIdStr = typeof rawJobId === 'bigint' ? rawJobId.toString() : String(rawJobId);
               store.setJobId(jobIdStr);
               if (walletAddress) addMyJob(walletAddress, jobIdStr);
               store.setJobData({
                 client: walletAddress || provOwner,
                 provider: provOwner,
                 providerAgentId: provAgentId,
                 evaluator: evalOwner,
                 evaluatorAgentId: evalAgentId,
                 jobDetailsHash: hash
               });
               store.setStep(1);
               foundJobId = true;
               break;
             }
          } catch (e) {
          }
        }
  
        if (!foundJobId && rawFallbackJobId) {
            store.setJobId(rawFallbackJobId);
            if (walletAddress) addMyJob(walletAddress, rawFallbackJobId);
            store.setJobData({
              client: walletAddress || provOwner,
              provider: provOwner,
              providerAgentId: provAgentId,
              evaluator: evalOwner,
              evaluatorAgentId: evalAgentId,
              jobDetailsHash: hash
            });
            store.setStep(1);
            foundJobId = true;
        }
  
        if (!foundJobId) throw new Error("Could not extract Job ID from transaction logs. Is ABI correct?");
      });

    } catch (e: any) {
        setErrorMsg(e.message);
        setLoadingStep(null);
    }
  };

  const getValidatedJobId = () => {
    if (store.jobId === null) throw new Error("No active job ID");
    try {
      return BigInt(store.jobId);
    } catch {
      throw new Error("Invalid Job ID. Must be a valid positive number.");
    }
  };

  const handleSetBudget = () => {
    if (walletAddress?.toLowerCase() !== store.provider?.toLowerCase()) {
      setErrorMsg(`Set Budget must be called by the Provider (${store.provider}). Switch your wallet to proceed.`);
      return;
    }
    executeTx(1, 'Set Budget', async () => {
      const cleanBudgetStr = formInputs.budgetAmount.replace(/[^0-9.]/g, '');
      const parsedAmt = cleanBudgetStr.split('.').length > 2 ? cleanBudgetStr.split('.').slice(0, 2).join('.') : cleanBudgetStr;
      const budget = parseUnits(parsedAmt || '0', 6);
      if (budget <= 0n) throw new Error("Budget must be > 0");
      
      return {
        address: getAddress(sanitizeInput(store.escrowAddress)),
        abi: escrowAbi,
        functionName: 'setBudget',
        args: [getValidatedJobId(), budget, '0x']
      };
    }, async () => {
       store.setJobData({ budgetAmount: formInputs.budgetAmount.trim() });
       store.setStep(2);
       await checkJobStatus();
    });
  };

  const handleFundEscrow = async () => {
    if (!store.jobId) return;
    if (walletAddress?.toLowerCase() !== store.client?.toLowerCase()) {
      setErrorMsg(`Only the Client (${store.client}) can fund the job.`);
      return;
    }

    try {
      setErrorMsg(null);
      setLoadingStep(2);
      await switchToArcTestnet();
      const publicClient = getPublicClient();
      const walletClient = getWalletClient();
      if (!publicClient || !walletClient) throw new Error('Clients not initialized');

      if (!store.escrowAddress || !isAddress(sanitizeInput(store.escrowAddress))) {
        throw new Error('Valid Target Escrow Contract is required.');
      }
      const cleanAddress = sanitizeInput(store.escrowAddress).toLowerCase();
      if (cleanAddress === '0x0000000000000000000000000000000000000001' || cleanAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error('Please configure a valid Escrow contract. The current address is a placeholder.');
      }

      const cleanBudgetStr = store.budgetAmount.replace(/[^0-9.]/g, '');
      const parsedAmt = cleanBudgetStr.split('.').length > 2 ? cleanBudgetStr.split('.').slice(0, 2).join('.') : cleanBudgetStr;
      const budget = parseUnits(parsedAmt || '0', 6);
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
        
        updateTransaction(approveHash, {
            status: 'success',
        });
      }

      // Phase 2: Fund
      const { request: fundReq } = await (publicClient as any).simulateContract({
         address: escrowAddr,
         abi: escrowAbi,
         functionName: 'fund',
         args: [getValidatedJobId(), '0x'],
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
      
      updateTransaction(fundHash, {
            status: 'success',
      });
      store.setStep(3);
      await checkJobStatus();
    } catch (err: any) {
        // Removed console.error to avoid serialization crash
        if (err?.code === 4001) setErrorMsg('Transaction rejected by user.');
        else setErrorMsg(err?.message || err?.shortMessage || 'Transaction failed');
    } finally {
        setLoadingStep(null);
    }
  };

  const handleSubmitWork = () => {
    if (walletAddress?.toLowerCase() !== store.provider?.toLowerCase()) {
      setErrorMsg(`Only the Provider (${store.provider}) can submit work.`);
      return;
    }
    executeTx(3, 'Submit Work', async () => {
      let deliverableBytes = store.deliverable?.trim();
      if (!deliverableBytes) {
        throw new Error("Deliverable payload is required (e.g. IPFS hash)");
      }
      if (!deliverableBytes.startsWith('0x') || deliverableBytes.length !== 66) {
         if (!deliverableBytes.startsWith('0x')) {
            deliverableBytes = "0x" + Array.from(new TextEncoder().encode(deliverableBytes))
               .map(b => b.toString(16).padStart(2, '0')).join('').padEnd(64, '0').slice(0, 64);
         } else {
            deliverableBytes = deliverableBytes.padEnd(66, '0').slice(0, 66);
         }
      }
         
      return {
        address: getAddress(sanitizeInput(store.escrowAddress)),
        abi: escrowAbi,
        functionName: 'submit',
        args: [getValidatedJobId(), deliverableBytes as `0x${string}`, '0x']
      };
    }, async () => {
       store.setStep(4);
       await checkJobStatus();
    });
  };

  const handleCompleteJob = () => {
    const isClient = walletAddress?.toLowerCase() === store.client?.toLowerCase();
    const isEvaluator = walletAddress?.toLowerCase() === store.evaluator?.toLowerCase();
    
    if (!isClient && !isEvaluator) {
      setErrorMsg(`Only the Client (${store.client}) or Evaluator (${store.evaluator}) can complete this job.`);
      return;
    }
    executeTx(4, 'Complete Job', async () => {
      let reasonBytes = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
      if (store.completionReason?.trim()) {
         let rawReason = store.completionReason.trim();
         if (!rawReason.startsWith('0x')) {
             reasonBytes = ("0x" + Array.from(new TextEncoder().encode(rawReason))
               .map(b => b.toString(16).padStart(2, '0')).join('')).padEnd(66, '0').slice(0, 66) as `0x${string}`;
         } else {
             reasonBytes = rawReason.padEnd(66, '0').slice(0, 66) as `0x${string}`;
         }
      }
      return {
        address: getAddress(sanitizeInput(store.escrowAddress)),
        abi: escrowAbi,
        functionName: 'complete',
        args: [getValidatedJobId(), reasonBytes, '0x']
      };
    }, async () => {
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
        <div className="flex flex-col items-end gap-2">
            <div className="rounded bg-amber-600/10 px-3 py-1.5 text-[10px] font-bold text-amber-500 ring-1 ring-amber-600/30">
              JOB ID: {store.jobId !== null ? store.jobId : "PENDING"}
            </div>
            {timeRemaining !== null && store.step < 5 && (
                <div className={`rounded px-3 py-1.5 text-[10px] font-bold ring-1 
                    ${timeRemaining === 0 ? 'bg-red-500/10 text-red-500 ring-red-500/30' : 
                      timeRemaining < 3600 ? 'bg-amber-500/10 text-amber-500 ring-amber-500/30' : 
                      'bg-stone-500/10 text-stone-400 ring-stone-800'}`}>
                    {timeRemaining === 0 ? 'EXPIRED' : `EXPIRES IN ${Math.floor(timeRemaining / 3600)}H ${Math.floor((timeRemaining % 3600) / 60)}M`}
                </div>
            )}
        </div>
      </div>

      <div className="relative flex flex-col gap-6">
        
        {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm flex gap-3 items-start animate-in fade-in slide-in-from-top-2">
               <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
               <span className="break-all">{errorMsg}</span>
            </div>
        )}

        {(nativeBalance === 0n || (usdcBalance !== null && usdcBalance < parseUnits("1", 6))) && (
           <div className="bg-blue-500/10 border border-blue-500/30 text-blue-400 px-4 py-3 rounded-xl text-sm flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 mb-2">
              <div className="flex gap-3 items-start">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <span>Your wallet is running low on Arc Testnet ARC or USDC. You might need more funds to complete transactions.</span>
              </div>
              <div className="flex gap-4 ml-8 text-[11px] uppercase tracking-wider font-bold">
                  <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-4">Public Faucet</a>
                  <a href="https://console.circle.com/faucet" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-4">Console Faucet</a>
              </div>
           </div>
        )}

        {/* Step 1: Create Job */}
        <div className={`flex items-stretch gap-6 ${stepClassParent(0)}`}>
          <div className="relative flex flex-col items-center">
            <div className={stepNumberClass(0)}>01</div>
            <div className="w-px bg-stone-800 absolute top-8 bottom-[-24px] -z-10"></div>
          </div>
          <div className={stepCardClass(0)}>
            <div className="flex items-center justify-between mb-4">
              <h4 className={`text-lg font-medium ${store.step === 0 ? 'text-amber-500' : 'text-stone-300'}`}>Create Job</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase tracking-wider text-stone-500">Provider Agent ID</label>
                  </div>
                  <input 
                    type="text" 
                    value={formInputs.provider}
                    onChange={e => {setFormInputs(p => ({...p, provider: e.target.value})); setFieldErrors(e => ({...e, provider: ''}))}}
                    className={fieldErrors.provider ? inputErrClass : inputClass}
                    placeholder="e.g. 1" 
                    autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
                    disabled={store.step > 0}
                  />
                  {fieldErrors.provider && <p className="text-[10px] text-red-500 mt-1">{fieldErrors.provider}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-stone-500">Evaluator Agent ID</label>
                  <input 
                    type="text" 
                    value={formInputs.evaluator}
                    onChange={e => {setFormInputs(p => ({...p, evaluator: e.target.value})); setFieldErrors(e => ({...e, evaluator: ''}))}}
                    className={fieldErrors.evaluator ? inputErrClass : inputClass}
                    placeholder="e.g. 2" 
                    autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
                    disabled={store.step > 0}
                  />
                  {fieldErrors.evaluator && <p className="text-[10px] text-red-500 mt-1">{fieldErrors.evaluator}</p>}
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[10px] uppercase tracking-wider text-stone-500">Job Description / Task ID</label>
                  <div className="flex gap-2">
                      <input 
                      type="text" 
                      value={formInputs.jobDetailsHash}
                      onChange={e => {setFormInputs(p => ({...p, jobDetailsHash: e.target.value})); setFieldErrors(e => ({...e, jobDetailsHash: ''}))}}
                      className={`${fieldErrors.jobDetailsHash ? inputErrClass : inputClass} text-[10px]`}
                      placeholder="e.g. Develop AI feature / ipfs://..." 
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
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[10px] uppercase tracking-wider text-stone-500" title="Optional contract called by the escrow during job lifecycle events">Hook Contract (Optional)</label>
                  <input 
                    type="text" 
                    value={formInputs.hookAddress}
                    onChange={e => {setFormInputs(p => ({...p, hookAddress: e.target.value})); setFieldErrors(e => ({...e, hookAddress: ''}))}}
                    className={fieldErrors.hookAddress ? inputErrClass : inputClass}
                    placeholder="0x... (Advanced use only)" 
                    autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
                    disabled={store.step > 0}
                  />
                  {fieldErrors.hookAddress && <p className="text-[10px] text-red-500 mt-1">{fieldErrors.hookAddress}</p>}
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
                onClick={handleSetBudget} disabled={loadingStep === 1 || timeRemaining === 0}
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
                 onClick={handleFundEscrow} disabled={loadingStep === 2 || timeRemaining === 0}
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
             <div className="space-y-1.5 mb-4">
               <label className="text-[10px] uppercase tracking-wider text-stone-500">Deliverable Hash or URL</label>
               <input 
                 type="text" 
                 value={store.deliverable || ''}
                 onChange={e => store.setJobData({ deliverable: e.target.value })}
                 className={inputClass}
                 placeholder="e.g. ipfs://..., https://..." 
                 autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
                 disabled={store.step > 3}
               />
             </div>
             {store.step === 3 && (
               <button 
                 onClick={handleSubmitWork} disabled={loadingStep === 3 || timeRemaining === 0}
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
             <div className="space-y-1.5 mb-4">
               <label className="text-[10px] uppercase tracking-wider text-stone-500">Reason (Optional)</label>
               <input 
                 type="text" 
                 value={store.completionReason || ''}
                 onChange={e => store.setJobData({ completionReason: e.target.value })}
                 className={inputClass}
                 placeholder="e.g. Approved, looks great!" 
                 autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
                 disabled={store.step > 4}
               />
             </div>
             {store.step === 4 && (
               <button 
                 onClick={handleCompleteJob} disabled={loadingStep === 4 || timeRemaining === 0}
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
