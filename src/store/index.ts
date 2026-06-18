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

const customStorage = createJSONStorage(() => ({
  getItem: (name) => {
    const str = localStorage.getItem(name);
    return str ? JSON.parse(str) : null;
  },
  setItem: (name, value) => {
    localStorage.setItem(
      name,
      JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
    );
  },
  removeItem: (name) => {
    localStorage.removeItem(name);
  },
}));

interface EscrowState {
  jobId: string | null;
  step: number; 
  // 0: Create Job, 1: Set Budget, 2: Fund, 3: Submit Work, 4: Complete Job
  
  // Job Data
  provider: string;
  evaluator: string;
  jobDetailsHash: string;
  budgetAmount: string;
  
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
  addTransaction: (tx: TransactionRecord) => void;
  updateTransaction: (hash: string, updates: Partial<TransactionRecord>) => void;
  clearTransactions: () => void;

  setWallet: (address: string | null, chainId: number | null) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      walletAddress: null,
      chainId: null,
      transactions: [],
      addTransaction: (tx) => set((state) => ({ transactions: [tx, ...state.transactions] })),
      updateTransaction: (hash, updates) => set((state) => ({
        transactions: state.transactions.map((t) => (t.hash === hash ? { ...t, ...updates } : t)),
      })),
      clearTransactions: () => set({ transactions: [] }),
      setWallet: (address, chainId) => set({ walletAddress: address, chainId }),
    }),
    {
      name: 'arco-agent-store',
      storage: customStorage,
      partialize: (state) => ({ transactions: state.transactions }),
    }
  )
);

export const useEscrowStore = create<EscrowState>()(
  persist(
    (set) => ({
      jobId: null,
      step: 0,
      provider: '',
      evaluator: '',
      jobDetailsHash: '',
      budgetAmount: '',
      escrowAddress: '',
      setJobId: (jobId) => set({ jobId }),
      setStep: (step) => set({ step }),
      setJobData: (data) => set((state) => ({ ...state, ...data })),
      setEscrowAddress: (escrowAddress) => set({ escrowAddress }),
      resetJob: () => set({
        jobId: null,
        step: 0,
        provider: '',
        evaluator: '',
        jobDetailsHash: '',
        budgetAmount: '',
      }),
    }),
    {
      name: 'arco-escrow-state',
      storage: customStorage,
      partialize: (state) => ({ 
        step: state.step, 
        jobId: state.jobId,
        escrowAddress: state.escrowAddress
        // Omit provider, evaluator, jobDetailsHash, budgetAmount to prevent PII persistence locally
      }),
    }
  )
);
