import { useState } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useAppStore } from '../store';
import { arcTestnet } from '../lib/contracts';
import { Wallet, LogOut, AlertCircle, X } from 'lucide-react';

export function WalletButton() {
  const [showOptions, setShowOptions] = useState(false);
  const { walletAddress, chainId } = useAppStore();
  const { connect, disconnect, switchToArcTestnet, isConnecting, providers } = useWallet();

  const formatAddress = (addr: string) => {
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  const handleConnect = (prov?: any) => {
     setShowOptions(false);
     connect(prov);
  };

  if (!walletAddress) {
    return (
      <div className="relative">
        <button
          onClick={() => providers.length > 0 ? setShowOptions(!showOptions) : handleConnect()}
          disabled={isConnecting}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black rounded font-bold transition-colors disabled:opacity-75 disabled:cursor-not-allowed text-sm"
        >
          <Wallet className="w-4 h-4" />
          {isConnecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
        {showOptions && providers.length > 0 && (
          <div className="absolute top-12 right-0 w-64 bg-stone-900 border border-stone-700 rounded-lg shadow-xl p-2 z-50">
            <div className="flex justify-between items-center mb-2 px-2 pt-1">
               <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">Select Wallet</span>
               <button onClick={()=>setShowOptions(false)} className="text-stone-500 hover:text-stone-300"><X className="w-4 h-4"/></button>
            </div>
            {providers.map(p => (
               <button 
                  key={p.info.uuid} 
                  onClick={() => handleConnect(p.provider)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-stone-800 rounded transition-colors text-left"
               >
                  {p.info.icon && <img src={p.info.icon} alt={p.info.name} className="w-6 h-6 rounded" />}
                  <span className="text-stone-200 font-medium">{p.info.name}</span>
               </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const isWrongNetwork = chainId !== arcTestnet.id;

  return (
    <div className="flex items-center gap-3">
      {isWrongNetwork && (
        <button
          onClick={switchToArcTestnet}
          className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-full font-medium transition-colors text-xs"
        >
          <AlertCircle className="w-3.5 h-3.5" />
          Switch Network
        </button>
      )}

      <div className="flex items-center rounded-full border border-stone-700 bg-stone-900 transition-colors hover:border-stone-500 text-sm overflow-hidden pl-4 pr-1 py-1 gap-2">
        <span className="font-mono text-stone-400">
          {formatAddress(walletAddress)}
        </span>
        <button
          onClick={disconnect}
          className="p-1 hover:bg-stone-800 text-stone-500 hover:text-amber-500 rounded-full transition-colors flex items-center justify-center shrink-0"
          title="Disconnect"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
