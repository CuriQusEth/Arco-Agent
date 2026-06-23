import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createWallet, getWalletBalance, sendUSDC } from "./src/services/circle.js";
import { verifyMessage } from "viem";
import rateLimit from "express-rate-limit";

// P0.1: Maintain a server-side mapping of user identity -> Circle walletId
// In production, this should be a DB. Using an in-memory map for the testnet demo.
const userWallets = new Map<string, string>();

// P0.1: Basic Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { error: "Too many requests, please try again later." }
});

const sendLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Max 5 transfers per minute
  message: { error: "Transfer rate limit exceeded." }
});

// Mnemonic MCP proxy — forwards JSON-RPC `tools/call` to the Mnemonic server.
// The Mnemonic identity / JWT stays server-side and is never sent to the client.
const MNEMONIC_URL = process.env.MNEMONIC_MCP_URL || "https://mcp.mnemonik.xyz/mcp";
const MNEMONIC_JWT = process.env.MNEMONIC_JWT;

class MnemonicRpcError extends Error {
  code: number;
  data: any;
  constructor(message: string, code: number, data: any) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

async function mnemonicCall(name: string, args: Record<string, unknown>): Promise<any> {
  const resp = await fetch(MNEMONIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(MNEMONIC_JWT ? { Authorization: `Bearer ${MNEMONIC_JWT}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });

  if (!resp.ok) {
    throw new MnemonicRpcError(`Mnemonic endpoint returned HTTP ${resp.status}`, -32099, null);
  }

  const json: any = await resp.json();
  if (json.error) {
    throw new MnemonicRpcError(
      json.error.message || "Mnemonic error",
      json.error.code ?? -32603,
      json.error.data,
    );
  }

  // MCP tool results arrive as { result: { content: [{ type, text }] } } or
  // as a structured result object. Normalize both.
  const result = json.result;
  const text = result?.content?.[0]?.text;
  return text ? JSON.parse(text) : result;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  
  // Apply limiters
  app.use("/api/", apiLimiter);

  // Simple Session/Auth middleware via signed message headers
  // The client must provide x-user-address, x-signature, x-timestamp
  // The signature is over "Login to Arco Agent at <timestamp>"
  const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const address = req.headers['x-user-address'] as string;
      const signature = req.headers['x-signature'] as string;
      const timestamp = req.headers['x-timestamp'] as string;

      if (!address || !signature || !timestamp) {
         res.status(401).json({ error: "Missing authentication headers" });
         return;
      }

      // Replay protection (e.g., within 5 minutes)
      const now = Date.now();
      if (Math.abs(now - parseInt(timestamp)) > 5 * 60 * 1000) {
         res.status(401).json({ error: "Signature expired" });
         return;
      }

      const message = `Login to Arco Agent at ${timestamp}`;
      const valid = await verifyMessage({ address: address as `0x${string}`, message, signature: signature as `0x${string}` });
      
      if (!valid) {
         res.status(401).json({ error: "Invalid signature" });
         return;
      }

      // Attach user address to request
      (req as any).userAddress = address.toLowerCase();
      next();
    } catch (e) {
      res.status(401).json({ error: "Authentication failed" });
    }
  };

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/wallet/create", requireAuth, async (req, res) => {
    try {
      const address = (req as any).userAddress;
      if (userWallets.has(address)) {
         res.json({ existing: true, walletId: userWallets.get(address) });
         return;
      }
      
      const data = await createWallet(req.body.walletSetId);
      const wallet = data.wallets?.[0];
      if (wallet) {
         userWallets.set(address, wallet.id);
      }
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to create wallet" });
    }
  });

  app.get("/api/wallet/balance", requireAuth, async (req, res) => {
    try {
      const address = (req as any).userAddress;
      const walletId = userWallets.get(address);
      if (!walletId) {
         res.status(404).json({ error: "No wallet found for user" });
         return;
      }
      const data = await getWalletBalance(walletId);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to get balance" });
    }
  });

  app.post("/api/wallet/send", requireAuth, sendLimiter, async (req, res) => {
    try {
      const address = (req as any).userAddress;
      const walletId = userWallets.get(address);
      
      if (!walletId) {
         res.status(404).json({ error: "No wallet found for user" });
         return;
      }

      const { destinationAddress, amount, tokenId } = req.body;
      // Use the server-side walletId mapped to the user, not a client-provided one
      const data = await sendUSDC(walletId, destinationAddress, amount, tokenId);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to transfer tokens" });
    }
  });

  // --- Mnemonic verifiable-memory proxy ---------------------------------
  // Sign content as a Mnemonic memory; the returned blake3 content_hash is
  // embedded on-chain (ERC-8183 deliverable / ERC-8004 feedbackHash, etc.).
  app.post("/api/mnemonic/sign", requireAuth, sendLimiter, async (req, res) => {
    try {
      const { content, mode, visibility, confirm } = req.body;
      if (!content || typeof content !== "string") {
        res.status(400).json({ error: "content (string) is required" });
        return;
      }
      const resolvedMode = mode || process.env.MNEMONIC_DEFAULT_MODE || "local";
      const args: Record<string, unknown> = { content, mode: resolvedMode };
      if (resolvedMode === "participate") {
        args.visibility = visibility || process.env.MNEMONIC_DEFAULT_VISIBILITY || "public";
      }

      // Participate + public writes require an explicit confirmation ceremony.
      // Only run it when the client has confirmed; otherwise surface the gate.
      if (confirm && resolvedMode === "participate") {
        try {
          const pre = await mnemonicCall("mnemonic_sign_memory", args);
          res.json(pre);
          return;
        } catch (gate: any) {
          if (gate instanceof MnemonicRpcError && gate.code === -32095) {
            const contentHash = gate.data?.content_hash;
            const conf = await mnemonicCall("request_public_write_confirmation", {
              content_hash: contentHash,
            });
            const token = conf?.confirmation_token || conf?.token || conf?.confirmationToken;
            const out = await mnemonicCall("mnemonic_sign_memory", {
              ...args,
              confirmation_token: token,
            });
            res.json(out);
            return;
          }
          throw gate;
        }
      }

      const out = await mnemonicCall("mnemonic_sign_memory", args);
      res.json(out);
    } catch (e: any) {
      if (e instanceof MnemonicRpcError && e.code === -32095) {
        // Public-write gate: ask the client to confirm and retry.
        res.status(409).json({ error: e.message, code: e.code, data: e.data });
        return;
      }
      res.status(500).json({ error: e.message || "Mnemonic sign failed" });
    }
  });

  app.post("/api/mnemonic/recall", requireAuth, async (req, res) => {
    try {
      const out = await mnemonicCall("mnemonic_recall", { query: req.body.query });
      res.json(out);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Mnemonic recall failed" });
    }
  });

  app.post("/api/mnemonic/verify", requireAuth, async (req, res) => {
    try {
      const { content, expected_hash, solana_tx, arweave_tx } = req.body;
      const out = await mnemonicCall("mnemonic_verify", {
        content,
        expected_hash,
        solana_tx,
        arweave_tx,
      });
      res.json(out);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Mnemonic verify failed" });
    }
  });

  app.get("/api/mnemonic/whoami", requireAuth, async (_req, res) => {
    try {
      const out = await mnemonicCall("mnemonic_whoami", {});
      res.json(out);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Mnemonic whoami failed" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
