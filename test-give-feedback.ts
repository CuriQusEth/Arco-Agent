import { createPublicClient, http, parseAbiItem, parseAbi } from 'viem';

const repAddr = '0x8004B663056A597Dffe9eCcC1965A193B7388713';
const repAbi = parseAbi([
  'function readAllFeedback(uint256 agentId, address[] clientAddresses, string tag1, string tag2, bool includeRevoked) view returns ((uint256 agentId, address clientAddress, uint64 index, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash, uint256 timestamp)[])'
]);

const run = async () => {
    const client = createPublicClient({
        transport: http('https://rpc.testnet.arc.network')
    });

    const logs = await client.getLogs({
        address: repAddr as `0x${string}`,
        event: parseAbiItem('event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)'),
        fromBlock: 600000n,
        toBlock: 605000n
    });
    
    // Actually, I can just use the public client to call readAllFeedback with a random agent ID 
    // to see if it reverts. But wait, I already know agent 6 returned empty array.
    // If I could find ONE piece of feedback, I could see if readAllFeedback(id, [], ...) returns it!
}
run();
