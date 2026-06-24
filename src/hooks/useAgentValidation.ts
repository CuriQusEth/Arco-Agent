import { useState } from 'react';
import { useWallet } from './useWallet';
import { addresses, validationAbi } from '../lib/contracts';
import { useAppStore } from '../store';
import { keccak256, toHex } from 'viem';

export function useAgentValidation() {
  const { getPublicClient, getWalletClient, walletAddress } = useWallet();
  const { addTransaction, updateTransaction } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);

  const requestValidation = async (validator: string, agentId: string, requestURI: string, requestHashStr: string) => {
    setIsLoading(true);
    try {
      const publicClient = getPublicClient();
      const walletClient = getWalletClient();
      if (!publicClient || !walletClient || !walletAddress) throw new Error('Client not ready');

      let requestHash = requestHashStr;
      if (!requestHash.startsWith('0x')) {
          requestHash = keccak256(toHex(requestHashStr));
      }

      const { request } = await (publicClient as any).simulateContract({
        address: addresses.validationRegistry,
        abi: validationAbi,
        functionName: 'validationRequest',
        args: [validator, BigInt(agentId), requestURI, requestHash],
        account: walletAddress as `0x${string}`
      });

      const hash = await (walletClient as any).writeContract(request);
      addTransaction({ hash, action: 'Request Validation', timestamp: Date.now(), status: 'pending', chainId: 5042002, from: walletAddress });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      updateTransaction(hash, { status: receipt.status === 'success' ? 'success' : 'reverted' });
      return requestHash;
    } catch (e) {
      console.error(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  const submitValidationResponse = async (
    requestHash: string,
    responseScore: number,
    tag: string,
    responseURI?: string,
    responseHash?: `0x${string}`,
  ) => {
    setIsLoading(true);
    try {
      const publicClient = getPublicClient();
      const walletClient = getWalletClient();
      if (!publicClient || !walletClient || !walletAddress) throw new Error('Client not ready');

      // Prefer the Mnemonic-backed verifiable hash/URI for the validator report;
      // fall back to the legacy keccak placeholder otherwise.
      const resolvedHash = responseHash || keccak256(toHex(tag + responseScore));
      const resolvedURI = responseURI || "";

      const { request } = await (publicClient as any).simulateContract({
        address: addresses.validationRegistry,
        abi: validationAbi,
        functionName: 'validationResponse',
        args: [requestHash, responseScore, resolvedURI, resolvedHash, tag],
        account: walletAddress as `0x${string}`
      });

      const hash = await (walletClient as any).writeContract(request);
      addTransaction({ hash, action: 'Validation Reponse', timestamp: Date.now(), status: 'pending', chainId: 5042002, from: walletAddress });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      updateTransaction(hash, { status: receipt.status === 'success' ? 'success' : 'reverted' });
    } catch(e) {
        throw e;
    } finally {
        setIsLoading(false);
    }
  };

  const getValidationStatus = async (requestHash: string) => {
    const publicClient = getPublicClient();
    if (!publicClient) return null;
    try {
       const status = await (publicClient as any).readContract({
         address: addresses.validationRegistry,
         abi: validationAbi,
         functionName: 'getValidationStatus',
         args: [requestHash]
       });
       return status;
    } catch (e) { 
       return null; 
    }
  };

  return { requestValidation, submitValidationResponse, getValidationStatus, isLoading };
}
