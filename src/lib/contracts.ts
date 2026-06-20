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
  // The official Arc standard Testnet reference ERC-8183 contract
  // @ts-ignore
  defaultEscrow: (import.meta.env.VITE_ESCROW_ADDRESS as `0x${string}`) || '0x0747EEf0706327138c69792bF28Cd525089e4583',

  identityRegistry: '0x8004A818BFB912233c491871b3d84c89A494BD9e' as const,
  reputationRegistry: '0x8004B663056A597Dffe9eCcC1965A193B7388713' as const,
  validationRegistry: '0x8004Cb1BF31DAf7788923b405b754f57acEB4272' as const,
};

export const erc20Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function transfer(address to, uint amount) returns (bool)',
  'function approve(address spender, uint amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

// Official ARC ERC-8183 Agentic Escrow ABI
export const escrowAbi = parseAbi([
  'function createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook) returns (uint256)',
  'function setBudget(uint256 jobId, uint256 amount, bytes optParams)',
  'function fund(uint256 jobId, bytes optParams)',
  'function submit(uint256 jobId, bytes32 deliverable, bytes optParams)',
  'function complete(uint256 jobId, bytes32 reason, bytes optParams)',
  'function getJob(uint256 jobId) view returns ((uint256 id, address client, address provider, address evaluator, string description, uint256 budget, uint256 expiredAt, uint8 status, address hook))',
  'event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)'
]);

// ERC-8004 Identity Registry ABI
export const identityAbi = parseAbi([
  'function register(string metadataURI)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
]);

// ERC-8004 Reputation Registry ABI
export const reputationAbi = parseAbi([
  'function giveFeedback(uint256 agentId, int128 score, uint8 feedbackType, string tag, string metadataURI, string evidenceURI, string comment, bytes32 feedbackHash)'
]);

// ERC-8004 Validation Registry ABI
export const validationAbi = parseAbi([
  'function validationRequest(address validator, uint256 agentId, string requestURI, bytes32 requestHash)',
  'function validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)',
  'function getValidationStatus(bytes32 requestHash) view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string tag, uint256 lastUpdate)'
]);
