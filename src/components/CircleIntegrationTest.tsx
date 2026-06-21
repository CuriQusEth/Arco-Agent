import React, { useState } from 'react';
import { createCircleWallet, getCircleWalletBalance, transferCircleTokens } from '../lib/circleClient.js';

export function CircleIntegrationTest() {
  const [walletId, setWalletId] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [balance, setBalance] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [transferDest, setTransferDest] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [transferResult, setTransferResult] = useState<any>(null);

  const handleCreateWallet = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await createCircleWallet();
      const wallet = data.wallets?.[0];
      if (wallet) {
        setWalletId(wallet.id);
        setAddress(wallet.address);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGetBalance = async () => {
    if (!walletId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getCircleWalletBalance(walletId);
      setBalance(data.tokenBalances);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!walletId || !transferDest || !transferAmount || !tokenId) return;
    setLoading(true);
    setError('');
    try {
      const data = await transferCircleTokens(walletId, transferDest, transferAmount, tokenId);
      setTransferResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-lg p-6 space-y-4 max-w-xl mx-auto my-8">
      <h2 className="text-xl font-bold text-stone-100">Circle SDK Integration Test</h2>
      
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded text-sm break-all">
          Error: {error}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="font-medium text-stone-300">1. Wallet Operations</h3>
        <button 
          onClick={handleCreateWallet} 
          disabled={loading}
          className="px-4 py-2 bg-amber-600 text-black font-medium rounded hover:bg-amber-500 disabled:opacity-50"
        >
          Create New Wallet (ARC-TESTNET)
        </button>
        
        {walletId && (
          <div className="text-sm text-stone-400 mt-2 space-y-1">
            <div><span className="font-semibold">Wallet ID:</span> {walletId}</div>
            <div><span className="font-semibold">Address:</span> {address}</div>
          </div>
        )}
      </div>

      <div className="space-y-2 pt-4 border-t border-stone-800">
        <h3 className="font-medium text-stone-300">2. Balance Check</h3>
        <button 
          onClick={handleGetBalance} 
          disabled={loading || !walletId}
          className="px-4 py-2 bg-stone-700 text-stone-200 font-medium rounded hover:bg-stone-600 disabled:opacity-50"
        >
          Get Balance
        </button>
        
        {balance && (
          <pre className="text-xs text-stone-400 bg-stone-950 p-3 rounded mt-2 overflow-x-auto">
            {JSON.stringify(balance, null, 2)}
          </pre>
        )}
      </div>

      <div className="space-y-4 pt-4 border-t border-stone-800">
        <h3 className="font-medium text-stone-300">3. Transfer USDC/Tokens</h3>
        <div className="space-y-3">
          <input 
            type="text" 
            placeholder="Destination Address" 
            value={transferDest}
            onChange={(e) => setTransferDest(e.target.value)}
            className="w-full bg-stone-950 border border-stone-800 rounded px-3 py-2 text-sm text-stone-200"
          />
          <div className="flex gap-3">
            <input 
              type="text" 
              placeholder="Amount (e.g. 1.5)" 
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              className="flex-1 bg-stone-950 border border-stone-800 rounded px-3 py-2 text-sm text-stone-200"
            />
            <input 
              type="text" 
              placeholder="Token ID (UUID)" 
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              className="flex-1 bg-stone-950 border border-stone-800 rounded px-3 py-2 text-sm text-stone-200"
            />
          </div>
          <button 
            onClick={handleTransfer} 
            disabled={loading || !walletId || !transferDest || !transferAmount || !tokenId}
            className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            Send Tokens
          </button>
        </div>

        {transferResult && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-stone-300 mb-2">Transfer Result:</h4>
            <pre className="text-xs text-stone-400 bg-stone-950 p-3 rounded overflow-x-auto">
              {JSON.stringify(transferResult, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
