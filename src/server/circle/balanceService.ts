import { getCircleClient } from "./client.js";

export async function getWalletBalance(walletId: string) {
  const client = getCircleClient();
  const response = await client.getWalletTokenBalance({
    id: walletId
  });
  return response.data;
}
