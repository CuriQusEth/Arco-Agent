import { getCircleClient } from "./client.js";
import crypto from "crypto";

export async function transferTokens(walletId: string, destinationAddress: string, amount: string, tokenId: string) {
  const client = getCircleClient();
  const response = await client.createTransaction({
    walletId: walletId,
    tokenId: tokenId,
    destinationAddress: destinationAddress,
    amount: [amount],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: crypto.randomUUID()
  });
  return response.data;
}
