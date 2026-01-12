"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther, parseEther, type Address } from "viem";
import { useReadContracts, useBalance } from "wagmi";
import { base } from "wagmi/chains";

import { rigConfig } from "@/config/rig.config";
import { Button } from "@/components/ui/button";
import { NavBar } from "@/components/nav-bar";
import { useRigInfo, useRigState } from "@/hooks/useRigState";
import { useFarcaster } from "@/hooks/useFarcaster";
import { usePrices } from "@/hooks/usePrices";
import { useTokenMetadata } from "@/hooks/useMetadata";
import {
  useBatchedTransaction,
  encodeApproveCall,
  encodeContractCall,
} from "@/hooks/useBatchedTransaction";
import { CONTRACT_ADDRESSES, MULTICALL_ABI, UNIV2_PAIR_ABI, UNIV2_ROUTER_ABI, CORE_ABI } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { ipfsToHttp } from "@/lib/constants";

const RIG_ADDRESS = rigConfig.rigAddress;
const AUCTION_DEADLINE_BUFFER_SECONDS = 5 * 60;

function AnimatedDots() {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return <span className="inline-block w-4 text-left">{dots}</span>;
}

const formatEth = (value: bigint, maximumFractionDigits = 4) => {
  if (value === 0n) return "0";
  const asNumber = Number(formatEther(value));
  if (!Number.isFinite(asNumber)) {
    return formatEther(value);
  }
  return asNumber.toLocaleString(undefined, {
    maximumFractionDigits,
  });
};

function LpPairIcon({
  rigUri,
  tokenSymbol,
  size = "md",
  className
}: {
  rigUri?: string;
  tokenSymbol?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!rigUri) return;

    const metadataUrl = ipfsToHttp(rigUri);
    if (!metadataUrl) return;

    fetch(metadataUrl)
      .then((res) => res.json())
      .then((metadata) => {
        if (metadata.image) {
          setLogoUrl(ipfsToHttp(metadata.image));
        }
      })
      .catch(() => {});
  }, [rigUri]);

  const sizes = {
    sm: {
      unit: "w-4 h-4",
      fallbackText: "text-[8px]",
      donut: "w-3 h-3 -ml-1.5",
      donutHole: "w-1 h-1",
    },
    md: {
      unit: "w-6 h-6",
      fallbackText: "text-[10px]",
      donut: "w-5 h-5 -ml-2.5",
      donutHole: "w-1.5 h-1.5",
    },
  };

  const s = sizes[size];
  const fallbackLetter = tokenSymbol ? tokenSymbol.charAt(0).toUpperCase() : "?";

  return (
    <div className={cn("relative flex items-center isolate", className)}>
      <div className={cn(s.unit, "rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden z-[2]")}>
        {logoUrl ? (
          <img src={logoUrl} alt="Unit" className="w-full h-full object-cover" />
        ) : (
          <span className={cn(s.fallbackText, "font-bold text-purple-500")}>{fallbackLetter}</span>
        )}
      </div>
      <div className={cn(s.donut, "rounded-full bg-purple-500 flex items-center justify-center z-[1]")}>
        <div className={cn(s.donutHole, "rounded-full bg-black")} />
      </div>
    </div>
  );
}

function WethIcon({ className }: { className?: string }) {
  return (
    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center bg-[#627EEA] overflow-hidden", className)}>
      <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none">
        <path d="M16 4L16 12.87L23 16.22L16 4Z" fill="white" fillOpacity="0.6"/>
        <path d="M16 4L9 16.22L16 12.87L16 4Z" fill="white"/>
        <path d="M16 21.97L16 28L23 17.62L16 21.97Z" fill="white" fillOpacity="0.6"/>
        <path d="M16 28L16 21.97L9 17.62L16 28Z" fill="white"/>
        <path d="M16 20.57L23 16.22L16 12.87L16 20.57Z" fill="white" fillOpacity="0.2"/>
        <path d="M9 16.22L16 20.57L16 12.87L9 16.22Z" fill="white" fillOpacity="0.6"/>
      </svg>
    </div>
  );
}

type AuctionMode = "buy" | "get";

export default function AuctionPage() {
  const [mode, setMode] = useState<AuctionMode>("buy");
  const [lpUnitAmount, setLpUnitAmount] = useState("");
  const [lpSuccess, setLpSuccess] = useState(false);

  const { ethUsdPrice, donutUsdPrice } = usePrices();
  const { address, isConnected, connect } = useFarcaster();

  // Get rig info
  const { rigInfo } = useRigInfo(RIG_ADDRESS);
  const { rigState, refetch: refetchRigState } = useRigState(RIG_ADDRESS, address);
  const { logoUrl: tokenLogoUrl } = useTokenMetadata(rigState?.rigUri);

  const tokenSymbol = rigInfo?.tokenSymbol ?? "TOKEN";
  const tokenName = rigInfo?.tokenName ?? "Loading...";

  // Get auction state via multicall
  const { data: auctionStateResult, refetch: refetchAuction } = useReadContracts({
    contracts: [{
      address: CONTRACT_ADDRESSES.multicall as Address,
      abi: MULTICALL_ABI,
      functionName: "getAuction",
      args: [RIG_ADDRESS, address ?? "0x0000000000000000000000000000000000000000"],
      chainId: base.id,
    }],
    query: {
      enabled: true,
      refetchInterval: 15_000,
    },
  });

  const auctionState = auctionStateResult?.[0]?.result as {
    epochId: bigint;
    initPrice: bigint;
    startTime: bigint;
    paymentToken: Address;
    price: bigint;
    paymentTokenPrice: bigint;
    wethAccumulated: bigint;
    wethBalance: bigint;
    donutBalance: bigint;
    paymentTokenBalance: bigint;
  } | undefined;

  // Batched transaction hooks
  const { execute: executeBatch, state: batchState, reset: resetBatch } = useBatchedTransaction();
  const { execute: executeLpBatch, state: lpBatchState, reset: resetLpBatch } = useBatchedTransaction();

  // LP Maker: Get UNIT token address
  const lpTokenAddress = auctionState?.paymentToken;

  const { data: unitAddressResult } = useReadContracts({
    contracts: [{
      address: CONTRACT_ADDRESSES.core as Address,
      abi: CORE_ABI,
      functionName: "rigToUnit",
      args: [RIG_ADDRESS],
      chainId: base.id,
    }],
    query: { enabled: true },
  });
  const unitAddress = unitAddressResult?.[0]?.result as Address | undefined;

  // Read LP pair info
  const { data: lpPairInfo } = useReadContracts({
    contracts: lpTokenAddress ? [
      { address: lpTokenAddress, abi: UNIV2_PAIR_ABI, functionName: "token0", chainId: base.id },
      { address: lpTokenAddress, abi: UNIV2_PAIR_ABI, functionName: "token1", chainId: base.id },
      { address: lpTokenAddress, abi: UNIV2_PAIR_ABI, functionName: "getReserves", chainId: base.id },
      { address: lpTokenAddress, abi: UNIV2_PAIR_ABI, functionName: "totalSupply", chainId: base.id },
    ] : [],
    query: { enabled: !!lpTokenAddress, refetchInterval: 30_000 },
  });

  const token0 = lpPairInfo?.[0]?.result as Address | undefined;
  const reserves = lpPairInfo?.[2]?.result as [bigint, bigint, number] | undefined;
  const lpTotalSupply = lpPairInfo?.[3]?.result as bigint | undefined;

  const isUnitToken0 = unitAddress && token0 && unitAddress.toLowerCase() === token0.toLowerCase();
  const unitReserve = reserves ? (isUnitToken0 ? reserves[0] : reserves[1]) : 0n;
  const donutReserve = reserves ? (isUnitToken0 ? reserves[1] : reserves[0]) : 0n;

  // User balances
  const { data: userUnitBalance, refetch: refetchUnitBalance } = useBalance({
    address,
    token: unitAddress,
    chainId: base.id,
    query: { enabled: !!address && !!unitAddress, refetchInterval: 15_000 },
  });

  const { data: userDonutBalance, refetch: refetchDonutBalance } = useBalance({
    address,
    token: CONTRACT_ADDRESSES.donut as Address,
    chainId: base.id,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const refetchBalances = useCallback(() => {
    refetchUnitBalance();
    refetchDonutBalance();
    refetchAuction();
    refetchRigState();
  }, [refetchUnitBalance, refetchDonutBalance, refetchAuction, refetchRigState]);

  // Calculate values
  const lpPriceUsd = auctionState
    ? Number(formatEther(auctionState.price)) * Number(formatEther(auctionState.paymentTokenPrice)) * donutUsdPrice
    : 0;
  const wethValueUsd = auctionState
    ? Number(formatEther(auctionState.wethAccumulated)) * ethUsdPrice
    : 0;
  const profitLoss = wethValueUsd - lpPriceUsd;
  const hasInsufficientBalance = auctionState
    ? auctionState.paymentTokenBalance < auctionState.price
    : true;

  // LP Maker calculations
  const parsedUnitAmount = useMemo(() => {
    if (!lpUnitAmount || isNaN(Number(lpUnitAmount))) return 0n;
    try {
      return parseEther(lpUnitAmount);
    } catch {
      return 0n;
    }
  }, [lpUnitAmount]);

  const requiredDonut = useMemo(() => {
    if (parsedUnitAmount === 0n || unitReserve === 0n || donutReserve === 0n) return 0n;
    const exactDonut = (parsedUnitAmount * donutReserve) / unitReserve;
    return (exactDonut * 1005n) / 1000n;
  }, [parsedUnitAmount, unitReserve, donutReserve]);

  const estimatedLpTokens = useMemo(() => {
    if (parsedUnitAmount === 0n || unitReserve === 0n || !lpTotalSupply) return 0n;
    return (parsedUnitAmount * lpTotalSupply) / unitReserve;
  }, [parsedUnitAmount, unitReserve, lpTotalSupply]);

  const hasInsufficientUnitBalance = parsedUnitAmount > 0n && (userUnitBalance?.value ?? 0n) < parsedUnitAmount;
  const hasInsufficientDonutBalance = requiredDonut > 0n && (userDonutBalance?.value ?? 0n) < requiredDonut;

  // Handle buy transaction
  useEffect(() => {
    if (batchState === "success") {
      resetBatch();
      setTimeout(() => refetchBalances(), 1000);
      setTimeout(() => refetchBalances(), 3000);
    } else if (batchState === "error") {
      resetBatch();
    }
  }, [batchState, refetchBalances, resetBatch]);

  // Handle LP creation transaction
  useEffect(() => {
    if (lpBatchState === "success") {
      setLpUnitAmount("");
      setLpSuccess(true);
      setTimeout(() => refetchBalances(), 1000);
      setTimeout(() => refetchBalances(), 3000);
      setTimeout(() => {
        setLpSuccess(false);
        resetLpBatch();
      }, 2000);
    } else if (lpBatchState === "error") {
      resetLpBatch();
    }
  }, [lpBatchState, refetchBalances, resetLpBatch]);

  const handleBuy = useCallback(async () => {
    if (!auctionState) return;

    if (!address) {
      try {
        await connect();
        return;
      } catch {
        return;
      }
    }

    const deadline = BigInt(Math.floor(Date.now() / 1000) + AUCTION_DEADLINE_BUFFER_SECONDS);

    const approveCall = encodeApproveCall(
      auctionState.paymentToken,
      CONTRACT_ADDRESSES.multicall as Address,
      auctionState.price
    );

    const buyCall = encodeContractCall(
      CONTRACT_ADDRESSES.multicall as Address,
      MULTICALL_ABI,
      "buy",
      [RIG_ADDRESS, auctionState.epochId, deadline, auctionState.price]
    );

    try {
      await executeBatch([approveCall, buyCall]);
    } catch (error) {
      console.error("Transaction failed:", error);
      resetBatch();
    }
  }, [address, connect, auctionState, executeBatch, resetBatch]);

  const handleCreateLp = useCallback(async () => {
    if (!address || !unitAddress || !lpTokenAddress || parsedUnitAmount === 0n || requiredDonut === 0n) {
      return;
    }

    if (!isConnected) {
      try {
        await connect();
        return;
      } catch {
        return;
      }
    }

    const deadline = BigInt(Math.floor(Date.now() / 1000) + AUCTION_DEADLINE_BUFFER_SECONDS);
    const minUnitAmount = (parsedUnitAmount * 99n) / 100n;
    const minDonutAmount = (requiredDonut * 99n) / 100n;

    const approveUnitCall = encodeApproveCall(unitAddress, CONTRACT_ADDRESSES.uniV2Router as Address, parsedUnitAmount);
    const approveDonutCall = encodeApproveCall(CONTRACT_ADDRESSES.donut as Address, CONTRACT_ADDRESSES.uniV2Router as Address, requiredDonut);

    const addLiquidityCall = encodeContractCall(
      CONTRACT_ADDRESSES.uniV2Router as Address,
      UNIV2_ROUTER_ABI,
      "addLiquidity",
      [unitAddress, CONTRACT_ADDRESSES.donut, parsedUnitAmount, requiredDonut, minUnitAmount, minDonutAmount, address, deadline]
    );

    try {
      await executeLpBatch([approveUnitCall, approveDonutCall, addLiquidityCall]);
    } catch (error) {
      console.error("LP creation failed:", error);
      resetLpBatch();
    }
  }, [address, isConnected, connect, unitAddress, lpTokenAddress, parsedUnitAmount, requiredDonut, executeLpBatch, resetLpBatch]);

  const isBuying = batchState === "pending" || batchState === "confirming";
  const isCreatingLp = lpBatchState === "pending" || lpBatchState === "confirming";
  const hasWeth = auctionState && auctionState.wethAccumulated > 0n;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
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
              <div className="text-xs text-zinc-500">Auction</div>
            </div>
          </div>
          <button
            onClick={() => setMode(mode === "buy" ? "get" : "buy")}
            className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 transition-colors text-black text-xs font-semibold"
          >
            {mode === "buy" ? "GET LP" : "BUY"}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {!hasWeth ? (
            <div className="flex flex-col items-center justify-center h-64 text-center text-zinc-500">
              <p className="text-lg font-semibold">No WETH available</p>
              <p className="text-sm mt-1">Check back later when the auction has accumulated WETH</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Auction Summary Card */}
              <div className="bg-zinc-900 rounded-xl p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">YOU PAY</div>
                    <div className="flex items-center gap-1.5">
                      <LpPairIcon rigUri={rigState?.rigUri} tokenSymbol={tokenSymbol} />
                      <span className="text-lg font-bold text-purple-500">
                        {auctionState ? formatEth(auctionState.price, 4) : "0"}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      {tokenSymbol}-DONUT LP (~${lpPriceUsd.toFixed(2)})
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">YOU RECEIVE</div>
                    <div className="flex items-center gap-1.5">
                      <WethIcon className="w-5 h-5" />
                      <span className="text-lg font-bold text-white">
                        {auctionState ? formatEth(auctionState.wethAccumulated, 4) : "0"}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      WETH (~${wethValueUsd.toFixed(2)})
                    </div>
                  </div>
                </div>
              </div>

              {/* PnL Indicator */}
              <div
                className={cn(
                  "rounded-lg px-3 py-2 text-center",
                  profitLoss > 0.01
                    ? "bg-green-500/20 border border-green-500/50"
                    : profitLoss >= -0.01
                      ? "bg-yellow-500/20 border border-yellow-500/50"
                      : "bg-red-500/20 border border-red-500/50"
                )}
              >
                {profitLoss > 0.01 ? (
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-green-400 font-semibold">GOOD DEAL</span>
                    <span className="text-green-300 text-sm">+${profitLoss.toFixed(2)} profit</span>
                  </div>
                ) : profitLoss >= -0.01 ? (
                  <span className="text-yellow-400 font-semibold">BREAK EVEN</span>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-red-400 font-semibold">WARNING</span>
                    <span className="text-red-300 text-sm">-${Math.abs(profitLoss).toFixed(2)} loss</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Action Bar */}
        {hasWeth && (
          <div className="fixed bottom-0 left-0 right-0 bg-black">
            <div className="max-w-[520px] mx-auto px-2 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+72px)]">
              {mode === "buy" ? (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="text-xs text-zinc-500">Your LP Balance</div>
                    <div className="flex items-center gap-1.5">
                      <LpPairIcon rigUri={rigState?.rigUri} tokenSymbol={tokenSymbol} size="sm" />
                      <span className="text-sm font-semibold">
                        {auctionState ? formatEth(auctionState.paymentTokenBalance, 4) : "0"}
                      </span>
                    </div>
                  </div>
                  <Button
                    className="w-[calc(50vw-16px)] max-w-[244px] py-2.5 text-sm font-semibold rounded-lg bg-purple-500 hover:bg-purple-600 text-black"
                    onClick={handleBuy}
                    disabled={isBuying || hasInsufficientBalance}
                  >
                    {isBuying ? (
                      <>{batchState === "confirming" ? "CONFIRMING" : "BUYING"}<AnimatedDots /></>
                    ) : hasInsufficientBalance ? (
                      "INSUFFICIENT LP"
                    ) : (
                      "BUY WETH"
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* UNIT Input */}
                  <div className="bg-zinc-900 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] text-zinc-500 uppercase">You provide</div>
                      <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                        <span>Balance:</span>
                        <span className={cn("font-medium", hasInsufficientUnitBalance ? "text-red-400" : "text-white")}>
                          {formatEth(userUnitBalance?.value ?? 0n, 2)}
                        </span>
                        <button
                          onClick={() => userUnitBalance?.value && setLpUnitAmount(formatEther(userUnitBalance.value))}
                          className="text-purple-500 hover:text-purple-400 ml-1"
                        >
                          MAX
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.0"
                        value={lpUnitAmount}
                        onChange={(e) => setLpUnitAmount(e.target.value)}
                        className="flex-1 bg-transparent text-xl font-bold text-white focus:outline-none placeholder:text-zinc-600"
                      />
                      <span className="text-sm font-medium text-zinc-400">{tokenSymbol}</span>
                    </div>
                  </div>

                  {/* DONUT Required */}
                  <div className="bg-zinc-900/50 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] text-zinc-500 uppercase">Required DONUT</div>
                      <span className={cn("text-[10px] font-medium", hasInsufficientDonutBalance ? "text-red-400" : "text-zinc-500")}>
                        Balance: {formatEth(userDonutBalance?.value ?? 0n, 2)}
                      </span>
                    </div>
                    <div className="text-xl font-bold text-zinc-300">
                      {requiredDonut > 0n ? formatEth(requiredDonut, 2) : "0.0"}
                    </div>
                  </div>

                  {/* Estimated Output */}
                  <div className="flex items-center justify-between px-2 text-xs text-zinc-500">
                    <span>You receive ~</span>
                    <span className="text-white font-medium">{formatEth(estimatedLpTokens, 4)} LP tokens</span>
                  </div>

                  <Button
                    className={cn(
                      "w-full py-3 text-sm font-semibold rounded-lg text-black",
                      lpSuccess ? "bg-green-500" : "bg-purple-500 hover:bg-purple-600"
                    )}
                    onClick={handleCreateLp}
                    disabled={isCreatingLp || lpSuccess || parsedUnitAmount === 0n || hasInsufficientUnitBalance || hasInsufficientDonutBalance}
                  >
                    {lpSuccess ? (
                      "SUCCESS"
                    ) : isCreatingLp ? (
                      <>{lpBatchState === "confirming" ? "CONFIRMING" : "CREATING"}<AnimatedDots /></>
                    ) : hasInsufficientUnitBalance ? (
                      `INSUFFICIENT ${tokenSymbol}`
                    ) : hasInsufficientDonutBalance ? (
                      "INSUFFICIENT DONUT"
                    ) : (
                      "CREATE LP"
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <NavBar />
    </main>
  );
}
