import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-12 h-full min-h-screen text-center bg-[#050505] text-stone-200">
          <AlertCircle className="w-16 h-16 text-red-500 mb-6" />
          <h1 className="text-3xl font-serif-display font-bold mb-4">Something went wrong</h1>
          <p className="text-stone-400 mb-8 max-w-xl">
             An unexpected error occurred in the application. You can try refreshing the page or clearing your local data if the problem persists.
          </p>
          <div className="p-4 bg-stone-900 border border-stone-800 rounded-lg text-left text-xs font-mono text-red-400 max-w-2xl w-full overflow-auto">
             {this.state.error?.message}
          </div>
          <button 
             onClick={() => window.location.reload()} 
             className="mt-8 px-6 py-2.5 bg-stone-800 text-stone-300 font-bold uppercase tracking-widest text-sm rounded hover:bg-stone-700 transition"
          >
             Reload Application
          </button>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
