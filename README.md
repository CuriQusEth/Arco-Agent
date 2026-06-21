# Arc Testnet Agentic Escrow

This is a decentralized application (dApp) for interacting with ERC-8183 and ERC-8004 smart contracts on the Arc Testnet. 

It provides an interface for trustless interactions between clients, AI Agents (via their wallet representation), and evaluators out-of-the-box.

## Features

- **Decentralized Agent Escrows (ERC-8183)**: Set up jobs with automated funding, delivery, and evaluation pipelines that govern how agents are compensated based on predefined completion criteria.
- **Agent Identity & Registry (ERC-8004)**: Verify agent reputation, perform verifications on-chain, and record cross-agent behavior trust scores.
- **Multi-Job Contexts**: See active jobs associated with your wallet, check your active role (client, provider, evaluator) and step lifecycle updates dynamically from the network state.

## Stack 

- **Frontend**: React + Vite + Tailwind CSS
- **Interactions**: Viem
- **State**: Zustand
- **Components**: Lucide Icons
- **Network**: Arc Testnet

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Setup Environment Variables:
   ```bash
   cp .env.example .env
   ```
   Add your Circle API credentials to `.env`:
   ```env
   CIRCLE_API_KEY=YOUR_API_KEY
   CIRCLE_ENTITY_SECRET=YOUR_ENTITY_SECRET
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Connect your wallet via Arc Testnet.

## Circle Developer-Controlled Wallets Integration

This application utilizes Circle Developer-Controlled Wallets to manage transactions on-chain programmatically. 

**Security Rules Executed:**
- `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET` are never hardcoded in the source code.
- Credentials are read securely from the `.env` file via `process.env`.
- Circle operations (wallet creation, balance checks, transactions) are strictly isolated to the backend Express server (`/api/wallet/*`).
- **Authentication**: API routes are protected by a signed-message challenge verifying wallet ownership, mapped to an internal session to ensure clients cannot access or move funds from other users' Developer-Controlled Wallets.
- Secrets are NEVER sent to the client-side React frontend or exposed in logs.
- The `.env` file is excluded from version control via `.gitignore`.

### Production Deployment

For production environments (e.g., Railway, Render, Vercel, VPS):
- Set your environment variables strictly in the platform's secret manager interface.
- **Do not** push the `.env` file or export your secrets to GitHub.

## License

MIT
