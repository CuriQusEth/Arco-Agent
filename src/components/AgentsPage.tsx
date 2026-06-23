import React, { useState } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useAgentIdentity } from '../hooks/useAgentIdentity';
import { useAgentReputation } from '../hooks/useAgentReputation';
import { useAgentValidation } from '../hooks/useAgentValidation';
import { useMnemonic } from '../hooks/useMnemonic';
import { MnemonicVerify } from './MnemonicVerify';
import { useAppStore } from '../store';
import { addresses, reputationAbi, validationAbi } from '../lib/contracts';
import { Shield, CheckCircle, XCircle, Search, Bot } from 'lucide-react';
import { useAgentStore } from '../store/agentStore';
import { isAddress } from 'viem';

export function AgentsPage() {
  const [activeTab, setActiveTab] = useState<'register' | 'profile' | 'reputation' | 'validation'>('register');

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto space-y-6">
       <div className="flex items-center gap-4 mb-2">
          <Bot className="w-8 h-8 text-amber-500" />
          <div>
            <h1 className="text-2xl font-serif-display italic text-stone-100">ERC-8004 Agents</h1>
            <p className="text-stone-500 text-sm">Identity, Reputation, and Validation Registries</p>
          </div>
       </div>

       <div className="flex space-x-6 border-b border-stone-800 pb-2">
         {['register', 'profile', 'reputation', 'validation'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`text-xs tracking-widest uppercase font-bold py-1 transition-colors ${activeTab === tab ? 'text-amber-500 border-b border-amber-500' : 'text-stone-500 hover:text-stone-300'}`}
            >
              {tab}
            </button>
         ))}
       </div>

       <div className="flex-1 overflow-y-auto">
          {activeTab === 'register' && <RegisterAgent />}
          {activeTab === 'profile' && <AgentProfile />}
          {activeTab === 'reputation' && <Reputation />}
          {activeTab === 'validation' && <Validation />}
       </div>
    </div>
  );
}

function RegisterAgent() {
  const { registerAgent, isLoading } = useAgentIdentity();
  const [metadataURI, setMetadataURI] = useState('ipfs://bafkreibdi6623n3xpf7ymk62ckb4bo75o3qemwkpfvp5i25j66itxvsoei');
  const [message, setMessage] = useState('');

  const handleRegister = async () => {
     try {
       setMessage('Registering...');
       const id = await registerAgent(metadataURI);
       setMessage(id ? `Success! Agent ID: ${id}` : 'Success!');
     } catch (e: any) {
       console.error(e);
       setMessage('Error: ' + e.message);
     }
  };

  return (
    <div className="space-y-6">
       <div className="bg-stone-900/50 p-6 rounded-xl border border-stone-800">
         <h3 className="text-lg font-medium text-stone-200 mb-4">Register New Agent</h3>
         <div className="space-y-4">
            <div>
               <label className="block text-[10px] uppercase tracking-wider text-stone-500 mb-2">Metadata URI (e.g. IPFS link)</label>
               <input 
                 type="text" 
                 className="w-full rounded border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-200 outline-none focus:border-amber-600/50"
                 value={metadataURI}
                 onChange={e => setMetadataURI(e.target.value)}
               />
            </div>
            <button 
               onClick={handleRegister} disabled={isLoading}
               className="w-full rounded bg-amber-600 py-3 text-sm font-bold text-black uppercase tracking-wide disabled:opacity-50"
            >
               {isLoading ? 'Registering...' : 'Register Identity'}
            </button>
            {message && <p className="text-sm text-amber-500 mt-2">{message}</p>}
         </div>
       </div>
    </div>
  );
}

function AgentProfile() {
  const { getAgentInfo } = useAgentIdentity();
  const { getPublicClient } = useWallet();
  const [agentId, setAgentId] = useState('');
  const [info, setInfo] = useState<any>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [validations, setValidations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchProfile = async () => {
    if (!agentId) return;
    setLoading(true);
    setInfo(null);
    setMetadata(null);
    setFeedback([]);
    setValidations([]);

    try {
      const data = await getAgentInfo(agentId);
      if (!data) throw new Error("Agent not found");
      setInfo(data);

      const publicClient = getPublicClient() as any;

      // 1. Fetch metadata
      let uri = data.uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
      try {
        const res = await fetch(uri);
        const meta = await res.json();
        setMetadata(meta);
      } catch (e) {
        console.error("Metadata fetch failed", e);
      }

      // 2. Fetch feedback
      try {
         const allFb = await publicClient.readContract({
            address: addresses.reputationRegistry,
            abi: reputationAbi,
            functionName: 'readAllFeedback',
            args: [BigInt(agentId), [], "", "", false]
         });
         setFeedback(allFb || []);
      } catch(e) { console.error("feedback fetch err", e); }

      // 3. Fetch validations
      try {
         const reqs = await publicClient.readContract({
             address: addresses.validationRegistry,
             abi: validationAbi,
             functionName: 'getAgentValidations',
             args: [BigInt(agentId)]
         });
         const validDetails = await Promise.all((reqs as string[]).map(async (hash) => {
             const stat = await publicClient.readContract({
                 address: addresses.validationRegistry,
                 abi: validationAbi,
                 functionName: 'getValidationStatus',
                 args: [hash]
             });
             return { hash, address: stat[0], response: stat[2], tag: stat[4], lastUpdate: stat[5] };
         }));
         setValidations(validDetails);
      } catch(e) {}
    } catch(err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const avgScore = feedback.length > 0 ? feedback.reduce((sum, f) => {
     const val = Number(f.value);
     const dec = Number(f.valueDecimals || 0);
     return sum + (val / (10 ** dec));
  }, 0) / feedback.length : null;

  return (
    <div className="space-y-6">
       <div className="flex gap-4 mb-4">
          <input 
             type="text" 
             placeholder="Agent ID" 
             className="flex-1 rounded border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-200 outline-none focus:border-amber-600/50"
             value={agentId}
             onChange={e => setAgentId(e.target.value)}
          />
          <button onClick={fetchProfile} disabled={loading} className="bg-stone-800 hover:bg-stone-700 px-4 rounded text-stone-200 flex items-center gap-2 text-sm disabled:opacity-50">
             <Search className="w-4 h-4" /> {loading ? 'Wait...' : 'Lookup'}
          </button>
       </div>
       
       {info && (
         <div className="flex flex-col gap-6">
           <div className="bg-stone-900/50 p-6 rounded-xl border border-stone-800 flex gap-6">
             {metadata?.image && (
                <div className="w-24 h-24 rounded bg-stone-800 shrink-0 border border-stone-700 overflow-hidden">
                   <img src={metadata.image.replace('ipfs://', 'https://w3s.link/ipfs/')} alt="avatar" className="w-full h-full object-cover" />
                </div>
             )}
             <div className="flex-1">
                <div className="flex justify-between items-start">
                   <h2 className="text-xl font-bold font-serif-display text-amber-500 mb-1">{metadata?.name || `Agent #${agentId}`}</h2>
                   {avgScore !== null && (
                      <div className="bg-stone-800 border border-stone-700 rounded px-2.5 py-1 text-xs font-bold text-stone-300">
                         Avg Score: <span className="text-amber-500">{avgScore.toFixed(0)}</span>
                      </div>
                   )}
                </div>
                {metadata?.description && <p className="text-sm text-stone-400 mb-3">{metadata.description}</p>}
                
                <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                   <div>
                      <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">Owner Address</div>
                      <div className="font-mono text-xs text-stone-300">{info.owner}</div>
                   </div>
                   <div>
                      <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">Metadata URI</div>
                      <div className="font-mono text-[10px] text-stone-500 break-all">{info.uri}</div>
                   </div>
                </div>

                {metadata?.capabilities && Array.isArray(metadata.capabilities) && (
                   <div className="mt-4 flex flex-wrap gap-2">
                     {metadata.capabilities.map((c: string) => (
                        <span key={c} className="px-2 py-0.5 rounded-full bg-stone-800 border border-stone-700 text-[10px] text-stone-400 uppercase tracking-widest">{c}</span>
                     ))}
                   </div>
                )}
             </div>
           </div>

           {/* Validations */}
           {validations.length > 0 && (
             <div className="bg-stone-900/30 p-5 rounded-xl border border-stone-800">
               <h3 className="text-xs uppercase tracking-widest text-stone-500 mb-4 font-bold">Verification Badges</h3>
               <div className="flex flex-wrap gap-2">
                 {validations.map(v => (
                    <div key={v.hash} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold ${v.response >= 50 ? 'border-green-500/30 bg-green-500/10 text-green-500' : 'border-red-500/30 bg-red-500/10 text-red-500'}`}>
                       {v.response >= 50 ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                       {v.tag || (v.response >= 50 ? 'Verified' : 'Failed')}
                    </div>
                 ))}
               </div>
             </div>
           )}

           {/* Feedback History */}
           {feedback.length > 0 && (
             <div className="bg-stone-900/30 p-5 rounded-xl border border-stone-800">
               <h3 className="text-xs uppercase tracking-widest text-stone-500 mb-4 font-bold">Community Feedback</h3>
               <div className="space-y-3">
                 {feedback.map((f, i) => (
                    <div key={i} className="flex flex-col gap-1 p-3 rounded bg-stone-900/50 border border-stone-800">
                       <div className="flex justify-between items-center">
                          <div className="text-xs font-mono text-stone-400">By: {f.clientAddress}</div>
                          <div className="text-xs font-bold text-amber-500">Score: {Number(f.value)}</div>
                       </div>
                       {(f.tag1 || f.tag2) && (
                          <div className="text-[10px] text-stone-500 uppercase flex gap-2 mt-1">
                             {f.tag1 && <span className="bg-stone-800 px-1.5 py-0.5 rounded border border-stone-700">{f.tag1}</span>}
                             {f.tag2 && <span className="bg-stone-800 px-1.5 py-0.5 rounded border border-stone-700">{f.tag2}</span>}
                          </div>
                       )}
                       {f.feedbackHash &&
                        f.feedbackHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' && (
                          <MnemonicVerify
                            expectedHash={f.feedbackHash}
                            uri={f.feedbackURI}
                            query={`arco/erc8004 feedback agent:${agentId} ${f.tag1 || ''} ${f.tag2 || ''}`}
                          />
                       )}
                    </div>
                 ))}
               </div>
             </div>
           )}

           <AgentMemory agentId={agentId} />
         </div>
       )}
    </div>
  );
}

/**
 * Cross-job agent memory (ERC-8004 identity upgrade, MNEMONIC_EXTENSION §6).
 * Semantically recalls the signed memories an agent accrued across jobs —
 * deliverables, evaluations, validation evidence — by meaning, not by a static
 * average over dead links.
 */
function AgentMemory({ agentId }: { agentId: string }) {
  const { recall } = useMnemonic();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<{ content: string; content_hash: string; solana_tx?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const run = async () => {
    setLoading(true);
    setSearched(true);
    try {
      const q = `arco agent:${agentId} ${query}`.trim();
      setHits(await recall(q));
    } catch (e) {
      setHits([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-stone-900/30 p-5 rounded-xl border border-stone-800">
      <h3 className="text-xs uppercase tracking-widest text-stone-500 mb-1 font-bold">Agent Memory (Mnemonic)</h3>
      <p className="text-[11px] text-stone-500 mb-4">
        Recall this agent's signed, anchored work history by meaning.
      </p>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder='e.g. "smart contract audit" or leave blank for all'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          className="flex-1 rounded border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-200 outline-none focus:border-amber-600/50"
        />
        <button
          onClick={run}
          disabled={loading}
          className="bg-stone-800 hover:bg-stone-700 px-4 rounded text-stone-200 flex items-center gap-2 text-sm disabled:opacity-50"
        >
          <Search className="w-4 h-4" /> {loading ? 'Recalling…' : 'Recall'}
        </button>
      </div>
      {searched && hits.length === 0 && !loading && (
        <div className="text-xs text-stone-500 italic">No signed memories recalled for this agent.</div>
      )}
      <div className="space-y-2">
        {hits.map((h, i) => (
          <div key={i} className="rounded border border-stone-800 bg-stone-900/50 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono text-stone-500 break-all">{h.content_hash.slice(0, 24)}…</span>
              {h.solana_tx && !h.solana_tx.startsWith('local:') && (
                <span className="text-[9px] uppercase tracking-wider text-green-500 font-bold">anchored</span>
              )}
            </div>
            <div className="whitespace-pre-wrap text-xs text-stone-300">{h.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Reputation() {
  const { walletAddress } = useWallet();
  const { getAgentInfo } = useAgentIdentity();
  const { giveFeedback, isLoading } = useAgentReputation();
  const { signForChain } = useMnemonic();
  const { mnemonicMode } = useAppStore();
  const [agentId, setAgentId] = useState('');
  const [score, setScore] = useState(95);
  const [tag, setTag] = useState('successful_trade');
  const [details, setDetails] = useState('');
  const [msg, setMsg] = useState('');

  const submit = async () => {
     try {
        setMsg('Checking role...');
        const info = await getAgentInfo(agentId);
        if (!info) {
            throw new Error("Agent not found.");
        }
        if (info.owner.toLowerCase() === walletAddress?.toLowerCase()) {
           throw new Error("Agents cannot give feedback on themselves. Please switch wallet.");
        }
        // Sign the feedback as a verifiable memory: feedbackHash = blake3,
        // feedbackURI = recall handle (instead of keccak(tag) + "").
        setMsg('Signing verifiable feedback...');
        const memo =
          `arco/erc8004 feedback agent:${agentId} score:${score} tag:${tag}\n${details || tag}`;
        const signed = await signForChain(memo, { mode: mnemonicMode });
        setMsg('Submitting...');
        await giveFeedback(agentId, score, tag, signed.uri, signed.bytes32);
        setMsg('Success! Feedback anchored: ' + signed.result.content_hash.slice(0, 16) + '…');
     } catch (e: any) {
        setMsg('Error: ' + e.message);
     }
  };

  return (
    <div className="space-y-6 bg-stone-900/50 p-6 rounded-xl border border-stone-800">
      <h3 className="text-lg font-medium text-stone-200 mb-4">Record Feedback</h3>
      <input type="text" placeholder="Agent ID" value={agentId} onChange={e=>setAgentId(e.target.value)} className="w-full mb-4 rounded border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-200" />
      <input type="number" placeholder="Score (0-100)" value={score} onChange={e=>setScore(Number(e.target.value))} className="w-full mb-4 rounded border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-200" />
      <input type="text" placeholder="Tag (e.g. successful_trade)" value={tag} onChange={e=>setTag(e.target.value)} className="w-full mb-4 rounded border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-200" />
      <textarea placeholder="Feedback details (signed & anchored as a verifiable memory)" value={details} onChange={e=>setDetails(e.target.value)} rows={3} className="w-full mb-4 rounded border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-200" />
      <button onClick={submit} disabled={isLoading} className="w-full bg-stone-800 hover:bg-stone-700 py-3 rounded text-stone-200 text-sm font-bold tracking-wide uppercase disabled:opacity-50">
         {isLoading ? 'Wait...' : 'Give Feedback'}
      </button>
      {msg && <div className="mt-4 text-sm text-amber-500">{msg}</div>}
    </div>
  );
}

function Validation() {
  const { walletAddress } = useWallet();
  const { getAgentInfo } = useAgentIdentity();
  const { requestValidation, submitValidationResponse, getValidationStatus, isLoading } = useAgentValidation();
  const { signForChain } = useMnemonic();
  const { mnemonicMode } = useAppStore();
  const [mode, setMode] = useState<'request' | 'response' | 'check'>('request');
  const [agentId, setAgentId] = useState('');
  const [validator, setValidator] = useState('');
  const [reqHash, setReqHash] = useState('');
  const [responseScore, setResponseScore] = useState(100);
  const [msg, setMsg] = useState('');

  const handleReq = async () => {
     try {
       setMsg('Requesting...');
       if (!isAddress(validator)) throw new Error('Invalid validator address');
       const info = await getAgentInfo(agentId);
       if (!info) throw new Error("Agent not found.");
       if (info.owner.toLowerCase() !== walletAddress?.toLowerCase()) {
           throw new Error("Only the agent owner can request validation. Please switch wallet.");
       }
       const hash = await requestValidation(validator, agentId, 'ipfs://request_uri', `kyc_request_${agentId}_${Date.now()}`);
       setReqHash(hash);
       setMsg(`Success. Request Hash: ${hash}`);
     } catch (e:any) { setMsg(e.message); }
  };

  const handleRes = async () => {
     try {
       setMsg('Checking role...');
       const status = await getValidationStatus(reqHash);
       if (!status) throw new Error("Validation request not found.");
       if ((status[0] as string).toLowerCase() !== walletAddress?.toLowerCase()) {
           throw new Error("Only the specified validator can respond. Please switch wallet.");
       }
       // Sign the validator's report as a verifiable memory; the blake3 hash
       // and recall URI become the on-chain responseHash / responseURI.
       const tag = responseScore >= 50 ? 'kyc_verified' : 'kyc_failed';
       setMsg('Signing verifiable report...');
       const memo =
         `arco/erc8004 validation-response req:${reqHash} result:${tag} score:${responseScore}`;
       const signed = await signForChain(memo, { mode: mnemonicMode });
       setMsg('Responding...');
       await submitValidationResponse(reqHash, responseScore, tag, signed.uri, signed.bytes32);
       setMsg('Success! Report anchored: ' + signed.result.content_hash.slice(0, 16) + '…');
     } catch (e:any) { setMsg(e.message); }
  };

  const handleCheck = async () => {
     try {
       setMsg('Checking...');
       const status = await getValidationStatus(reqHash);
       if (status) {
         setMsg(`Validator: ${status[0]}, Agent: ${status[1]}, Response: ${status[2]}, Tag: ${status[4]}`);
       } else {
         setMsg('Not found');
       }
     } catch (e:any) { setMsg(e.message); }
  };

  return (
    <div className="space-y-6">
       <div className="flex gap-2 mb-4">
          <button onClick={() => setMode('request')} className={`px-4 py-2 text-xs uppercase font-bold rounded ${mode==='request'?'bg-amber-600/20 text-amber-500':'bg-stone-800 text-stone-400'}`}>Request</button>
          <button onClick={() => setMode('response')} className={`px-4 py-2 text-xs uppercase font-bold rounded ${mode==='response'?'bg-amber-600/20 text-amber-500':'bg-stone-800 text-stone-400'}`}>Respond</button>
          <button onClick={() => setMode('check')} className={`px-4 py-2 text-xs uppercase font-bold rounded ${mode==='check'?'bg-amber-600/20 text-amber-500':'bg-stone-800 text-stone-400'}`}>Check Status</button>
       </div>

       <div className="bg-stone-900/50 p-6 rounded-xl border border-stone-800">
          {mode === 'request' && (
             <div className="space-y-4">
                <input type="text" placeholder="Validator Address" value={validator} onChange={e=>setValidator(e.target.value)} className="w-full rounded border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-200" />
                <input type="text" placeholder="Agent ID" value={agentId} onChange={e=>setAgentId(e.target.value)} className="w-full rounded border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-200" />
                <button onClick={handleReq} disabled={isLoading} className="w-full bg-stone-800 hover:bg-stone-700 py-3 rounded text-stone-200 text-sm font-bold uppercase tracking-wide disabled:opacity-50">Request Validation</button>
             </div>
          )}
          {mode === 'response' && (
             <div className="space-y-4">
                <input type="text" placeholder="Request Hash" value={reqHash} onChange={e=>setReqHash(e.target.value)} className="w-full rounded border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-200" />
                <div className="flex items-center gap-4 py-2">
                   <label className="text-[10px] uppercase tracking-wider text-stone-500">Validation Result:</label>
                   <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={responseScore === 100} onChange={() => setResponseScore(100)} className="accent-amber-500" />
                      <span className="text-sm text-stone-300">Pass (100)</span>
                   </label>
                   <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={responseScore === 0} onChange={() => setResponseScore(0)} className="accent-red-500" />
                      <span className="text-sm text-stone-300">Fail (0)</span>
                   </label>
                </div>
                <button onClick={handleRes} disabled={isLoading} className="w-full bg-stone-800 hover:bg-stone-700 py-3 rounded text-stone-200 text-sm font-bold uppercase tracking-wide disabled:opacity-50">Provide Response</button>
             </div>
          )}
          {mode === 'check' && (
             <div className="space-y-4">
                <input type="text" placeholder="Request Hash" value={reqHash} onChange={e=>setReqHash(e.target.value)} className="w-full rounded border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-200" />
                <button onClick={handleCheck} disabled={isLoading} className="w-full bg-stone-800 hover:bg-stone-700 py-3 rounded text-stone-200 text-sm font-bold uppercase tracking-wide disabled:opacity-50">Check</button>
             </div>
          )}
          {msg && <div className="mt-4 text-sm text-amber-500 overflow-hidden text-clip break-all">{msg}</div>}
       </div>
    </div>
  );
}
