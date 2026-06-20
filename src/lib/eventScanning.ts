import { PublicClient, AbiEvent } from 'viem';

export async function scanLogsChunked(
  publicClient: PublicClient,
  params: { address: `0x${string}`; event: AbiEvent; args?: Record<string, unknown> },
  opts: { maxChunks?: number; chunkSize?: bigint } = {},
): Promise<any[]> {
    const { address, event, args } = params;
    const maxChunks = opts.maxChunks || 20; // Default to looking back 20 chunks
    const chunkSize = opts.chunkSize || 9000n; // Default viem chunk size for arc testnet is 10k max

    try {
        const latestBlock = await publicClient.getBlockNumber();
        let currentTo = latestBlock;
        const allLogs = [];
        
        for (let i = 0; i < maxChunks; i++) {
            if (currentTo < 0n) break;
            const currentFrom = currentTo > chunkSize ? currentTo - chunkSize : 0n;
            
            const logs = await (publicClient as any).getLogs({
                address,
                event,
                args,
                fromBlock: currentFrom,
                toBlock: currentTo
            });
            
            allLogs.push(...logs);
            currentTo = currentFrom - 1n;
            if (currentFrom === 0n) break;
        }
        
        return allLogs;
    } catch (e) {
        console.error("Chunked scanning failed:", e);
        return [];
    }
}
