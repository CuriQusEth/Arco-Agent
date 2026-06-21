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
