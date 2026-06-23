import { useState, useCallback } from 'react';
import { useWallet } from './useWallet';
import { buildAuthHeaders } from '../lib/authHeaders';
import {
  mnemonicSign,
  mnemonicRecall,
  mnemonicVerify,
  ConfirmationRequiredError,
  SignResult,
  RecallHit,
  VerifyResult,
} from '../lib/mnemonicClient';
import { toBytes32, toRecallURI } from '../lib/mnemonicMap';

export interface SignedForChain {
  bytes32: `0x${string}`;
  uri: string;
  result: SignResult;
}

/**
 * React entry point for verifiable memory. `signForChain` signs content as a
 * Mnemonic memory and returns the on-chain-ready `bytes32` (blake3 hash) plus a
 * resolvable recall URI, so a contract call can embed verifiable provenance in
 * its existing hash/URI fields.
 */
export function useMnemonic() {
  const { getWalletClient, walletAddress } = useWallet();
  const [isSigning, setIsSigning] = useState(false);

  const auth = useCallback(async () => {
    const walletClient = getWalletClient();
    if (!walletClient || !walletAddress) throw new Error('Wallet not connected');
    return buildAuthHeaders(walletClient, walletAddress as `0x${string}`);
  }, [getWalletClient, walletAddress]);

  const signForChain = useCallback(
    async (
      content: string,
      opts: { mode?: 'local' | 'participate'; visibility?: string; confirm?: boolean } = {},
    ): Promise<SignedForChain> => {
      setIsSigning(true);
      try {
        const headers = await auth();
        const result = await mnemonicSign(headers, content, opts);
        return { bytes32: toBytes32(result.content_hash), uri: toRecallURI(result), result };
      } finally {
        setIsSigning(false);
      }
    },
    [auth],
  );

  const recall = useCallback(
    async (query: string): Promise<RecallHit[]> => mnemonicRecall(await auth(), query),
    [auth],
  );

  const verify = useCallback(
    async (payload: {
      content?: string;
      expected_hash?: string;
      solana_tx?: string;
      arweave_tx?: string;
    }): Promise<VerifyResult> => mnemonicVerify(await auth(), payload),
    [auth],
  );

  return { signForChain, recall, verify, isSigning, ConfirmationRequiredError };
}
