import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, Loader2, Eye } from 'lucide-react';
import { useMnemonic } from '../hooks/useMnemonic';
import { normalizeHash } from '../lib/mnemonicMap';

interface Props {
  /** The on-chain bytes32 / blake3 hash to verify (with or without 0x). */
  expectedHash?: string;
  /** The on-chain URI (arweave_url or mnemonic://<hash>). */
  uri?: string;
  /** Semantic query used to recall the backing memory in local mode. */
  query: string;
  label?: string;
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; content: string; signer?: string; anchored: boolean }
  | { kind: 'mismatch' }
  | { kind: 'error'; msg: string };

/** Extract an Arweave tx id from an arweave URL, if the URI is one. */
function arweaveTxFromURI(uri?: string): string | undefined {
  if (!uri) return undefined;
  const m = uri.match(/arweave\.net\/([A-Za-z0-9_-]{20,})/);
  return m?.[1];
}

/**
 * Reveal-and-verify affordance for a Mnemonic-backed on-chain pointer. Verifies
 * by anchor tx when available (participate mode), else recalls the memory and
 * matches it against the on-chain hash (works in free local mode too).
 */
export function MnemonicVerify({ expectedHash, uri, query, label = 'Reveal & verify' }: Props) {
  const { recall, verify } = useMnemonic();
  const [state, setState] = useState<State>({ kind: 'idle' });

  const run = async () => {
    setState({ kind: 'loading' });
    try {
      const want = expectedHash ? normalizeHash(expectedHash) : undefined;
      const arweaveTx = arweaveTxFromURI(uri);

      // 1) Authoritative path: verify against the anchored artifact.
      if (arweaveTx) {
        const v = await verify({ expected_hash: want, arweave_tx: arweaveTx });
        const verified = v.status === 'verified' || v.verified === true;
        if (verified) {
          setState({
            kind: 'ok',
            content: (v as any).content_preview || '(anchored — open the URI to read)',
            signer: (v as any).signer,
            anchored: true,
          });
          return;
        }
        setState({ kind: 'mismatch' });
        return;
      }

      // 2) Local path: recall the memory and match it to the on-chain hash.
      const hits = await recall(query);
      const match = want
        ? hits.find((h) => normalizeHash(h.content_hash) === want)
        : hits[0];
      if (match) {
        const anchored = !!(match.solana_tx && !match.solana_tx.startsWith('local:'));
        setState({ kind: 'ok', content: match.content, anchored });
      } else {
        setState({ kind: 'mismatch' });
      }
    } catch (e: any) {
      setState({ kind: 'error', msg: e?.message || 'Verification failed' });
    }
  };

  if (state.kind === 'ok') {
    return (
      <div className="mt-2 rounded-md border border-green-500/30 bg-green-500/5 p-3">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-green-500">
          <ShieldCheck className="w-3.5 h-3.5" />
          {state.anchored ? 'Verified — anchored & signed' : 'Verified — matches signed memory'}
        </div>
        {state.signer && (
          <div className="mt-1 text-[10px] font-mono text-stone-500 break-all">signer: {state.signer}</div>
        )}
        <div className="mt-2 whitespace-pre-wrap text-xs text-stone-300">{state.content}</div>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button
        onClick={run}
        disabled={state.kind === 'loading'}
        className="inline-flex items-center gap-1.5 rounded border border-stone-700 bg-stone-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400 hover:text-amber-500 hover:border-amber-600/40 transition-colors disabled:opacity-50"
      >
        {state.kind === 'loading' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
        {state.kind === 'loading' ? 'Verifying…' : label}
      </button>
      {state.kind === 'mismatch' && (
        <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-500">
          <ShieldAlert className="w-3 h-3" /> No matching signed memory
        </span>
      )}
      {state.kind === 'error' && (
        <span className="ml-2 text-[10px] text-red-500">{state.msg}</span>
      )}
    </div>
  );
}
