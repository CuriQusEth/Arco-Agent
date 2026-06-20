import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AgentState {
  // mapping from agentId to agent info
  agentId: string;
  agentURI: string;
  reputationScore: number;
  validationStatus: number;
  setAgentInfo: (agentId: string, uri: string, rep: number, validation: number) => void;
}

const customStorage = createJSONStorage(() => localStorage, {
  replacer: (_, v) => (typeof v === 'bigint' ? v.toString() : v),
});

export const useAgentStore = create<AgentState>()(
  persist(
    (set) => ({
      agentId: '',
      agentURI: '',
      reputationScore: 0,
      validationStatus: 0,
      setAgentInfo: (agentId, uri, rep, validation) => set({ agentId, agentURI: uri, reputationScore: rep, validationStatus: validation }),
    }),
    {
      name: 'arco-agent-identity',
      storage: customStorage,
    }
  )
);
