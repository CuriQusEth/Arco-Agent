import { useWallet } from '../hooks/useWallet';
import { formatUnits } from 'viem';

export function BalanceWidget() {
  const { nativeBalance, usdcBalance, usdcDecimals, isConnecting } = useWallet();

  if (nativeBalance === null && usdcBalance === null && !isConnecting) {
    return (
      <div className="text-xs text-stone-600 italic">
        Connect wallet to view balances.
      </div>
    );
  }

  const formatBal = (val: bigint | null, decimals: number) => {
    if (val === null) return '0.0000';
    const formatted = formatUnits(val, decimals);
    const parts = formatted.split('.');
    if (parts.length === 1) return parts[0] + '.0000';
    return `${parts[0]}.${parts[1].substring(0, 4).padEnd(4, '0')}`;
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-subtle bg-stone-900/40 p-3">
        <div className="flex justify-between text-xs text-stone-500"><span>Native Gas</span><span>18 Dec</span></div>
        <div className="text-lg font-semibold text-stone-200 mt-1">{formatBal(nativeBalance, 18)} USDC</div>
        <div className="mt-1 text-[10px] text-stone-600 italic">Protocol Level Balance</div>
      </div>
      <div className="rounded-lg border border-subtle bg-stone-900/40 p-3">
        <div className="flex justify-between text-xs text-stone-500"><span>USDC (ERC-20)</span><span>{usdcDecimals} Dec</span></div>
        <div className="text-lg font-semibold text-stone-200 mt-1">{formatBal(usdcBalance, usdcDecimals)} USDC</div>
        <div className="mt-1 text-[10px] text-stone-600 italic">0x3600...0000</div>
      </div>
      <div className="rounded-lg border border-stone-800/50 p-3 opacity-60">
        <div className="flex justify-between text-xs text-stone-500"><span>EURC</span><span>6 Dec</span></div>
        <div className="text-lg font-semibold text-stone-300 mt-1">0.0000 EURC</div>
      </div>
    </div>
  );
}
