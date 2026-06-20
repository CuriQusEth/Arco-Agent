import { useAppStore } from '../store';
import { X, ExternalLink, CheckCircle, Clock, AlertTriangle, Trash2 } from 'lucide-react';
import { arcTestnet } from '../lib/contracts';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function TxHistoryModal({ isOpen, onClose }: Props) {
  const { transactions, clearTransactions, walletAddress } = useAppStore();

  if (!isOpen) return null;

  const myTxs = transactions.filter(t => t.from.toLowerCase() === walletAddress?.toLowerCase());

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'pending': return <Clock className="w-5 h-5 text-amber-500" />;
      case 'reverted': return <AlertTriangle className="w-5 h-5 text-red-500" />;
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#050505]/80 backdrop-blur-sm">
      <div className="bg-stone-900 border border-stone-800 rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800">
          <h2 className="text-lg font-semibold text-stone-100">Transaction History</h2>
          <button onClick={onClose} className="p-2 text-stone-500 hover:text-stone-300 rounded-lg hover:bg-stone-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          {myTxs.length === 0 ? (
            <div className="text-center py-8 text-stone-500 italic text-sm">
              No transactions found for this address.
            </div>
          ) : (
            <div className="space-y-3">
              {myTxs.map((tx, idx) => (
                <div key={`${tx.hash}-${idx}`} className="flex flex-col p-4 bg-stone-950 rounded-lg border border-stone-800/50">
                  <div className="flex items-center justify-between mb-2">
                     <div className="flex items-center gap-2">
                        {getStatusIcon(tx.status)}
                        <span className="font-medium text-stone-300">{tx.action}</span>
                     </div>
                     <span className="text-xs text-stone-500">{new Date(tx.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                     <div className="text-xs font-mono text-stone-500 truncate mr-4">
                        {tx.hash}
                     </div>
                     <a href={`${arcTestnet.blockExplorers.default.url}/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-medium text-amber-500 hover:text-amber-400 transition-colors shrink-0">
                        View <ExternalLink className="w-3 h-3" />
                     </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {myTxs.length > 0 && (
          <div className="p-4 border-t border-stone-800 bg-stone-950/50 flex justify-between">
            <button 
              onClick={() => {
                const csvData = [
                  ['Action', 'Hash', 'Status', 'Timestamp'],
                  ...myTxs.map(t => [t.action, t.hash, t.status, new Date(t.timestamp).toISOString()])
                ].map(e => e.join(",")).join("\n");
                const blob = new Blob([csvData], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `transactions-${walletAddress?.slice(0,6)}.csv`;
                a.click();
                window.URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-stone-300 hover:text-white border border-stone-700 bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors"
            >
              Export CSV
            </button>
            <button 
              onClick={clearTransactions}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Clear History
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
