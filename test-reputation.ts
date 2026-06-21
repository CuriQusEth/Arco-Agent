import { createPublicClient, http, parseAbiItem } from 'viem';

const client = createPublicClient({
  transport: http('https://rpc.testnet.arc.network')
});

async function run() {
  try {
    const logs = await client.getLogs({
        address: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
        event: parseAbiItem('event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)'),
        fromBlock: 0n,
        toBlock: 'latest'
    });
    console.log("Total Feedback Logs on contract:", logs.length);
    if (logs.length > 0) {
      console.log("First log agent ID:", logs[0].args.agentId);
    }
  } catch(e: any) {
    console.log("Error:", e.message);
  }
}
run();
