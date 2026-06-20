import { useState } from 'react';
import { getAddress, isAddress } from 'viem';
import { useWallet } from './useWallet';
import { addresses, identityAbi } from '../lib/contracts';
import { useAppStore } from '../store';

export function useAgentIdentity() {
  const { getPublicClient, getWalletClient, walletAddress } = useWallet();
  const { addTransaction, updateTransaction } = useAppStore();

  const [isLoading, setIsLoading] = useState(false);

  const registerAgent = async (metadataURI: string) => {
    setIsLoading(true);
    try {
      const publicClient = getPublicClient();
      const walletClient = getWalletClient();
      if (!publicClient || !walletClient || !walletAddress) throw new Error('Client not ready');

      const { request } = await (publicClient as any).simulateContract({
        address: addresses.identityRegistry,
        abi: identityAbi,
        functionName: 'register',
        args: [metadataURI],
        account: walletAddress as `0x${string}`
      });

      const hash = await (walletClient as any).writeContract(request);
      addTransaction({ hash, action: 'Register Agent', timestamp: Date.now(), status: 'pending', chainId: 5042002, from: walletAddress });
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      updateTransaction(hash, { status: receipt.status === 'success' ? 'success' : 'reverted' });

      // parse event to get agentID
      let agentId = null;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === addresses.identityRegistry.toLowerCase()) {
           const logAny = log as any;
           if (logAny.topics && logAny.topics.length === 4) {
             const idHex = logAny.topics[3];
             if (idHex) agentId = BigInt(idHex).toString();
           }
        }
      }
      return agentId;
    } catch (e: any) {
      console.error(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  const getAgentInfo = async (agentId: string) => {
    const publicClient = getPublicClient();
    if (!publicClient) return null;
    try {
      const [owner, uri] = await Promise.all([
        (publicClient as any).readContract({
          address: addresses.identityRegistry,
          abi: identityAbi,
          functionName: 'ownerOf',
          args: [BigInt(agentId)]
        }),
        (publicClient as any).readContract({
          address: addresses.identityRegistry,
          abi: identityAbi,
          functionName: 'tokenURI',
          args: [BigInt(agentId)]
        })
      ]);
      return { owner, uri };
    } catch {
      return null;
    }
  };

  return { registerAgent, getAgentInfo, isLoading };
}
