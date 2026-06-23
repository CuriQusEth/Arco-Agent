/**
 * Browser-side client for the Mnemonic proxy routes exposed by server.ts.
 * The proxy forwards JSON-RPC `tools/call` to the Mnemonic MCP server and holds
 * the Mnemonic identity / JWT server-side — the browser never sees it.
 *
 * Every call carries the signed-challenge auth headers (see authHeaders.ts).
 */

export interface SignResult {
  content_hash: string;
  hash_algorithm?: string;
  solana_tx?: string;
  arweave_tx?: string;
  solana_explorer_url?: string;
  arweave_url?: string;
  cose_signature?: string;
  visibility?: string;
}

export interface RecallHit {
  content: string;
  content_hash: string;
  solana_tx?: string;
  arweave_tx?: string;
}

export interface VerifyResult {
  status?: string;
  verified?: boolean;
  content_hash?: string;
  solana_tx?: string;
  arweave_tx?: string;
}

/** Thrown when a participate/public write needs explicit user confirmation. */
export class ConfirmationRequiredError extends Error {
  code = -32095;
  data: { content_hash?: string } | undefined;
  constructor(message: string, data?: { content_hash?: string }) {
    super(message);
    this.name = 'ConfirmationRequiredError';
    this.data = data;
  }
}

type Auth = Record<string, string>;

const jsonHeaders = (auth: Auth) => ({ 'Content-Type': 'application/json', ...auth });

export async function mnemonicSign(
  auth: Auth,
  content: string,
  opts: { mode?: 'local' | 'participate'; visibility?: string; confirm?: boolean } = {},
): Promise<SignResult> {
  const res = await fetch('/api/mnemonic/sign', {
    method: 'POST',
    headers: jsonHeaders(auth),
    body: JSON.stringify({ content, ...opts }),
  });
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    throw new ConfirmationRequiredError(
      body.error || 'Public write requires confirmation',
      body.data,
    );
  }
  if (!res.ok) {
    throw new Error((await res.json().catch(() => ({}))).error || 'Mnemonic sign failed');
  }
  return res.json();
}

export async function mnemonicRecall(auth: Auth, query: string): Promise<RecallHit[]> {
  const res = await fetch('/api/mnemonic/recall', {
    method: 'POST',
    headers: jsonHeaders(auth),
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error((await res.json().catch(() => ({}))).error || 'Mnemonic recall failed');
  }
  const data = await res.json();
  return Array.isArray(data) ? data : data.results || [];
}

export async function mnemonicVerify(
  auth: Auth,
  payload: { content?: string; expected_hash?: string; solana_tx?: string; arweave_tx?: string },
): Promise<VerifyResult> {
  const res = await fetch('/api/mnemonic/verify', {
    method: 'POST',
    headers: jsonHeaders(auth),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error((await res.json().catch(() => ({}))).error || 'Mnemonic verify failed');
  }
  return res.json();
}
