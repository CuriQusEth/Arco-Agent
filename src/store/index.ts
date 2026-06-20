import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface TransactionRecord {
  hash: string;
  action: string;
  timestamp: number;
  status: 'pending' | 'success' | 'reverted';
  chainId: number;
  from: string;
}

const customStorage = createJSONStorage(() => localStorage, {
  replacer: (_, v) => (typeof v === 'bigint' ? v.toString() : v),
});

interface EscrowState {
  jobId: string | null;
  step: number; 
  // 0: Create Job, 1: Set Budget, 2: Fund, 3: Submit Work, 4: Complete Job
  
  // Job Data
  client: string;
  provider: string; // The owner wallet address
  providerAgentId?: string; // The Agent ID
  evaluator: string; // The owner wallet address
  evaluatorAgentId?: string; // The Agent ID
  jobDetailsHash: string;
  budgetAmount: string;
  deliverable: string;
  completionReason: string;
  
  // Custom Escrow Address
  escrowAddress: string;

  setJobId: (id: string | null) => void;
  setStep: (step: number) => void;
  setJobData: (data: Partial<Omit<EscrowState, 'jobId' | 'step' | 'escrowAddress' | 'setJobId' | 'setStep' | 'setJobData' | 'setEscrowAddress'>>) => void;
  setEscrowAddress: (address: string) => void;
  resetJob: () => void;
}

interface AppStore {
  walletAddress: string | null;
  chainId: number | null;
  
  transactions: TransactionRecord[];
  myJobs: Record<string, string[]>; // wallet address -> array of job IDs
  addTransaction: (tx: TransactionRecord) => void;
  updateTransaction: (hash: string, updates: Partial<TransactionRecord>) => void;
  clearTransactions: () => void;

  setWallet: (address: string | null, chainId: number | null) => void;
  addMyJob: (wallet: string, jobId: string) => void;
  setMyJobs: (wallet: string, jobIds: string[]) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      walletAddress: null,
      chainId: null,
      transactions: [],
      myJobs: {},
      addTransaction: (tx) => set((state) => ({ transactions: [tx, ...state.transactions] })),
      updateTransaction: (hash, updates) => set((state) => ({
        transactions: state.transactions.map((t) => (t.hash === hash ? { ...t, ...updates } : t)),
      })),
      clearTransactions: () => set({ transactions: [] }),
      setWallet: (address, chainId) => set({ walletAddress: address, chainId }),
      addMyJob: (wallet, jobId) => set((state) => {
         const w = wallet.toLowerCase();
         const jobs = state.myJobs[w] || [];
         if (jobs.includes(jobId)) return state;
         return { myJobs: { ...state.myJobs, [w]: [...jobs, jobId] } };
      }),
      setMyJobs: (wallet, jobIds) => set((state) => {
         const w = wallet.toLowerCase();
         return { myJobs: { ...state.myJobs, [w]: jobIds } };
      }),
    }),
    {
      name: 'arco-agent-store',
      storage: customStorage,
      partialize: (state) => ({ transactions: state.transactions, myJobs: state.myJobs }),
    }
  )
);

export const useEscrowStore = create<EscrowState>()(
  persist(
    (set) => ({
      jobId: null,
      step: 0,
      client: '',
      provider: '',
      evaluator: '',
      jobDetailsHash: '',
      budgetAmount: '',
      deliverable: '',
      completionReason: '',
      escrowAddress: '',
      setJobId: (jobId) => set({ jobId }),
      setStep: (step) => set({ step }),
      setJobData: (data) => set((state) => ({ ...state, ...data })),
      setEscrowAddress: (escrowAddress) => set({ escrowAddress }),
      resetJob: () => set({
        jobId: null,
        step: 0,
        client: '',
        provider: '',
        evaluator: '',
        jobDetailsHash: '',
        budgetAmount: '',
        deliverable: '',
        completionReason: '',
      }),
    }),
    {
      name: 'arco-escrow-state',
      storage: customStorage,
      partialize: (state) => ({ 
        step: state.step, 
        jobId: state.jobId,
        escrowAddress: state.escrowAddress,
        client: state.client,
        provider: state.provider,
        providerAgentId: state.providerAgentId,
        evaluator: state.evaluator,
        evaluatorAgentId: state.evaluatorAgentId,
        budgetAmount: state.budgetAmount,
        deliverable: state.deliverable,
        completionReason: state.completionReason
      }),
    }
  )
);
