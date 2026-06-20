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

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Connect your wallet via Arc Testnet.

## License

MIT
