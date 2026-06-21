import circlePkg from "@circle-fin/developer-controlled-wallets";
const { initiateDeveloperControlledWalletsClient } = circlePkg;
import crypto from "crypto";

let circleClientInstance: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;

export function getCircleClient() {
  if (!circleClientInstance) {
    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
      throw new Error("CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET environment variables are missing");
    }
    circleClientInstance = initiateDeveloperControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET,
    });
  }
  return circleClientInstance;
}

export async function createWalletSet(name: string) {
  const client = getCircleClient();
  const res = await client.createWalletSet({
    name,
    idempotencyKey: crypto.randomUUID(),
  });
  return res.data;
}

export async function createWallet(walletSetId?: string) {
  const client = getCircleClient();
  const response = await client.createWallets({
    accountType: "EOA",
    blockchains: ["ARC-TESTNET"],
    count: 1,
    walletSetId: walletSetId || process.env.CIRCLE_WALLET_SET_ID || "",
    idempotencyKey: crypto.randomUUID()
  });
  return response.data;
}

export async function getWalletBalance(walletId: string) {
  const client = getCircleClient();
  const response = await client.getWalletTokenBalance({
    id: walletId
  });
  return response.data;
}

export async function sendUSDC(walletId: string, destinationAddress: string, amount: string, tokenId: string) {
  const client = getCircleClient();
  const response = await client.createTransaction({
    walletId: walletId,
    tokenId: tokenId,
    destinationAddress: destinationAddress,
    amount: [amount], // Note: The SDK typically wants amounts (array of strings)
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: crypto.randomUUID()
  });
  return response.data;
}

export async function getTransactionStatus(transactionId: string) {
  const client = getCircleClient();
  const response = await client.getTransaction({ id: transactionId });
  return response.data;
}
