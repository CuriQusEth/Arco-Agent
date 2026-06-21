import React, { useState, useEffect } from 'react';
import { WalletButton } from './components/WalletButton';
import { BalanceWidget } from './components/BalanceWidget';
import { ERC8183Card } from './components/ERC8183Card';
import { SettingsModal } from './components/SettingsModal';
import { TxHistoryModal } from './components/TxHistoryModal';
import { AgentsPage } from './components/AgentsPage';
import { CircleIntegrationTest } from './components/CircleIntegrationTest';
import { useWallet } from './hooks/useWallet';
import { Settings, History, Shield, Activity, RefreshCw, Briefcase, Bot, Copy, X, Menu } from 'lucide-react';
import { useEscrowStore, useAppStore } from './store';
import { addresses, arcTestnet, escrowAbi } from './lib/contracts';

import { JobFeed } from './components/JobFeed';
import { ToastStack } from './components/ToastStack';
import { scanLogsChunked } from './lib/eventScanning';

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [currentView, setCurrentView] = useState<'escrow' | 'agents' | 'feed' | 'circle'>('escrow');
  const { walletAddress, getPublicClient } = useWallet();
  const { transactions, myJobs, setMyJobs, addMyJob } = useAppStore();
  const store = useEscrowStore();
  const [isFetchingJobs, setIsFetchingJobs] = useState(false);
  const [jobStatuses, setJobStatuses] = useState<Record<string, number>>({});
  const [totalIndexedJobs, setTotalIndexedJobs] = useState<number>(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qsJobId = params.get('jobId');
    const qsEscrow = params.get('escrow');

    if (qsJobId) {
      store.setJobId(qsJobId);
      if (walletAddress) addMyJob(walletAddress, qsJobId);
    }
    if (qsEscrow) {
      store.setEscrowAddress(qsEscrow);
    }
  }, [walletAddress]); // run on load and wallet connect

  useEffect(() => {
    if (
      (!store.escrowAddress || 
       store.escrowAddress === '0x0000000000000000000000000000000000000001' || 
       store.escrowAddress === '0x0000000000000000000000000000000000000000') 
       && addresses.defaultEscrow
    ) {
      store.setEscrowAddress(addresses.defaultEscrow);
    }
  }, [store.escrowAddress, store.setEscrowAddress]);

  useEffect(() => {
     if (!walletAddress || !store.escrowAddress) return;
     const fetchJobs = async () => {
         const publicClient = getPublicClient() as any;
         if (!publicClient) return;
         setIsFetchingJobs(true);

         try {
             // We can only filter by indexed args that actually exist in the ABI.
             const [cLogs, pLogs] = await Promise.all([
                 scanLogsChunked(publicClient, {
                     address: store.escrowAddress as `0x${string}`,
                     event: {
                         type: 'event',
                         name: 'JobCreated',
                         inputs: [
                             { type: 'uint256', name: 'jobId', indexed: true },
                             { type: 'address', name: 'client', indexed: true },
                             { type: 'address', name: 'provider', indexed: true },
                             { type: 'address', name: 'evaluator', indexed: false },
                             { type: 'uint256', name: 'expiredAt', indexed: false },
                             { type: 'address', name: 'hook', indexed: false },
                         ],
                     },
                     args: { client: walletAddress as `0x${string}` }
                 }, { maxChunks: 5 }),
                 scanLogsChunked(publicClient, {
                     address: store.escrowAddress as `0x${string}`,
                     event: {
                         type: 'event',
                         name: 'JobCreated',
                         inputs: [
                             { type: 'uint256', name: 'jobId', indexed: true },
                             { type: 'address', name: 'client', indexed: true },
                             { type: 'address', name: 'provider', indexed: true },
                             { type: 'address', name: 'evaluator', indexed: false },
                             { type: 'uint256', name: 'expiredAt', indexed: false },
                             { type: 'address', name: 'hook', indexed: false },
                         ],
                     },
                     args: { provider: walletAddress as `0x${string}` }
                 }, { maxChunks: 5 })
             ]);

             const allJobIds = Array.from(new Set([
                 ...cLogs.map((l: any) => l.args.jobId?.toString()).filter(Boolean),
                 ...pLogs.map((l: any) => l.args.jobId?.toString()).filter(Boolean),
                 ...(myJobs[walletAddress.toLowerCase()] || []) // Keep existing manually added ones
             ]));
             
             setTotalIndexedJobs(allJobIds.length);

             if (allJobIds.length > 0) {
                 setMyJobs(walletAddress, allJobIds as string[]);
             }
         } catch (e) {
             console.error("Job fetching fail:", e);
         } finally {
             setIsFetchingJobs(false);
         }
     };

     fetchJobs();
  }, [walletAddress, store.escrowAddress]);

  const myTxs = transactions.filter(t => t.from.toLowerCase() === walletAddress?.toLowerCase()).slice(0, 5);
  const activeJobs = walletAddress ? (myJobs[walletAddress.toLowerCase()] || []) : [];

  useEffect(() => {
    if (!walletAddress || activeJobs.length === 0) return;
    const publicClient = getPublicClient() as any;
    if (!publicClient) return;

    let mounted = true;
    let timeoutId: NodeJS.Timeout;

    const fetchStatuses = async () => {
      if (!mounted) return;
      const statuses: Record<string, number> = {};
      try {
        const batch = activeJobs.map(async (id: string) => {
           try {
               const job = await (publicClient as any).readContract({
                 address: store.escrowAddress as `0x${string}`,
                 abi: escrowAbi,
                 functionName: 'getJob',
                 args: [BigInt(id)]
               });
               return { id, status: job.status };
           } catch { return { id, status: null }; }
        });
        const results = await Promise.all(batch);
        if (mounted) {
          setJobStatuses(prev => {
             const newStatuses = { ...prev };
             let changed = false;
             for (const r of results) {
                 if (r.status !== null) {
                     if (prev[r.id] !== undefined && prev[r.id] !== r.status) {
                         // Status changed!
                         if (useAppStore.getState().notificationsEnabled && 'Notification' in window) {
                             if (Notification.permission === 'granted') {
                                 const statusNames = ['Pending', 'Active', 'Review', 'Completed', 'Rejected', 'Expired'];
                                 new Notification(`Job #${r.id} Updated`, {
                                     body: `Status changed to ${statusNames[r.status] || r.status}`,
                                     icon: '/favicon.ico'
                                 });
                             }
                         }
                     }
                     newStatuses[r.id] = r.status;
                     if (prev[r.id] !== r.status) changed = true;
                 }
             }
             return changed ? newStatuses : prev;
          });
        }
      } catch (e) {
        console.error("fetch status error", e);
      } finally {
        if (mounted) {
            timeoutId = setTimeout(fetchStatuses, 15000); // Poll every 15 seconds
        }
      }
    };
    fetchStatuses();
    return () => { 
        mounted = false; 
        if (timeoutId) clearTimeout(timeoutId);
    };
  }, [activeJobs.join(','), getPublicClient, store.escrowAddress, walletAddress]);

  const getStatusTag = (status?: number) => {
    if (status === undefined || status === null) return null;
    switch (status) {
        case 0: return <span className="px-1.5 py-0.5 rounded-sm bg-stone-800 text-[9px] text-stone-300 font-bold uppercase tracking-wider">Pending</span>;
        case 1: return <span className="px-1.5 py-0.5 rounded-sm bg-amber-500/10 text-[9px] text-amber-500 border border-amber-500/20 font-bold uppercase tracking-wider">Active</span>;
        case 2: return <span className="px-1.5 py-0.5 rounded-sm bg-blue-500/10 text-[9px] text-blue-400 border border-blue-500/20 font-bold uppercase tracking-wider">Review</span>;
        case 3: return <span className="px-1.5 py-0.5 rounded-sm bg-green-500/10 text-[9px] text-green-500 border border-green-500/20 font-bold uppercase tracking-wider">Completed</span>;
        case 4: return <span className="px-1.5 py-0.5 rounded-sm bg-red-500/10 text-[9px] text-red-500 border border-red-500/20 font-bold uppercase tracking-wider">Rejected</span>;
        case 5: return <span className="px-1.5 py-0.5 rounded-sm bg-stone-800/80 text-[9px] text-stone-500 border border-stone-700 font-bold uppercase tracking-wider">Expired</span>;
        default: return null;
    }
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#050505] font-sans text-stone-200">
       <header className="flex h-16 items-center justify-between border-b border-subtle px-8 shrink-0">
         <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded bg-amber-600 flex items-center justify-center">
              <span className="font-serif-display text-xl font-bold text-black">A</span>
            </div>
            <span className="text-lg font-medium tracking-tight">ARCO <span className="opacity-50">AGENT</span></span>
         </div>
         <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-widest text-amber-500/80">Network Status</span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500"></div>
                <span className="text-sm font-medium">Arc Testnet</span>
              </div>
            </div>
            <div className="h-10 w-px bg-stone-800"></div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowMobileMenu(true)}
                className="flex md:hidden items-center justify-center h-9 w-9 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-full transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
              {walletAddress && (
                <button 
                  onClick={() => setShowHistory(true)}
                  className="flex items-center justify-center h-9 w-9 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-full transition-colors"
                  title="Transaction History"
                >
                  <History className="w-4 h-4" />
                </button>
              )}
              <button 
                onClick={() => setShowSettings(true)}
                className="flex items-center justify-center h-9 w-9 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-full transition-colors"
                title="App Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <WalletButton />
            </div>
         </div>
       </header>

       <main className="flex flex-1 overflow-hidden">
          
          {/* Mobile Overlay Menu */}
          {showMobileMenu && (
            <div className="fixed inset-0 bg-black/80 z-50 flex md:hidden" onClick={() => setShowMobileMenu(false)}>
               <div className="w-64 bg-stone-950 h-full p-6 flex flex-col border-r border-stone-800" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-8">
                     <span className="font-serif-display font-bold text-amber-500 text-xl">Arco</span>
                     <button onClick={() => setShowMobileMenu(false)} className="text-stone-400 p-2"><X className="w-5 h-5"/></button>
                  </div>
                  <div className="space-y-4">
                    <button onClick={() => { setCurrentView('escrow'); setShowMobileMenu(false); }} className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-lg ${currentView === 'escrow' ? 'bg-amber-600/10 text-amber-500' : 'text-stone-400'}`}><Briefcase className="w-5 h-5" /> Escrow Jobs</button>
                    <button onClick={() => { setCurrentView('feed'); setShowMobileMenu(false); }} className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-lg ${currentView === 'feed' ? 'bg-amber-600/10 text-amber-500' : 'text-stone-400'}`}><Activity className="w-5 h-5" /> Explorer Feed</button>
                    <button onClick={() => { setCurrentView('agents'); setShowMobileMenu(false); }} className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-lg ${currentView === 'agents' ? 'bg-amber-600/10 text-amber-500' : 'text-stone-400'}`}><Bot className="w-5 h-5" /> ERC-8004 Agents</button>
                    <button onClick={() => { setCurrentView('circle'); setShowMobileMenu(false); }} className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-lg ${currentView === 'circle' ? 'bg-amber-600/10 text-amber-500' : 'text-stone-400'}`}><Activity className="w-5 h-5" /> Circle SDK Test</button>
                  </div>
               </div>
            </div>
          )}

          {/* Left Sidebar */}
          <aside className="w-72 border-r border-subtle p-6 overflow-y-auto shrink-0 hidden md:block">
            <div className="space-y-8">
              <section>
                <h3 className="mb-4 text-[10px] uppercase tracking-widest text-stone-500">Navigation</h3>
                <div className="space-y-2">
                  <button 
                    onClick={() => setCurrentView('escrow')}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded ${currentView === 'escrow' ? 'bg-amber-600/10 text-amber-500' : 'text-stone-400 hover:bg-stone-900/50 hover:text-stone-200'}`}
                  >
                    <Briefcase className="w-4 h-4" />
                    Escrow Jobs
                  </button>
                  <button 
                    onClick={() => setCurrentView('feed')}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded ${currentView === 'feed' ? 'bg-amber-600/10 text-amber-500' : 'text-stone-400 hover:bg-stone-900/50 hover:text-stone-200'}`}
                  >
                    <Activity className="w-4 h-4" />
                    Explorer Feed
                  </button>
                  <button 
                    onClick={() => setCurrentView('agents')}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded ${currentView === 'agents' ? 'bg-amber-600/10 text-amber-500' : 'text-stone-400 hover:bg-stone-900/50 hover:text-stone-200'}`}
                  >
                    <Bot className="w-4 h-4" />
                    ERC-8004 Agents
                  </button>
                  <button 
                    onClick={() => setCurrentView('circle')}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded ${currentView === 'circle' ? 'bg-amber-600/10 text-amber-500' : 'text-stone-400 hover:bg-stone-900/50 hover:text-stone-200'}`}
                  >
                    <Activity className="w-4 h-4" />
                    Circle SDK Test
                  </button>
                </div>
              </section>

              <section>
                <h3 className="mb-4 text-[10px] uppercase tracking-widest text-stone-500">Assets & Liquidity</h3>
                <BalanceWidget />
              </section>
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] uppercase tracking-widest text-stone-500">My Jobs</h3>
                  {isFetchingJobs && <RefreshCw className="w-3 h-3 text-amber-500 animate-spin" />}
                </div>
                <div className="space-y-2">
                  {activeJobs.length === 0 ? (
                      <div className="text-xs text-stone-500 italic p-3 rounded-lg border border-subtle bg-stone-900/20">
                         No active jobs found...
                      </div>
                  ) : (
                      activeJobs.map((id) => (
                          <div key={id} 
                               onClick={() => store.setJobId(id.toString())}
                               className={`group cursor-pointer p-3 rounded-lg border ${store.jobId === id ? 'border-amber-600/50 bg-stone-900/60' : 'border-stone-800 bg-stone-900/30 hover:border-stone-600'} transition-colors`}>
                             <div className="flex justify-between items-center mb-1">
                               <div className="flex items-center gap-2">
                                 <div className="flex items-center gap-1.5">
                                   <div className="text-xs font-bold text-stone-200">JOB #{id}</div>
                                   <button 
                                     onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(id.toString()); }}
                                     className="text-stone-500 hover:text-amber-500 transition-colors"
                                     title="Copy Job ID"
                                   >
                                     <Copy className="w-3 h-3" />
                                   </button>
                                 </div>
                                 {getStatusTag(jobStatuses[id])}
                               </div>
                               <button
                                 onClick={(e) => {
                                     e.stopPropagation();
                                     if (!walletAddress) return;
                                     const newList = activeJobs.filter(j => j !== id);
                                     setMyJobs(walletAddress, newList);
                                     if (store.jobId === id.toString()) store.setJobId(null);
                                 }}
                                 className="text-stone-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"
                                 title="Remove from sidebar"
                               >
                                 <X className="w-3 h-3" />
                               </button>
                             </div>
                             <div className="text-[10px] text-stone-500">Click to view details</div>
                          </div>
                      ))
                  )}
                  <form onSubmit={(e) => {
                      e.preventDefault();
                      const val = new FormData(e.currentTarget).get('jobid') as string;
                      if (/^\d+$/.test(val)) {
                          store.setJobId(val);
                          if (walletAddress) addMyJob(walletAddress, val);
                      }
                      e.currentTarget.reset();
                  }} className="mt-4 pt-4 border-t border-stone-800 flex items-center gap-2">
                       <input type="text" name="jobid" placeholder="Load by ID..." className="flex-1 rounded border border-subtle bg-stone-950 px-2.5 py-1.5 text-xs text-stone-200 outline-none focus:border-amber-600" />
                       <button type="submit" className="shrink-0 px-3 py-1.5 rounded bg-stone-800 text-xs text-stone-300 hover:bg-stone-700 hover:text-white transition-colors">Load</button>
                  </form>
                </div>
              </section>
            </div>
          </aside>

          {/* Main Content */}
          <section className="flex-1 overflow-y-auto p-4 sm:p-8">
            {!walletAddress ? (
              <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center border border-subtle bg-stone-900/20 p-12 rounded-2xl">
                 <div className="h-16 w-16 rounded-full bg-amber-600/10 flex items-center justify-center mb-6">
                    <Shield className="w-8 h-8 text-amber-500" />
                 </div>
                 <h2 className="text-2xl font-serif-display text-stone-100 mb-2">Welcome to Arco Agent</h2>
                 <p className="text-stone-500 mb-8 text-sm leading-relaxed">
                   A production-quality dApp implementing an Agentic Escrow workflow on Arc Testnet.
                   Connect your Web3 wallet to continue.
                 </p>
                 <WalletButton />
              </div>
            ) : (
              currentView === 'circle' ? <CircleIntegrationTest /> : currentView === 'agents' ? <AgentsPage /> : (currentView === 'feed' ? <JobFeed onSelectJob={(id) => { store.setJobId(id); setCurrentView('escrow'); }} /> : <ERC8183Card />)
            )}
          </section>

          {/* Right Sidebar */}
          <aside className="w-72 border-l border-subtle bg-stone-900/20 p-6 shrink-0 hidden lg:flex flex-col">
            <h3 className="mb-6 text-[10px] uppercase tracking-widest text-stone-500">Audit Log</h3>
            <div className="flex-1 space-y-6 overflow-y-auto pr-2">
               {myTxs.length === 0 ? (
                 <div className="text-xs text-stone-600 italic">No recent transactions.</div>
               ) : (
                 myTxs.map((tx, idx) => (
                    <div key={`${tx.hash}-${idx}`} className={`relative pl-4 border-l ${idx === 0 ? 'border-stone-600' : 'border-stone-800 opacity-60'}`}>
                      <div className={`absolute -left-[5px] top-1 h-2 w-2 rounded-full ${tx.status === 'success' ? 'bg-green-500' : tx.status === 'pending' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'}`}></div>
                      <div className="text-xs font-medium text-stone-300">{tx.action}</div>
                      <div className="text-[10px] text-stone-500 font-mono mt-1 w-full truncate cursor-pointer hover:text-stone-300 transition-colors" title={tx.hash} onClick={() => window.open(`${arcTestnet.blockExplorers.default.url}/tx/${tx.hash}`)}>
                        {tx.hash.substring(0, 10)}...{tx.hash.substring(tx.hash.length - 8)}
                      </div>
                      <div className="mt-1 text-[9px] text-stone-600">{new Date(tx.timestamp).toLocaleTimeString()}</div>
                    </div>
                 ))
               )}
            </div>
            
            <div className="mt-auto pt-6">
              <div className="rounded-lg border border-subtle bg-stone-900/50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="w-3 h-3 text-amber-500" />
                  <span className="text-[10px] font-bold text-amber-500">NETWORK</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] text-stone-500"><span>Jobs Indexed</span><span className="text-stone-300 font-medium">{totalIndexedJobs} Local</span></div>
                </div>
              </div>
            </div>
          </aside>
       </main>

       <footer className="flex h-10 shrink-0 items-center justify-center border-t border-subtle bg-stone-950 px-8 hidden sm:flex">
         <p className="text-[10px] text-stone-500 uppercase tracking-[0.2em]">
           {store.jobId !== null ? `Active Job Escrow ID: ` : 'Awaiting initialization ' } 
           {store.jobId !== null && <span className="text-stone-400 font-mono">{store.jobId}</span>}
         </p>
       </footer>

       <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
       <TxHistoryModal isOpen={showHistory} onClose={() => setShowHistory(false)} />
       <ToastStack />
    </div>
  );
}
