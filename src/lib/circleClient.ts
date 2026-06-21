export async function createCircleWallet() {
  const res = await fetch("/api/circle/wallet", {
    method: "POST"
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create Circle wallet");
  }
  return res.json();
}

export async function getCircleWalletBalance(walletId: string) {
  const res = await fetch(`/api/circle/wallet/${walletId}/balance`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to get balance");
  }
  return res.json();
}

export async function transferCircleTokens(walletId: string, destinationAddress: string, amount: string, tokenId: string) {
  const res = await fetch(`/api/circle/wallet/${walletId}/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destinationAddress, amount, tokenId })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to transfer tokens");
  }
  return res.json();
}
