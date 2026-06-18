import { defineChain, parseAbi } from 'viem';

export const arcTestnet = defineChain({
  id: 5_042_002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.arc.network'],
      webSocket: ['wss://rpc.testnet.arc.network'],
    },
    public: {
      http: ['https://rpc.testnet.arc.network'],
      webSocket: ['wss://rpc.testnet.arc.network'],
    },
    fallback: {
      http: [
        'https://rpc.blockdaemon.testnet.arc.network',
        'https://rpc.drpc.testnet.arc.network',
        'https://rpc.quicknode.testnet.arc.network',
      ],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: 'https://testnet.arcscan.app',
    },
  },
});

export const addresses = {
  usdcErc20: '0x3600000000000000000000000000000000000000' as const,
  eurc: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as const,
  usyc: '0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C' as const,
  multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11' as const,
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const,
  create2Factory: '0x4e59b44847b379578588920cA78FbF26c0B4956C' as const,
  // This is a placeholder address for the UI. In a real app, you'd deploy and set this in production.
  defaultEscrow: '0x0000000000000000000000000000000000000001' as const,
};

export const erc20Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function transfer(address to, uint amount) returns (bool)',
  'function approve(address spender, uint amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

// Generic Agentic Escrow / ERC-8183 style ABI
export const escrowAbi = parseAbi([
  'function createJob(address provider, address evaluator, bytes32 jobDetailsHash) returns (uint256)',
  'function setBudget(uint256 jobId, address token, uint256 amount)',
  'function fundJob(uint256 jobId)',
  'function submitWork(uint256 jobId, bytes32 resultHash)',
  'function completeJob(uint256 jobId)',
  'function jobs(uint256 jobId) view returns (address provider, address evaluator, address token, uint256 budget, uint8 status)',
  'event JobCreated(uint256 indexed jobId, address indexed provider, address indexed evaluator, bytes32 jobDetailsHash)',
  'event BudgetSet(uint256 indexed jobId, address indexed token, uint256 amount)',
  'event JobFunded(uint256 indexed jobId)',
  'event WorkSubmitted(uint256 indexed jobId, bytes32 resultHash)',
  'event JobCompleted(uint256 indexed jobId)'
]);
