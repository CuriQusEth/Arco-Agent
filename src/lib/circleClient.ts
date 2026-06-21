export async function createCircleWallet(walletSetId?: string) {
  const res = await fetch("/api/wallet/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletSetId })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create Circle wallet");
  }
  return res.json();
}

export async function getCircleWalletBalance(walletId: string) {
  const res = await fetch(`/api/wallet/balance?walletId=${walletId}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to get balance");
  }
  return res.json();
}

export async function transferCircleTokens(walletId: string, destinationAddress: string, amount: string, tokenId: string) {
  const res = await fetch(`/api/wallet/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletId, destinationAddress, amount, tokenId })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to transfer tokens");
  }
  return res.json();
}
