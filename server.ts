import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createWallet, getWalletBalance, sendUSDC } from "./src/services/circle.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/wallet/create", async (req, res) => {
    try {
      const data = await createWallet(req.body.walletSetId);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to create wallet" });
    }
  });

  app.get("/api/wallet/balance", async (req, res) => {
    try {
      const walletId = req.query.walletId as string;
      if (!walletId) throw new Error("walletId is required");
      const data = await getWalletBalance(walletId);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to get balance" });
    }
  });

  app.post("/api/wallet/send", async (req, res) => {
    try {
      const { walletId, destinationAddress, amount, tokenId } = req.body;
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
