import { create } from 'zustand';

interface AgentState {
  // mapping from agentId to agent info
  agentId: string;
  agentURI: string;
  reputationScore: number;
  validationStatus: number;
  setAgentInfo: (agentId: string, uri: string, rep: number, validation: number) => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  agentId: '',
  agentURI: '',
  reputationScore: 0,
  validationStatus: 0,
  setAgentInfo: (agentId, uri, rep, validation) => set({ agentId, agentURI: uri, reputationScore: rep, validationStatus: validation }),
}));
