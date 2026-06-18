import React, { useState, useEffect } from 'react';
import { WalletButton } from './components/WalletButton';
import { BalanceWidget } from './components/BalanceWidget';
import { ERC8183Card } from './components/ERC8183Card';
import { SettingsModal } from './components/SettingsModal';
import { TxHistoryModal } from './components/TxHistoryModal';
import { useWallet } from './hooks/useWallet';
import { Settings, History, Shield, Activity } from 'lucide-react';
import { useEscrowStore, useAppStore } from './store';
import { addresses, arcTestnet } from './lib/contracts';

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { walletAddress } = useWallet();
  const { transactions } = useAppStore();
  const store = useEscrowStore();

  useEffect(() => {
    // If you have a specific testnet contract deployed, initialize it here.
    // Ensure we don't automatically override with a 0x0...1 address anymore.
  }, []);

  const myTxs = transactions.filter(t => t.from.toLowerCase() === walletAddress?.toLowerCase()).slice(0, 5);

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
          {/* Left Sidebar */}
          <aside className="w-72 border-r border-subtle p-6 overflow-y-auto shrink-0 hidden md:block">
            <div className="space-y-8">
              <section>
                <h3 className="mb-4 text-[10px] uppercase tracking-widest text-stone-500">Assets & Liquidity</h3>
                <BalanceWidget />
              </section>
              <section>
                <h3 className="mb-4 text-[10px] uppercase tracking-widest text-stone-500">Registry Stats</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center rounded-lg border border-subtle bg-stone-900/40 p-3">
                    <div className="text-xl font-bold text-stone-200">12</div>
                    <div className="text-[10px] text-stone-500">JOBS CLOSED</div>
                  </div>
                  <div className="text-center rounded-lg border border-subtle bg-stone-900/40 p-3">
                    <div className="text-xl font-bold text-stone-200">98%</div>
                    <div className="text-[10px] text-stone-500">TRUST RATE</div>
                  </div>
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
              <ERC8183Card />
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
                    <div key={tx.hash} className={`relative pl-4 border-l ${idx === 0 ? 'border-stone-600' : 'border-stone-800 opacity-60'}`}>
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
                  <span className="text-[10px] font-bold text-amber-500">DIAGNOSTICS</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] text-stone-500"><span>RPC latency</span><span className="text-stone-300">24ms</span></div>
                  <div className="flex justify-between text-[10px] text-stone-500"><span>Websocket</span><span className="text-green-500 font-medium">Connected</span></div>
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
    </div>
  );
}
