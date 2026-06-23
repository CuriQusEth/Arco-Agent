import type { WalletClient } from 'viem';

/**
 * Build the signed-message challenge headers expected by the Express backend
 * (`requireAuth` in server.ts). The signature is over
 * `Login to Arco Agent at <timestamp>` and is valid for a 5-minute replay
 * window on the server. Shared by every authenticated `/api/*` call
 * (Mnemonic today; Circle wallet routes can adopt the same helper).
 */
export async function buildAuthHeaders(
  walletClient: WalletClient,
  address: `0x${string}`,
): Promise<Record<string, string>> {
  const timestamp = Date.now().toString();
  const message = `Login to Arco Agent at ${timestamp}`;
  const signature = await walletClient.signMessage({
    account: address,
    message,
  });
  return {
    'x-user-address': address,
    'x-signature': signature,
    'x-timestamp': timestamp,
  };
}
