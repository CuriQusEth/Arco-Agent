// Ad-hoc check for the Mnemonic ⇄ on-chain mapping helpers.
// Run: npx tsx test-mnemonic-map.ts
import assert from 'node:assert';
import { toBytes32, toRecallURI, normalizeHash } from './src/lib/mnemonicMap';

const blake3 = 'a'.repeat(64);

// toBytes32: valid 64-hex → 0x-prefixed, lowercased
assert.equal(toBytes32(blake3), `0x${blake3}`);
assert.equal(toBytes32(`0x${'A'.repeat(64)}`), `0x${'a'.repeat(64)}`);

// toBytes32: reject wrong length (e.g. sha256 truncation / padded) and non-hex
assert.throws(() => toBytes32('abc'), /not a 32-byte/);
assert.throws(() => toBytes32('z'.repeat(64)), /not a 32-byte/);
assert.throws(() => toBytes32('a'.repeat(63)), /not a 32-byte/);

// toRecallURI: prefers durable arweave_url, else mnemonic:// deeplink
assert.equal(
  toRecallURI({ content_hash: blake3, arweave_url: 'https://arweave.net/abc' }),
  'https://arweave.net/abc',
);
assert.equal(toRecallURI({ content_hash: blake3 }), `mnemonic://${blake3}`);

// normalizeHash strips 0x and lowercases
assert.equal(normalizeHash(`0x${'B'.repeat(64)}`), 'b'.repeat(64));

console.log('✓ mnemonicMap: all assertions passed');
