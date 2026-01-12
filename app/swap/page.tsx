"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, Pickaxe } from "lucide-react";
import {
  useBalance,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatEther, formatUnits, parseUnits, type Address } from "viem";

import { rigConfig } from "@/config/rig.config";
import { NavBar } from "@/components/nav-bar";
import { useRigState, useRigInfo } from "@/hooks/useRigState";
import { useDexScreener } from "@/hooks/useDexScreener";
import { useFarcaster } from "@/hooks/useFarcaster";
import { usePrices } from "@/hooks/usePrices";
import { useTokenMetadata } from "@/hooks/useMetadata";
import { useSwapPrice, useSwapQuote, formatBuyAmount } from "@/hooks/useSwapQuote";
import {
  useBatchedTransaction,
  encodeApproveCall,
  type Call,
} from "@/hooks/useBatchedTransaction";
import { NATIVE_ETH_ADDRESS } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

// Get the rig address from config
const RIG_ADDRESS = rigConfig.rigAddress;

export default function SwapPage() {
  const [tradeDirection, setTradeDirection] = useState<"buy" | "sell">("buy");
  const [tradeAmount, setTradeAmount] = useState("");
  const [tradeResult, setTradeResult] = useState<"success" | "failure" | null>(null);
  const tradeResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { ethUsdPrice, donutUsdPrice } = usePrices();

  // Farcaster context and wallet connection
  const { address, isConnected, connect } = useFarcaster();

  // Rig data
  const { rigState, refetch: refetchRigState } = useRigState(RIG_ADDRESS, address);
  const { rigInfo } = useRigInfo(RIG_ADDRESS);

  // DexScreener data
  const { pairData } = useDexScreener(RIG_ADDRESS, rigInfo?.unitAddress);

  // Token metadata
  const { logoUrl: tokenLogoUrl } = useTokenMetadata(rigState?.rigUri);

  // Trade transaction handling - for buys (ETH -> Token, no approval needed)
  const { sendTransaction, isPending: isSwapping, data: swapTxHash } = useSendTransaction();
  const { isLoading: isWaitingSwap, isSuccess: swapSuccess, isError: swapError } = useWaitForTransactionReceipt({ hash: swapTxHash });

  // Batched transaction handling - for sells (Token -> ETH, needs approval)
  const {
    execute: executeBatch,
    state: batchState,
    reset: resetBatch,
  } = useBatchedTransaction();

  // Trade balances
  const { data: ethBalanceData, refetch: refetchEthBalance } = useBalance({
    address,
    chainId: DEFAULT_CHAIN_ID,
  });

  const { data: unitBalanceData, refetch: refetchUnitBalance } = useBalance({
    address,
    token: rigInfo?.unitAddress as Address,
    chainId: DEFAULT_CHAIN_ID,
    query: { enabled: !!rigInfo?.unitAddress },
  });

  const refetchBalances = useCallback(() => {
    refetchEthBalance();
    refetchUnitBalance();
  }, [refetchEthBalance, refetchUnitBalance]);

  // Swap tokens for trading
  const sellToken = tradeDirection === "buy" ? NATIVE_ETH_ADDRESS : (rigInfo?.unitAddress || "");
  const buyToken = tradeDirection === "buy" ? (rigInfo?.unitAddress || "") : NATIVE_ETH_ADDRESS;
  const sellDecimals = 18; // ETH and unit tokens are both 18 decimals

  // Get price quote
  const { data: tradePriceQuote, isLoading: isLoadingTradePrice, error: tradePriceError } = useSwapPrice({
    sellToken,
    buyToken,
    sellAmount: tradeAmount || "0",
    sellTokenDecimals: sellDecimals,
    enabled: !!rigInfo?.unitAddress && !!tradeAmount && parseFloat(tradeAmount) > 0,
  });

  // Calculate output amount and price impact for auto slippage
  const tradeOutputAmountForSlippage = tradePriceQuote?.buyAmount
    ? formatBuyAmount(tradePriceQuote.buyAmount, 18)
    : "0";

  // Auto slippage: price impact + 2%, minimum 2%, maximum 49%
  const slippage = useMemo(() => {
    if (!tradePriceQuote?.buyAmount || !tradeAmount || parseFloat(tradeAmount) === 0) return 2;

    let inputUsd = tradePriceQuote?.sellAmountUsd ? parseFloat(tradePriceQuote.sellAmountUsd) : 0;
    let outputUsd = tradePriceQuote?.buyAmountUsd ? parseFloat(tradePriceQuote.buyAmountUsd) : 0;

    if (inputUsd === 0 || outputUsd === 0) {
      const dexPrice = pairData?.priceUsd ? parseFloat(pairData.priceUsd) : null;
      const onChainPrice = rigState?.unitPrice && rigState.unitPrice > 0n
        ? Number(formatEther(rigState.unitPrice)) * donutUsdPrice
        : 0;
      const tokenPrice = dexPrice ?? onChainPrice;

      inputUsd = parseFloat(tradeAmount) * (tradeDirection === "buy" ? ethUsdPrice : tokenPrice);
      outputUsd = parseFloat(tradeOutputAmountForSlippage) * (tradeDirection === "buy" ? tokenPrice : ethUsdPrice);
    }

    if (inputUsd === 0) return 2;

    const impact = ((inputUsd - outputUsd) / inputUsd) * 100;
    return Math.min(49, Math.max(2, Math.ceil(Math.max(0, impact)) + 2));
  }, [tradePriceQuote, tradeAmount, tradeOutputAmountForSlippage, tradeDirection, ethUsdPrice, pairData?.priceUsd, rigState?.unitPrice, donutUsdPrice]);

  // Get full quote for trading
  const { data: tradeQuote, isLoading: isLoadingTradeQuote } = useSwapQuote({
    sellToken,
    buyToken,
    sellAmount: tradeAmount || "0",
    sellTokenDecimals: sellDecimals,
    taker: address,
    slippageBps: Math.round(slippage * 100),
    enabled: !!rigInfo?.unitAddress && !!tradeAmount && parseFloat(tradeAmount) > 0 && !!address,
  });

  // Track last processed swap hash to detect new successful swaps
  const lastProcessedSwapHash = useRef<string | null>(null);

  // Handle swap result (for buys via sendTransaction)
  useEffect(() => {
    if (swapSuccess && swapTxHash && swapTxHash !== lastProcessedSwapHash.current) {
      lastProcessedSwapHash.current = swapTxHash;
      setTradeAmount("");
      refetchBalances();
      refetchRigState();
      setTimeout(() => {
        refetchBalances();
        refetchRigState();
      }, 2000);
      if (tradeResultTimeoutRef.current) clearTimeout(tradeResultTimeoutRef.current);
      setTradeResult("success");
      tradeResultTimeoutRef.current = setTimeout(() => {
        setTradeResult(null);
        tradeResultTimeoutRef.current = null;
      }, 3000);
    }
  }, [swapSuccess, swapTxHash, refetchBalances, refetchRigState]);

  // Track last processed error hash
  const lastProcessedErrorHash = useRef<string | null>(null);

  // Handle swap failure (for buys via sendTransaction)
  useEffect(() => {
    if (swapError && swapTxHash && swapTxHash !== lastProcessedErrorHash.current) {
      lastProcessedErrorHash.current = swapTxHash;
      if (tradeResultTimeoutRef.current) clearTimeout(tradeResultTimeoutRef.current);
      setTradeResult("failure");
      tradeResultTimeoutRef.current = setTimeout(() => {
        setTradeResult(null);
        tradeResultTimeoutRef.current = null;
      }, 3000);
    }
  }, [swapError, swapTxHash]);

  // Handle batched transaction result (for sells)
  useEffect(() => {
    if (batchState === "success") {
      setTradeAmount("");
      resetBatch();
      refetchBalances();
      refetchRigState();
      setTimeout(() => {
        refetchBalances();
        refetchRigState();
      }, 2000);
      if (tradeResultTimeoutRef.current) clearTimeout(tradeResultTimeoutRef.current);
      setTradeResult("success");
      tradeResultTimeoutRef.current = setTimeout(() => {
        setTradeResult(null);
        tradeResultTimeoutRef.current = null;
      }, 3000);
    } else if (batchState === "error") {
      resetBatch();
      if (tradeResultTimeoutRef.current) clearTimeout(tradeResultTimeoutRef.current);
      setTradeResult("failure");
      tradeResultTimeoutRef.current = setTimeout(() => {
        setTradeResult(null);
        tradeResultTimeoutRef.current = null;
      }, 3000);
    }
  }, [batchState, resetBatch, refetchBalances, refetchRigState]);

  useEffect(() => {
    return () => {
      if (tradeResultTimeoutRef.current) clearTimeout(tradeResultTimeoutRef.current);
    };
  }, []);

  // Trade calculations
  const tradeBalance = tradeDirection === "buy" ? ethBalanceData : unitBalanceData;
  const tradeOutputAmount = tradePriceQuote?.buyAmount
    ? formatBuyAmount(tradePriceQuote.buyAmount, 18)
    : "0";
  const formattedTradeOutput = parseFloat(tradeOutputAmount).toLocaleString(undefined, { maximumFractionDigits: 6 });

  // Calculate price impact for display
  const priceImpact = useMemo(() => {
    if (!tradePriceQuote?.buyAmount || !tradeAmount || parseFloat(tradeAmount) === 0) return null;

    let inputUsd = tradePriceQuote?.sellAmountUsd ? parseFloat(tradePriceQuote.sellAmountUsd) : 0;
    let outputUsd = tradePriceQuote?.buyAmountUsd ? parseFloat(tradePriceQuote.buyAmountUsd) : 0;

    if (inputUsd === 0 || outputUsd === 0) {
      const dexPrice = pairData?.priceUsd ? parseFloat(pairData.priceUsd) : null;
      const onChainPrice = rigState?.unitPrice && rigState.unitPrice > 0n
        ? Number(formatEther(rigState.unitPrice)) * donutUsdPrice
        : 0;
      const tokenPrice = dexPrice ?? onChainPrice;

      inputUsd = parseFloat(tradeAmount) * (tradeDirection === "buy" ? ethUsdPrice : tokenPrice);
      outputUsd = parseFloat(tradeOutputAmount) * (tradeDirection === "buy" ? tokenPrice : ethUsdPrice);
    }

    if (inputUsd === 0) return null;

    const impact = ((inputUsd - outputUsd) / inputUsd) * 100;
    return Math.max(0, impact);
  }, [tradePriceQuote, tradeAmount, tradeOutputAmount, tradeDirection, ethUsdPrice, pairData?.priceUsd, rigState?.unitPrice, donutUsdPrice]);

  const tradeInsufficientBalance = useMemo(() => {
    if (!tradeAmount || !tradeBalance) return false;
    try {
      const sellAmountWei = parseUnits(tradeAmount, 18);
      return sellAmountWei > tradeBalance.value;
    } catch {
      return false;
    }
  }, [tradeAmount, tradeBalance]);

  const isTradeLoading = isLoadingTradePrice || isLoadingTradeQuote;
  const isBatchPending = batchState === "pending" || batchState === "confirming";
  const isTradePending = isBatchPending || isSwapping || isWaitingSwap;

  // Token info
  const tokenSymbol = rigInfo?.tokenSymbol ?? "TOKEN";
  const tokenName = rigInfo?.tokenName ?? "Loading...";

  // Token price
  const unitPrice = rigState?.unitPrice ?? 0n;
  const tokenPriceUsd = unitPrice > 0n ? Number(formatEther(unitPrice)) * donutUsdPrice : 0;
  const dexPriceUsd = pairData?.priceUsd ? parseFloat(pairData.priceUsd) : null;
  const displayPriceUsd = dexPriceUsd ?? tokenPriceUsd;

  // Check if there's no liquidity
  const hasNoLiquidity = tradePriceError || (tradeAmount && parseFloat(tradeAmount) > 0 && !isLoadingTradePrice && !tradePriceQuote?.buyAmount);

  // Trade button text
  const tradeButtonText = useMemo(() => {
    if (tradeResult === "success") return "Trade successful!";
    if (tradeResult === "failure") return "Trade failed";
    if (!isConnected) return "Connect Wallet";
    if (!tradeAmount || parseFloat(tradeAmount) === 0) return "Enter amount";
    if (tradeInsufficientBalance) return "Insufficient balance";
    if (hasNoLiquidity) return "No liquidity";
    if (isBatchPending) return batchState === "confirming" ? "Confirming..." : "Swapping...";
    if (isSwapping || isWaitingSwap) return "Swapping...";
    if (isLoadingTradeQuote) return "Loading...";
    return tradeDirection === "buy" ? "Buy" : "Sell";
  }, [tradeResult, isConnected, tradeAmount, tradeInsufficientBalance, hasNoLiquidity, isBatchPending, batchState, isSwapping, isWaitingSwap, isLoadingTradeQuote, tradeDirection]);

  const canTrade = isConnected && tradeAmount && parseFloat(tradeAmount) > 0 && !tradeInsufficientBalance && !isTradeLoading && !hasNoLiquidity && !!tradeQuote?.transaction?.to;

  // Trade handler
  const handleTrade = useCallback(async () => {
    if (!tradeQuote?.transaction || !address || !tradeAmount) return;

    if (tradeDirection === "sell" && rigInfo?.unitAddress) {
      const sellAmountWei = parseUnits(tradeAmount, 18);
      const approveCall = encodeApproveCall(
        rigInfo.unitAddress as Address,
        tradeQuote.transaction.to as Address,
        sellAmountWei
      );

      const swapCall: Call = {
        to: tradeQuote.transaction.to as Address,
        data: tradeQuote.transaction.data as `0x${string}`,
        value: BigInt(tradeQuote.transaction.value || "0"),
      };

      try {
        await executeBatch([approveCall, swapCall]);
      } catch (error) {
        console.error("Trade failed:", error);
      }
    } else {
      sendTransaction({
        to: tradeQuote.transaction.to as Address,
        data: tradeQuote.transaction.data as `0x${string}`,
        value: BigInt(tradeQuote.transaction.value || "0"),
        chainId: DEFAULT_CHAIN_ID,
      });
    }
  }, [tradeQuote, address, tradeAmount, tradeDirection, rigInfo?.unitAddress, executeBatch, sendTransaction]);

  // Loading state
  const isPageLoading = !rigInfo || !rigState;

  if (isPageLoading) {
    return (
      <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
        <div
          className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
          }}
        />
        <NavBar />
      </main>
    );
  }

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
        }}
      >
        {/* Header */}
        <div className="px-2 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {tokenLogoUrl ? (
                <img src={tokenLogoUrl} alt={tokenSymbol} className="w-8 h-8 rounded-lg" />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center text-black font-bold text-sm">
                  {tokenSymbol.slice(0, 2)}
                </div>
              )}
              <div>
                <div className="text-sm font-bold">{tokenName}</div>
                <div className="text-xs text-zinc-500">${displayPriceUsd.toFixed(6)}</div>
              </div>
            </div>
            <Link
              href="/mine"
              className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 transition-colors text-black text-xs font-semibold flex items-center gap-1"
            >
              <Pickaxe className="w-3 h-3" />
              Mine
            </Link>
          </div>
        </div>

        {/* Swap Interface */}
        <div className="flex-1 overflow-y-auto scrollbar-hide px-2">
          <h2 className="text-lg font-bold mb-4">Swap</h2>

          {/* Trade Input */}
          <div className="bg-zinc-900 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-zinc-500">You pay</span>
              {tradeBalance && (
                <button
                  onClick={() => {
                    if (tradeDirection === "buy" && ethBalanceData) {
                      const maxEth = parseFloat(formatUnits(ethBalanceData.value, 18)) - 0.001;
                      setTradeAmount(Math.max(0, maxEth).toString());
                    } else if (tradeDirection === "sell" && unitBalanceData) {
                      setTradeAmount(formatUnits(unitBalanceData.value, 18));
                    }
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-400"
                >
                  Balance: {parseFloat(formatUnits(tradeBalance.value, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-zinc-800 flex items-center justify-center">
                {tradeDirection === "buy" ? (
                  <img src="https://assets.coingecko.com/coins/images/279/small/ethereum.png" alt="ETH" className="w-full h-full object-cover" />
                ) : tokenLogoUrl ? (
                  <img src={tokenLogoUrl} alt={tokenSymbol} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-bold text-purple-500">{tokenSymbol.slice(0, 2)}</span>
                )}
              </div>
              <input
                type="number"
                value={tradeAmount}
                onChange={(e) => setTradeAmount(e.target.value)}
                placeholder="0"
                className="flex-1 min-w-0 bg-transparent text-xl font-semibold focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="shrink-0 text-sm font-semibold text-zinc-400">
                {tradeDirection === "buy" ? "ETH" : tokenSymbol}
              </span>
            </div>
            <div className="text-xs text-zinc-600 mt-1">
              {tradeAmount && parseFloat(tradeAmount) > 0
                ? `$${(parseFloat(tradeAmount) * (tradeDirection === "buy" ? ethUsdPrice : displayPriceUsd)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "$0.00"}
            </div>
          </div>

          {/* Swap Direction Button */}
          <div className="flex justify-center -my-4 relative z-10">
            <button
              onClick={() => {
                setTradeDirection(tradeDirection === "buy" ? "sell" : "buy");
                setTradeAmount("");
              }}
              className="bg-zinc-700 hover:bg-zinc-600 p-2 rounded-xl border-4 border-black transition-colors"
            >
              <ArrowDownUp className="w-4 h-4" />
            </button>
          </div>

          {/* Trade Output */}
          <div className="bg-zinc-900/50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-zinc-500">You receive</span>
              <span className="text-xs text-zinc-500">
                Balance: {tradeDirection === "buy"
                  ? (unitBalanceData ? parseFloat(formatUnits(unitBalanceData.value, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "0")
                  : (ethBalanceData ? parseFloat(formatUnits(ethBalanceData.value, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "0")
                }
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-zinc-800 flex items-center justify-center">
                {tradeDirection === "buy" ? (
                  tokenLogoUrl ? (
                    <img src={tokenLogoUrl} alt={tokenSymbol} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-purple-500">{tokenSymbol.slice(0, 2)}</span>
                  )
                ) : (
                  <img src="https://assets.coingecko.com/coins/images/279/small/ethereum.png" alt="ETH" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 text-xl font-semibold text-zinc-300">
                {isTradeLoading && tradeAmount ? (
                  <span className="inline-flex items-center gap-0.5">
                    <span className="animate-bounce-dot-1">•</span>
                    <span className="animate-bounce-dot-2">•</span>
                    <span className="animate-bounce-dot-3">•</span>
                  </span>
                ) : formattedTradeOutput}
              </div>
              <span className="shrink-0 text-sm font-semibold text-zinc-400">
                {tradeDirection === "buy" ? tokenSymbol : "ETH"}
              </span>
            </div>
            <div className="text-xs text-zinc-600 mt-1">
              {parseFloat(tradeOutputAmount) > 0
                ? `$${(parseFloat(tradeOutputAmount) * (tradeDirection === "buy" ? displayPriceUsd : ethUsdPrice)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "$0.00"}
            </div>
          </div>

          {/* Trade Info */}
          <div className="flex justify-between text-xs text-zinc-500 px-1 py-2 mt-2">
            <span>Min. received</span>
            <span>
              {tradePriceQuote?.buyAmount
                ? (parseFloat(formatBuyAmount(tradePriceQuote.buyAmount, 18)) * (1 - slippage / 100)).toLocaleString(undefined, { maximumFractionDigits: 6 })
                : "0"
              } {tradeDirection === "buy" ? tokenSymbol : "ETH"}
            </span>
          </div>
          <div className="flex justify-between text-xs px-1 pb-3">
            <span className="text-zinc-500">Price impact / Slippage</span>
            <span className={cn(
              priceImpact !== null && priceImpact > 10 ? "text-red-500" :
              priceImpact !== null && priceImpact > 5 ? "text-yellow-500" : "text-zinc-500"
            )}>
              {priceImpact !== null && priceImpact > 5 && "⚠️ "}
              {priceImpact !== null ? `${priceImpact.toFixed(2)}%` : "—"} / {slippage}%
            </span>
          </div>

          {/* Trade Button */}
          <button
            onClick={handleTrade}
            disabled={!canTrade || isTradePending || tradeResult !== null}
            className={cn(
              "w-full py-3 rounded-lg font-semibold transition-all text-sm bg-purple-500 text-black hover:bg-purple-600",
              (!canTrade || isTradePending || tradeResult !== null) && "cursor-not-allowed",
              (!canTrade || isTradePending) && tradeResult === null && "opacity-40"
            )}
          >
            {tradeButtonText}
          </button>

          {/* No Liquidity Message */}
          {hasNoLiquidity && tradeAmount && parseFloat(tradeAmount) > 0 && (
            <div className="mt-2 text-center text-xs text-zinc-500">
              This token may only be tradeable on its native DEX
            </div>
          )}
        </div>
      </div>
      <NavBar />
    </main>
  );
}
