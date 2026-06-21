import { getCircleClient } from "./client.js";
import crypto from "crypto";

export async function createWallet() {
  const client = getCircleClient();
  
  const response = await client.createWallets({
    accountType: "EOA",
    blockchains: ["ARC-TESTNET"],
    count: 1,
    walletSetId: process.env.CIRCLE_WALLET_SET_ID || "dummy-set",
    idempotencyKey: crypto.randomUUID()
  });
  return response.data;
}
