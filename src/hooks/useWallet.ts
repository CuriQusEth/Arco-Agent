import { useEffect, useState, useCallback } from 'react';
import { createWalletClient, createPublicClient, custom, http, webSocket, isAddress } from 'viem';
import { arcTestnet, addresses, erc20Abi } from '../lib/contracts';
import { useAppStore } from '../store';

let watchClientInstance: any = null;

export function useWallet() {
  const { walletAddress, setWallet } = useAppStore();
  const [isConnecting, setIsConnecting] = useState(false);
  const [nativeBalance, setNativeBalance] = useState<bigint | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<bigint | null>(null);
  const [usdcDecimals, setUsdcDecimals] = useState<number>(6);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<{info: any, provider: any}[]>([]);

  useEffect(() => {
    const onAnnounce = (e: any) => {
      if (e.detail && e.detail.provider) {
        setProviders(prev => {
          if (prev.some(p => p.info.uuid === e.detail.info.uuid)) return prev;
          return [...prev, e.detail];
        });
      }
    };
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    return () => window.removeEventListener('eip6963:announceProvider', onAnnounce);
  }, []);

  const getPublicClient = () => {
    return createPublicClient({
      chain: arcTestnet,
      transport: window.ethereum ? custom(window.ethereum) : http(),
    });
  };

  const getWatchClient = () => {
    if (!watchClientInstance) {
      if (arcTestnet.rpcUrls.default.webSocket) {
        watchClientInstance = createPublicClient({
          chain: arcTestnet,
          transport: webSocket(arcTestnet.rpcUrls.default.webSocket[0]),
        });
      } else {
        watchClientInstance = createPublicClient({
          chain: arcTestnet,
          transport: http(arcTestnet.rpcUrls.default.http[0]),
        });
      }
    }
    return watchClientInstance;
  };

  const getWalletClient = () => {
    if (!window.ethereum) return null;
    return createWalletClient({
      chain: arcTestnet,
      transport: custom(window.ethereum),
    });
  };

  const fetchBalances = useCallback(async (address: string) => {
    try {
      const publicClient = getPublicClient();
      if (!publicClient) return;

      const validAddr = isAddress(address, { strict: false });
      if (!validAddr) return;

      const [nativeBal, usdcBal, decimals] = await Promise.all([
        publicClient.getBalance({ address: address as `0x${string}` }),
        (publicClient as any).readContract({
          address: addresses.usdcErc20,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
        }).catch(() => 0n),
        (publicClient as any).readContract({
          address: addresses.usdcErc20,
          abi: erc20Abi,
          functionName: 'decimals',
        }).catch(() => 6),
      ]);

      setNativeBalance(nativeBal);
      setUsdcBalance(usdcBal);
      setUsdcDecimals(decimals);
    } catch (err) {
      // Removed err to avoid BigInt serialization crashes
    }
  }, []);

  const connect = async (selectedProvider?: any) => {
    setError(null);
    const providerToUse = selectedProvider || window.ethereum;
    
    if (!providerToUse) {
      setError('No matching wallet found. Please install MetaMask, Rabby, or Coinbase Wallet.');
      return;
    }

    try {
      setIsConnecting(true);
      const walletClient = createWalletClient({
        chain: arcTestnet,
        transport: custom(providerToUse),
      });

      const accounts = await walletClient.requestAddresses();
      if (!accounts[0]) throw new Error('No accounts returned');

      const address = accounts[0];
      const chainIdHex = await providerToUse.request({ method: 'eth_chainId' });
      const chainId = parseInt(chainIdHex as string, 16);

      setWallet(address, chainId);

      if (chainId !== arcTestnet.id) {
        await switchToArcTestnet(providerToUse);
      } else {
        await fetchBalances(address);
      }
    } catch (err: any) {
      if (err?.code === 4001) {
        setError('Connection rejected by user.');
      } else {
        setError(err?.message || 'Failed to connect wallet');
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const switchToArcTestnet = async (fallbackProvider?: any) => {
    const providerToUse = fallbackProvider || window.ethereum;
    if (!providerToUse) return;
    setError(null);
    try {
      await providerToUse.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${arcTestnet.id.toString(16)}` }],
      });
    } catch (switchError: any) {
      // 4902 indicates chain not added
      if (switchError.code === 4902 || switchError?.data?.originalError?.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: `0x${arcTestnet.id.toString(16)}`,
                chainName: arcTestnet.name,
                rpcUrls: arcTestnet.rpcUrls.default.http,
                blockExplorerUrls: [arcTestnet.blockExplorers.default.url],
                nativeCurrency: arcTestnet.nativeCurrency,
              },
            ],
          });
        } catch (addError: any) {
          setError(addError?.message || 'Failed to add Arc Testnet');
          throw addError;
        }
      } else if (switchError?.code === 4001) {
        setError('Chain switch rejected by user.');
        throw switchError;
      } else {
        setError(switchError?.message || 'Failed to switch network');
        throw switchError;
      }
    }
    
    // Check if connected after switch
    if (walletAddress) {
       await fetchBalances(walletAddress);
    }
  };

  const disconnect = () => {
    setWallet(null, null);
    setNativeBalance(null);
    setUsdcBalance(null);
  };

  // EIP-1193 events
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else {
        const address = accounts[0];
        setWallet(address, useAppStore.getState().chainId);
        fetchBalances(address);
      }
    };

    const handleChainChanged = (chainIdHex: string) => {
      const chainId = parseInt(chainIdHex, 16);
      const curAddress = useAppStore.getState().walletAddress;
      setWallet(curAddress, chainId);
      if (chainId === arcTestnet.id && curAddress) {
        fetchBalances(curAddress);
      }
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum?.removeListener('chainChanged', handleChainChanged);
    };
  }, [fetchBalances]);

  // Initial load
  useEffect(() => {
    if (walletAddress && window.ethereum) {
       window.ethereum.request({ method: 'eth_chainId' }).then((chainIdHex: any) => {
         const chainId = parseInt(chainIdHex, 16);
         setWallet(walletAddress, chainId);
         if (chainId === arcTestnet.id) {
            fetchBalances(walletAddress);
         }
       }).catch(() => {});
    }
  }, []);

  return {
    walletAddress,
    isConnecting,
    nativeBalance,
    usdcBalance,
    usdcDecimals,
    error,
    connect,
    disconnect,
    switchToArcTestnet,
    getPublicClient,
    getWatchClient,
    getWalletClient,
    providers,
  };
}
