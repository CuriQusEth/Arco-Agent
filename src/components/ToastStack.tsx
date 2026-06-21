import React, { useEffect, useState, useRef } from 'react';
import { useAppStore } from '../store';
import { arcTestnet } from '../lib/contracts';
import { CheckCircle2, Clock, XCircle, ExternalLink } from 'lucide-react';

export function ToastStack() {
  const { transactions } = useAppStore();
  const [visibleTxs, setVisibleTxs] = useState<string[]>([]);
  const resolvedTimes = useRef<Record<string, number>>({});
  const recentTxs = transactions.slice(0, 5);

  useEffect(() => {
    const updateVisible = () => {
        const now = Date.now();
        const active = recentTxs.filter(tx => {
           if (tx.status === 'pending') {
             delete resolvedTimes.current[tx.hash];
             return true;
           }
           
           if (!resolvedTimes.current[tx.hash]) {
             resolvedTimes.current[tx.hash] = now;
           }
           
           return (now - resolvedTimes.current[tx.hash]) < 5000;
        }).map(t => t.hash);
        
        setVisibleTxs(active);
    };
    
    updateVisible();
    const int = setInterval(updateVisible, 1000);
    return () => clearInterval(int);
  }, [transactions]);

  if (visibleTxs.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
      {recentTxs.filter(tx => visibleTxs.includes(tx.hash)).map(tx => (
        <div 
          key={tx.hash} 
          className="bg-stone-900 border border-stone-700 shadow-xl rounded-lg p-4 w-80 flex gap-3 pointer-events-auto animate-in slide-in-from-right-8 fade-in slide-out-to-right fade-out"
        >
          {tx.status === 'pending' && <Clock className="w-5 h-5 text-amber-500 animate-pulse shrink-0" />}
          {tx.status === 'success' && <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />}
          {tx.status === 'reverted' && <XCircle className="w-5 h-5 text-red-500 shrink-0" />}
          
          <div className="flex-1 min-w-0">
             <div className="text-sm font-bold text-stone-200 truncate">{tx.action}</div>
             <div className="text-xs text-stone-500 mt-0.5">
               {tx.status === 'pending' && 'Confirming on-chain...'}
               {tx.status === 'success' && 'Transaction confirmed.'}
               {tx.status === 'reverted' && 'Transaction reverted.'}
             </div>
          </div>
          
          <a 
            href={`${arcTestnet.blockExplorers.default.url}/tx/${tx.hash}`} 
            target="_blank" 
            rel="noreferrer"
            className="text-stone-500 hover:text-amber-500 transition-colors self-center p-1"
            title="View on Explorer"
          >
             <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      ))}
    </div>
  );
}
