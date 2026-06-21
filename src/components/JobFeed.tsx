import React, { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useEscrowStore } from '../store';
import { scanLogsChunked } from '../lib/eventScanning';
import { escrowAbi } from '../lib/contracts';
import { RefreshCw, Search } from 'lucide-react';

export function JobFeed({ onSelectJob }: { onSelectJob: (id: string) => void }) {
  const { getPublicClient } = useWallet();
  const store = useEscrowStore();
  const [jobs, setJobs] = useState<{ id: string, client: string, provider: string, evaluator: string, time: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchFeed = async () => {
    const publicClient = getPublicClient() as any;
    if (!publicClient || !store.escrowAddress) return;
    
    setLoading(true);
    try {
        const cLogs = await scanLogsChunked(publicClient, {
            address: store.escrowAddress as `0x${string}`,
            event: {
                type: 'event',
                name: 'JobCreated',
                inputs: [
                    { type: 'uint256', name: 'jobId', indexed: true },
                    { type: 'address', name: 'client', indexed: true },
                    { type: 'address', name: 'provider', indexed: true },
                    { type: 'address', name: 'evaluator', indexed: false },
                    { type: 'uint256', name: 'expiredAt', indexed: false },
                    { type: 'address', name: 'hook', indexed: false },
                ],
            }
        }, { maxChunks: 5 }); // last 50k blocks
        
        let feed = cLogs.map(log => ({
            id: (log as any).args.jobId.toString(),
            client: (log as any).args.client,
            provider: (log as any).args.provider,
            evaluator: (log as any).args.evaluator,
            time: Number((log as any).blockNumber || 0) // Exact relative order
        }));

        const unique = new Map();
        for (const f of feed) {
           if (!unique.has(f.id)) unique.set(f.id, f);
        }
        
        setJobs(Array.from(unique.values()).sort((a,b) => b.time - a.time));
    } catch(e) {
        console.error("Job feed error", e);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, [store.escrowAddress]);

  const filtered = jobs.filter(j => 
     j.id.includes(search) || 
     j.client.toLowerCase().includes(search.toLowerCase()) || 
     j.provider.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex justify-center w-full">
      <div className="flex flex-col h-full w-full max-w-4xl">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="font-serif-display text-4xl italic text-stone-100">Job Feed</h1>
            <p className="mt-2 text-stone-500 text-sm">Public active tasks on Escrow</p>
          </div>
          <button 
             onClick={fetchFeed} 
             disabled={loading}
             className="px-4 py-2 border border-stone-700 bg-stone-900 rounded text-stone-300 hover:text-white flex items-center gap-2"
          >
             <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
             Refresh
          </button>
        </div>

        <div className="mb-6 relative">
           <Search className="w-5 h-5 absolute left-3 top-2.5 text-stone-500" />
           <input 
              type="text" 
              placeholder="Search by Job ID, Client or Provider address..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-stone-900/50 border border-stone-800 rounded-lg py-2.5 pl-10 pr-4 text-stone-200 focus:outline-none focus:border-amber-500/50"
           />
        </div>

        <div className="bg-stone-900/20 border border-stone-800 rounded-xl overflow-hidden">
           <table className="w-full text-left text-sm">
              <thead className="bg-stone-900/40 text-stone-400 text-xs uppercase">
                 <tr>
                    <th className="px-4 py-3 font-medium">Job ID</th>
                    <th className="px-4 py-3 font-medium">Client</th>
                    <th className="px-4 py-3 font-medium">Provider</th>
                    <th className="px-4 py-3 font-medium text-right">Action</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/50">
                 {filtered.length === 0 ? (
                    <tr>
                       <td colSpan={4} className="px-4 py-8 text-center text-stone-500 italic">No jobs found.</td>
                    </tr>
                 ) : filtered.map(job => (
                    <tr key={job.id} className="hover:bg-stone-900/30 transition-colors group">
                       <td className="px-4 py-3 font-mono text-amber-500">#{job.id}</td>
                       <td className="px-4 py-3 font-mono text-[11px] text-stone-400">{job.client.slice(0,8)}...{job.client.slice(-6)}</td>
                       <td className="px-4 py-3 font-mono text-[11px] text-stone-400">{job.provider.slice(0,8)}...{job.provider.slice(-6)}</td>
                       <td className="px-4 py-3 text-right">
                          <button 
                             onClick={() => onSelectJob(job.id)}
                             className="text-xs bg-stone-800 hover:bg-amber-600 hover:text-black text-stone-300 font-bold px-3 py-1.5 rounded transition-colors uppercase"
                          >
                             View Details
                          </button>
                       </td>
                    </tr>
                 ))}
              </tbody>
           </table>
        </div>
      </div>
    </div>
  );
}
