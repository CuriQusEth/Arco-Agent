import React, { useState } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useAgentIdentity } from '../hooks/useAgentIdentity';
import { useAgentReputation } from '../hooks/useAgentReputation';
import { useAgentValidation } from '../hooks/useAgentValidation';
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
  const [agentId, setAgentId] = useState('');
  const [info, setInfo] = useState<any>(null);

  const fetchProfile = async () => {
    if (!agentId) return;
    const data = await getAgentInfo(agentId);
    setInfo(data);
  };

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
          <button onClick={fetchProfile} className="bg-stone-800 hover:bg-stone-700 px-4 rounded text-stone-200 flex items-center gap-2 text-sm">
             <Search className="w-4 h-4" /> Lookup
          </button>
       </div>
       
       {info && (
         <div className="bg-stone-900/50 p-6 rounded-xl border border-stone-800 flex flex-col gap-4">
           <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">Owner Address</div>
              <div className="font-mono text-sm text-stone-300">{info.owner}</div>
           </div>
           <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">Metadata URI</div>
              <div className="font-mono text-sm text-stone-300 break-all">{info.uri}</div>
           </div>
           <div className="flex items-center gap-2 mt-4 text-xs font-bold uppercase tracking-widest text-amber-500">
             <Shield className="w-4 h-4" /> Identity Registered
           </div>
         </div>
       )}
    </div>
  );
}

function Reputation() {
  const { walletAddress } = useWallet();
  const { getAgentInfo } = useAgentIdentity();
  const { giveFeedback, isLoading } = useAgentReputation();
  const [agentId, setAgentId] = useState('');
  const [score, setScore] = useState(95);
  const [tag, setTag] = useState('successful_trade');
  const [msg, setMsg] = useState('');

  const submit = async () => {
     try {
        setMsg('Checking role...');
        const info = await getAgentInfo(agentId);
        if (info && info.owner.toLowerCase() === walletAddress?.toLowerCase()) {
           throw new Error("Agents cannot give feedback on themselves. Please switch wallet.");
        }
        setMsg('Submitting...');
        await giveFeedback(agentId, score, tag);
        setMsg('Success!');
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
       setMsg('Responding...');
       await submitValidationResponse(reqHash, responseScore, responseScore >= 50 ? 'kyc_verified' : 'kyc_failed');
       setMsg('Success!');
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
