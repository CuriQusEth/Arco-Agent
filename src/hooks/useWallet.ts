import { useEffect, useState, useCallback } from 'react';
import { createWalletClient, createPublicClient, custom, http, webSocket, isAddress } from 'viem';
import { arcTestnet, addresses, erc20Abi } from '../lib/contracts';
import { useAppStore } from '../store';

const activeProviderRef = { current: null as any };

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
    const p = activeProviderRef.current || window.ethereum;
    return createPublicClient({
      chain: arcTestnet,
      transport: p ? custom(p) : http(),
    });
  };

  const getWalletClient = () => {
    const p = activeProviderRef.current || window.ethereum;
    if (!p) return null;
    return createWalletClient({
      chain: arcTestnet,
      transport: custom(p),
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
      activeProviderRef.current = providerToUse;
      
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
    const providerToUse = fallbackProvider || activeProviderRef.current || window.ethereum;
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
          await providerToUse.request({
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
    if (useAppStore.getState().walletAddress) {
       await fetchBalances(useAppStore.getState().walletAddress!);
    }
  };

  const disconnect = () => {
    activeProviderRef.current = null;
    setWallet(null, null);
    setNativeBalance(null);
    setUsdcBalance(null);
  };

  // EIP-1193 events
  useEffect(() => {
    const p = activeProviderRef.current || window.ethereum;
    if (!p) return;

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

    p.on('accountsChanged', handleAccountsChanged);
    p.on('chainChanged', handleChainChanged);

    return () => {
      if (p && p.removeListener) {
        p.removeListener('accountsChanged', handleAccountsChanged);
        p.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [fetchBalances, activeProviderRef.current]);

  // Initial load
  useEffect(() => {
    const p = activeProviderRef.current || window.ethereum;
    if (walletAddress && p) {
       p.request({ method: 'eth_chainId' }).then((chainIdHex: any) => {
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
    getWalletClient,
    providers,
  };
}
