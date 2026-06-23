import React, { useState } from 'react';
import { useEscrowStore, useAppStore } from '../store';
import { X, Check } from 'lucide-react';
import { addresses } from '../lib/contracts';
import { isAddress, getAddress } from 'viem';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: Props) {
  const store = useEscrowStore();
  const { notificationsEnabled, setNotificationsEnabled, mnemonicMode, setMnemonicMode } = useAppStore();
  const [addrInput, setAddrInput] = useState(store.escrowAddress || addresses.defaultEscrow || '');
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  if (!isOpen) return null;

  const handleToggleNotifications = async () => {
    if (!notificationsEnabled) {
      if ('Notification' in window) {
         try {
           const permission = await Notification.requestPermission();
           if (permission === 'granted') {
             setNotificationsEnabled(true);
           }
         } catch(e) { }
      }
    } else {
      setNotificationsEnabled(false);
    }
  };

  const handleSave = () => {
    const clean = addrInput.replace(/[\s\u200B-\u200D\uFEFF]/g, '');
    if (!isAddress(clean, { strict: false })) {
      setErr("Invalid checksum or format.");
      return;
    }
    setErr('');
    store.setEscrowAddress(getAddress(clean));
    setSaved(true);
    setTimeout(() => {setSaved(false); onClose();}, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#050505]/80 backdrop-blur-sm">
      <div className="bg-stone-900 border border-stone-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800">
          <h2 className="text-lg font-semibold text-stone-100">App Settings</h2>
          <button onClick={onClose} className="p-2 text-stone-500 hover:text-stone-300 rounded-lg hover:bg-stone-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6">
           <div className="space-y-6">
               <div>
                  <label className="block text-sm font-medium text-stone-300 mb-1">Target Escrow Contract</label>
                  <div className="text-xs text-stone-500 mb-2">Must be a verified ERC-8183 style contract on Arc Testnet.</div>
                  <input 
                    type="text" 
                    value={addrInput}
                    onChange={e => {setAddrInput(e.target.value); setErr('')}}
                    className="w-full px-3 py-2 border border-stone-700 bg-stone-950 text-stone-200 rounded-md shadow-sm focus:ring-amber-500/50 focus:border-amber-500/50 sm:text-sm font-mono outline-none"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"  
                  />
                  {err && <div className="text-red-500 text-xs mt-1">{err}</div>}
               </div>

               <div>
                 <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-stone-300">Browser Notifications</div>
                      <div className="text-xs text-stone-500">Get alerted for job status changes.</div>
                    </div>
                    <button 
                       onClick={handleToggleNotifications}
                       className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 ${notificationsEnabled ? 'bg-amber-500' : 'bg-stone-700'}`}
                    >
                       <div className={`w-4 h-4 rounded-full bg-white transition-transform ${notificationsEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                 </div>
               </div>

               <div>
                 <div className="text-sm font-medium text-stone-300 mb-1">Verifiable Memory (Mnemonic)</div>
                 <div className="text-xs text-stone-500 mb-3">
                   Deliverables, evaluations and feedback are signed as Mnemonic memories;
                   the blake3 hash is written on-chain. <span className="text-stone-400">Local</span> is free and offline;
                   <span className="text-stone-400"> Participate</span> anchors on Solana/Arweave (may require confirmation).
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                   {(['local', 'participate'] as const).map((m) => (
                     <button
                       key={m}
                       onClick={() => setMnemonicMode(m)}
                       className={`px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wide border transition-colors ${mnemonicMode === m ? 'border-amber-500 bg-amber-600/10 text-amber-500' : 'border-stone-700 text-stone-400 hover:bg-stone-800'}`}
                     >
                       {m === 'local' ? 'Local (free)' : 'Participate (anchored)'}
                     </button>
                   ))}
                 </div>
               </div>

               <div className="pt-4 flex items-center justify-end gap-3 border-t border-stone-800">
                  <button onClick={onClose} className="px-4 py-2 border border-stone-700 text-stone-400 rounded-md hover:bg-stone-800 font-medium text-sm transition-colors">Cancel</button>
                  <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-black rounded-md hover:bg-amber-500 font-bold text-sm transition-colors">
                    {saved ? <><Check className="w-4 h-4"/> Saved</> : 'Save Contract'}
                  </button>
               </div>
           </div>
        </div>
      </div>
    </div>
  );
}
