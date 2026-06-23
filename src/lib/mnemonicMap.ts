/**
 * Mapping helpers between Mnemonic memory artifacts and the on-chain pointer
 * fields of ERC-8004 / ERC-8183.
 *
 * A Mnemonic `content_hash` is a blake3 digest = 32 bytes = 64 hex chars, so it
 * maps 1:1 onto an EVM `bytes32`. This is the load-bearing invariant: the value
 * written on-chain MUST equal `0x` + the blake3 hash of the exact signed text,
 * so that anyone can recall the content and recompute the hash to verify it.
 */

export interface MnemonicArtifact {
  content_hash: string;
  arweave_url?: string;
  solana_tx?: string;
  arweave_tx?: string;
}

/** Coerce a Mnemonic blake3 `content_hash` into a strict `0x`-prefixed bytes32. */
export function toBytes32(contentHash: string): `0x${string}` {
  const h = contentHash.startsWith('0x') ? contentHash.slice(2) : contentHash;
  if (h.length !== 64 || !/^[0-9a-fA-F]+$/.test(h)) {
    throw new Error(`content_hash is not a 32-byte hex digest: ${contentHash}`);
  }
  return `0x${h.toLowerCase()}` as `0x${string}`;
}

/**
 * Resolvable handle to store in the *string* URI fields
 * (`description`, `feedbackURI`, `requestURI`, `responseURI`). Prefers the
 * durable Arweave URL when anchored; falls back to a `mnemonic://` deeplink
 * keyed by the content hash (resolvable via recall/verify).
 */
export function toRecallURI(artifact: MnemonicArtifact): string {
  return artifact.arweave_url || `mnemonic://${normalizeHash(artifact.content_hash)}`;
}

/** Strip a leading `0x` so a hash can be compared / used as a recall key. */
export function normalizeHash(hash: string): string {
  return (hash.startsWith('0x') ? hash.slice(2) : hash).toLowerCase();
}
