import { useState } from 'react';
import { useWallet } from './useWallet';
import { addresses, reputationAbi } from '../lib/contracts';
import { useAppStore } from '../store';
import { keccak256, toHex, encodePacked, stringToHex } from 'viem';

export function useAgentReputation() {
  const { getPublicClient, getWalletClient, walletAddress } = useWallet();
  const { addTransaction, updateTransaction } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);

  const giveFeedback = async (agentId: string, score: number, tag: string) => {
    setIsLoading(true);
    try {
      const publicClient = getPublicClient();
      const walletClient = getWalletClient();
      if (!publicClient || !walletClient || !walletAddress) throw new Error('Client not ready');

      const feedbackHash = keccak256(toHex(tag || 'none'));

      const { request } = await (publicClient as any).simulateContract({
        address: addresses.reputationRegistry,
        abi: reputationAbi,
        functionName: 'giveFeedback',
        args: [BigInt(agentId), BigInt(score), 0, tag, "", "", "", feedbackHash],
        account: walletAddress as `0x${string}`
      });

      const hash = await (walletClient as any).writeContract(request);
      addTransaction({ hash, action: 'Give Feedback', timestamp: Date.now(), status: 'pending', chainId: 5042002, from: walletAddress });
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      updateTransaction(hash, { status: receipt.status === 'success' ? 'success' : 'reverted' });

      return receipt.status === 'success';
    } catch (e) {
      console.error(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  return { giveFeedback, isLoading };
}
