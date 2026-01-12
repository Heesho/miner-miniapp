"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Flame } from "lucide-react";
import { formatEther, parseEther, parseUnits, formatUnits, type Address, zeroAddress } from "viem";
import { useReadContracts, useBalance } from "wagmi";
import { base } from "wagmi/chains";

import { Button } from "@/components/ui/button";
import { NavBar } from "@/components/nav-bar";
import { useAllRigAddresses } from "@/hooks/useAllRigs";
import {
  useAllAuctionStates,
  type AuctionListItem,
} from "@/hooks/useAuctionState";
import { useRigInfo, useRigState } from "@/hooks/useRigState";
import { useFarcaster } from "@/hooks/useFarcaster";
import {
  useBatchedTransaction,
  encodeApproveCall,
  encodeContractCall,
} from "@/hooks/useBatchedTransaction";
import { CONTRACT_ADDRESSES, MULTICALL_ABI, UNIV2_PAIR_ABI, UNIV2_ROUTER_ABI, CORE_ABI, ERC20_ABI } from "@/lib/contracts";
import { cn, getEthPrice, getDonutPrice } from "@/lib/utils";
import {
  DEFAULT_ETH_PRICE_USD,
  DEFAULT_DONUT_PRICE_USD,
  PRICE_REFETCH_INTERVAL_MS,
  ipfsToHttp,
} from "@/lib/constants";

const AUCTION_DEADLINE_BUFFER_SECONDS = 5 * 60;

// Animated dots component for loading states
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


// LP Pair icon component - shows two overlapping token icons
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

  // Fetch metadata to get image URL
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
      .catch(() => {
        // Silently fail - will show fallback
      });
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
      {/* Unit token (left/front) */}
      <div className={cn(s.unit, "rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden z-[2]")}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Unit"
            className="w-full h-full object-cover"
          />
        ) : (
          <span className={cn(s.fallbackText, "font-bold text-purple-500")}>{fallbackLetter}</span>
        )}
      </div>
      {/* DONUT token (right/back) - donut shape, behind unit */}
      <div className={cn(s.donut, "rounded-full bg-purple-500 flex items-center justify-center z-[1]")}>
        <div className={cn(s.donutHole, "rounded-full bg-black")} />
      </div>
    </div>
  );
}


// WETH icon component - uses real ETH logo
function WethIcon({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center bg-[#627EEA] overflow-hidden",
        className
      )}
    >
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

// Auction card component
function AuctionCard({
  auction,
  ethUsdPrice,
  donutUsdPrice,
  isSelected,
  onClick,
}: {
  auction: AuctionListItem;
  ethUsdPrice: number;
  donutUsdPrice: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { rigInfo } = useRigInfo(auction.rigAddress);
  const { rigState } = useRigState(auction.rigAddress, undefined);

  // LP price is in DONUT value, convert to USD
  const lpPriceUsd =
    Number(formatEther(auction.auctionState.price)) *
    Number(formatEther(auction.auctionState.paymentTokenPrice)) *
    donutUsdPrice;
  const wethValueUsd =
    Number(formatEther(auction.auctionState.wethAccumulated)) * ethUsdPrice;

  const tokenSymbol = rigInfo?.tokenSymbol ?? "TOKEN";
  const rigUri = rigState?.rigUri;

  const isProfitable = wethValueUsd > lpPriceUsd;

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative rounded-xl p-3 cursor-pointer transition-all bg-zinc-900 mb-1.5",
        isSelected
          ? "ring-2 ring-purple-500 shadow-[0_0_15px_rgba(160,111,255,0.3)]"
          : "ring-1 ring-zinc-800 hover:ring-zinc-700"
      )}
    >
      <div className="grid grid-cols-2 gap-3">
        {/* YOU PAY */}
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
            YOU PAY
          </div>
          <div className="flex items-center gap-1.5 h-6">
            <LpPairIcon rigUri={rigUri} tokenSymbol={tokenSymbol} />
            <span className="text-sm font-bold text-purple-500">
              {formatEth(auction.auctionState.price, 4)}
            </span>
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {tokenSymbol}-DONUT LP (~${lpPriceUsd.toFixed(2)})
          </div>
        </div>

        {/* YOU RECEIVE */}
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
            YOU RECEIVE
          </div>
          <div className="flex items-center gap-1.5 h-6">
            <WethIcon className="w-5 h-5" />
            <span className="text-sm font-bold text-white">
              {formatEth(auction.auctionState.wethAccumulated, 4)}
            </span>
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            WETH (~${wethValueUsd.toFixed(2)})
          </div>
        </div>
      </div>
    </div>
  );
}

type AuctionMode = "buy" | "get";

export default function AuctionsPage() {
  const [ethUsdPrice, setEthUsdPrice] = useState<number>(DEFAULT_ETH_PRICE_USD);
  const [donutUsdPrice, setDonutUsdPrice] = useState<number>(DEFAULT_DONUT_PRICE_USD);
  const [selectedAuctionAddress, setSelectedAuctionAddress] = useState<`0x${string}` | null>(null);
  const [pendingAuction, setPendingAuction] = useState<AuctionListItem | null>(
    null
  );
  const [mode, setMode] = useState<AuctionMode>("buy");
  const [lpUnitAmount, setLpUnitAmount] = useState("");
  const [lpSuccess, setLpSuccess] = useState(false);

  // Farcaster context and wallet connection
  const { address, isConnected, connect } = useFarcaster();

  // LP Maker: Batched transaction hook for approve + approve + addLiquidity
  const {
    execute: executeLpBatch,
    state: lpBatchState,
    reset: resetLpBatch,
  } = useBatchedTransaction();

  // Batched transaction hook for approve + buy
  const {
    execute: executeBatch,
    state: batchState,
    reset: resetBatch,
  } = useBatchedTransaction();

  // Get all rig addresses
  const { addresses: rigAddresses } = useAllRigAddresses();

  // Get all auction states
  const { auctions, isLoading, refetch: refetchAuctions } = useAllAuctionStates(
    rigAddresses,
    address
  );

  // Filter out auctions with 0 WETH and sort by profitability
  const sortedAuctions = useMemo(() => {
    return [...auctions]
      .filter((auction) => auction.auctionState.wethAccumulated > 0n)
      .sort((a, b) => {
      // Calculate USD values for auction A
      const aLpUsd =
        Number(formatEther(a.auctionState.price)) *
        Number(formatEther(a.auctionState.paymentTokenPrice)) *
        donutUsdPrice;
      const aWethUsd =
        Number(formatEther(a.auctionState.wethAccumulated)) * ethUsdPrice;
      const aDiff = aWethUsd - aLpUsd;

      // Calculate USD values for auction B
      const bLpUsd =
        Number(formatEther(b.auctionState.price)) *
        Number(formatEther(b.auctionState.paymentTokenPrice)) *
        donutUsdPrice;
      const bWethUsd =
        Number(formatEther(b.auctionState.wethAccumulated)) * ethUsdPrice;
      const bDiff = bWethUsd - bLpUsd;

      // Both profitable (positive diff): higher diff is better
      if (aDiff > 0 && bDiff > 0) {
        return bDiff - aDiff;
      }
      // Both unprofitable (negative diff): smaller loss is better
      if (aDiff < 0 && bDiff < 0) {
        return bDiff - aDiff; // Less negative (smaller loss) comes first
      }
      // A is profitable, B is not: A comes first
      if (aDiff >= 0 && bDiff < 0) {
        return -1;
      }
      // B is profitable, A is not: B comes first
      if (bDiff >= 0 && aDiff < 0) {
        return 1;
      }
      // Both equal (diff = 0): they're equal
      return 0;
    });
  }, [auctions, ethUsdPrice, donutUsdPrice]);


  // Fetch ETH and DONUT prices
  useEffect(() => {
    const fetchPrices = async () => {
      const [ethPrice, donutPrice] = await Promise.all([
        getEthPrice(),
        getDonutPrice(),
      ]);
      setEthUsdPrice(ethPrice);
      setDonutUsdPrice(donutPrice);
    };
    fetchPrices();
    const interval = setInterval(fetchPrices, PRICE_REFETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Handle batch transaction completion
  useEffect(() => {
    if (batchState === "success") {
      setPendingAuction(null);
      resetBatch();
      // Refetch with delays to ensure RPC has updated state
      const refetchWithDelays = () => {
        setTimeout(() => refetchAuctions(), 1000);
        setTimeout(() => refetchAuctions(), 3000);
        setTimeout(() => refetchAuctions(), 6000);
      };
      refetchWithDelays();
    } else if (batchState === "error") {
      setPendingAuction(null);
      resetBatch();
    }
  }, [batchState, refetchAuctions, resetBatch]);

  const handleBuy = useCallback(
    async (auction: AuctionListItem) => {
      if (!address) {
        try {
          await connect();
        } catch {
          return;
        }
      }

      setPendingAuction(auction);

      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + AUCTION_DEADLINE_BUFFER_SECONDS
      );

      // Create batched calls: approve + buy
      const approveCall = encodeApproveCall(
        auction.auctionState.paymentToken,
        CONTRACT_ADDRESSES.multicall as Address,
        auction.auctionState.price
      );

      const buyCall = encodeContractCall(
        CONTRACT_ADDRESSES.multicall as Address,
        MULTICALL_ABI,
        "buy",
        [
          auction.rigAddress,
          auction.auctionState.epochId,
          deadline,
          auction.auctionState.price,
        ]
      );

      try {
        await executeBatch([approveCall, buyCall]);
      } catch (error) {
        console.error("Transaction failed:", error);
        setPendingAuction(null);
        resetBatch();
      }
    },
    [address, connect, executeBatch, resetBatch]
  );

  // Auto-select first auction if none selected
  useEffect(() => {
    if (sortedAuctions.length > 0 && !selectedAuctionAddress) {
      setSelectedAuctionAddress(sortedAuctions[0].rigAddress);
    }
  }, [sortedAuctions, selectedAuctionAddress]);

  // Get selected auction
  const selectedAuction = auctions.find(
    (a) => a.rigAddress === selectedAuctionAddress
  );

  // Calculate values for selected auction
  // LP price is in DONUT value, convert to USD
  const selectedLpPriceUsd = selectedAuction
    ? Number(formatEther(selectedAuction.auctionState.price)) *
      Number(formatEther(selectedAuction.auctionState.paymentTokenPrice)) *
      donutUsdPrice
    : 0;
  const selectedWethValueUsd = selectedAuction
    ? Number(formatEther(selectedAuction.auctionState.wethAccumulated)) *
      ethUsdPrice
    : 0;
  const selectedProfitLoss = selectedWethValueUsd - selectedLpPriceUsd;
  const hasInsufficientBalance = selectedAuction
    ? selectedAuction.auctionState.paymentTokenBalance <
      selectedAuction.auctionState.price
    : true;

  // Get token symbol and rigUri for selected auction (always call hooks, pass undefined if no selection)
  const { rigInfo: selectedRigInfo } = useRigInfo(
    selectedAuctionAddress ?? undefined
  );
  const { rigState: selectedRigState } = useRigState(
    selectedAuctionAddress ?? undefined,
    undefined
  );
  const selectedTokenSymbol = selectedRigInfo?.tokenSymbol ?? "TOKEN";
  const selectedRigUri = selectedRigState?.rigUri;

  const isBuying = batchState === "pending" || batchState === "confirming";

  // LP Maker: Get UNIT token address for selected auction
  const lpTokenAddress = selectedAuction?.auctionState.paymentToken;

  // Read UNIT address from Core contract (rigToUnit mapping)
  const { data: unitAddressResult } = useReadContracts({
    contracts: selectedAuctionAddress ? [{
      address: CONTRACT_ADDRESSES.core as Address,
      abi: CORE_ABI,
      functionName: "rigToUnit",
      args: [selectedAuctionAddress],
      chainId: base.id,
    }] : [],
    query: {
      enabled: !!selectedAuctionAddress,
    },
  });
  const unitAddress = unitAddressResult?.[0]?.result as Address | undefined;

  // Read LP pair info (token0, token1, reserves)
  const { data: lpPairInfo } = useReadContracts({
    contracts: lpTokenAddress ? [
      {
        address: lpTokenAddress,
        abi: UNIV2_PAIR_ABI,
        functionName: "token0",
        chainId: base.id,
      },
      {
        address: lpTokenAddress,
        abi: UNIV2_PAIR_ABI,
        functionName: "token1",
        chainId: base.id,
      },
      {
        address: lpTokenAddress,
        abi: UNIV2_PAIR_ABI,
        functionName: "getReserves",
        chainId: base.id,
      },
      {
        address: lpTokenAddress,
        abi: UNIV2_PAIR_ABI,
        functionName: "totalSupply",
        chainId: base.id,
      },
    ] : [],
    query: {
      enabled: !!lpTokenAddress,
      refetchInterval: 30_000,
    },
  });

  const token0 = lpPairInfo?.[0]?.result as Address | undefined;
  const token1 = lpPairInfo?.[1]?.result as Address | undefined;
  const reserves = lpPairInfo?.[2]?.result as [bigint, bigint, number] | undefined;
  const lpTotalSupply = lpPairInfo?.[3]?.result as bigint | undefined;

  // Determine which token is UNIT and which is DONUT
  const isUnitToken0 = unitAddress && token0 && unitAddress.toLowerCase() === token0.toLowerCase();
  const unitReserve = reserves ? (isUnitToken0 ? reserves[0] : reserves[1]) : 0n;
  const donutReserve = reserves ? (isUnitToken0 ? reserves[1] : reserves[0]) : 0n;

  // Read user's UNIT and DONUT balances
  const { data: userUnitBalance, refetch: refetchUnitBalance } = useBalance({
    address: address,
    token: unitAddress,
    chainId: base.id,
    query: {
      enabled: !!address && !!unitAddress,
      refetchInterval: 15_000,
    },
  });

  const { data: userDonutBalance, refetch: refetchDonutBalance } = useBalance({
    address: address,
    token: CONTRACT_ADDRESSES.donut as Address,
    chainId: base.id,
    query: {
      enabled: !!address,
      refetchInterval: 15_000,
    },
  });

  // Calculate required DONUT based on UNIT input
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
    // DONUT needed = (UNIT amount * DONUT reserve) / UNIT reserve
    // Add 0.5% buffer for slippage
    const exactDonut = (parsedUnitAmount * donutReserve) / unitReserve;
    return (exactDonut * 1005n) / 1000n;
  }, [parsedUnitAmount, unitReserve, donutReserve]);

  // Calculate estimated LP tokens to receive
  const estimatedLpTokens = useMemo(() => {
    if (parsedUnitAmount === 0n || unitReserve === 0n || !lpTotalSupply) return 0n;
    // LP tokens = (UNIT amount / UNIT reserve) * total LP supply
    return (parsedUnitAmount * lpTotalSupply) / unitReserve;
  }, [parsedUnitAmount, unitReserve, lpTotalSupply]);

  // Check if user has sufficient balances
  const hasInsufficientUnitBalance = parsedUnitAmount > 0n && (userUnitBalance?.value ?? 0n) < parsedUnitAmount;
  const hasInsufficientDonutBalance = requiredDonut > 0n && (userDonutBalance?.value ?? 0n) < requiredDonut;

  // Helper to refetch all balances
  const refetchBalances = useCallback(() => {
    refetchUnitBalance();
    refetchDonutBalance();
    refetchAuctions();
  }, [refetchUnitBalance, refetchDonutBalance, refetchAuctions]);

  // Handle LP creation batch transaction completion
  useEffect(() => {
    if (lpBatchState === "success") {
      setLpUnitAmount("");
      setLpSuccess(true);
      // Refetch balances and auction data with delays
      setTimeout(() => refetchBalances(), 1000);
      setTimeout(() => refetchBalances(), 3000);
      setTimeout(() => refetchBalances(), 6000);
      // Show success for 2 seconds, then reset
      setTimeout(() => {
        setLpSuccess(false);
        resetLpBatch();
      }, 2000);
    } else if (lpBatchState === "error") {
      resetLpBatch();
    }
  }, [lpBatchState, refetchBalances, resetLpBatch]);

  const handleCreateLp = useCallback(async () => {
    if (!address || !unitAddress || !lpTokenAddress || parsedUnitAmount === 0n || requiredDonut === 0n) {
      return;
    }

    // Connect wallet if not connected
    if (!isConnected) {
      try {
        await connect();
        return;
      } catch {
        return;
      }
    }

    const deadline = BigInt(Math.floor(Date.now() / 1000) + AUCTION_DEADLINE_BUFFER_SECONDS);

    // Calculate min amounts with 1% slippage tolerance
    const minUnitAmount = (parsedUnitAmount * 99n) / 100n;
    const minDonutAmount = (requiredDonut * 99n) / 100n;

    // Build batched calls: approve UNIT + approve DONUT + addLiquidity
    const approveUnitCall = encodeApproveCall(
      unitAddress,
      CONTRACT_ADDRESSES.uniV2Router as Address,
      parsedUnitAmount
    );

    const approveDonutCall = encodeApproveCall(
      CONTRACT_ADDRESSES.donut as Address,
      CONTRACT_ADDRESSES.uniV2Router as Address,
      requiredDonut
    );

    const addLiquidityCall = encodeContractCall(
      CONTRACT_ADDRESSES.uniV2Router as Address,
      UNIV2_ROUTER_ABI,
      "addLiquidity",
      [
        unitAddress, // tokenA (UNIT)
        CONTRACT_ADDRESSES.donut, // tokenB (DONUT)
        parsedUnitAmount, // amountADesired
        requiredDonut, // amountBDesired
        minUnitAmount, // amountAMin
        minDonutAmount, // amountBMin
        address, // to (LP tokens go to user)
        deadline, // deadline
      ]
    );

    try {
      await executeLpBatch([approveUnitCall, approveDonutCall, addLiquidityCall]);
    } catch (error) {
      console.error("LP creation failed:", error);
      resetLpBatch();
    }
  }, [
    address,
    isConnected,
    connect,
    unitAddress,
    lpTokenAddress,
    parsedUnitAmount,
    requiredDonut,
    executeLpBatch,
    resetLpBatch,
  ]);

  const isCreatingLp = lpBatchState === "pending" || lpBatchState === "confirming";

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold tracking-wide">AUCTIONS</h1>
          <button
            onClick={() => setMode(mode === "buy" ? "get" : "buy")}
            className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 transition-colors text-black text-xs font-semibold"
          >
            {mode === "buy" ? "GET" : "BUY"}
          </button>
        </div>

        {/* Auction Cards List */}
        <div className="flex-1 overflow-y-auto scrollbar-hide px-0.5 pt-0.5">
          {isLoading ? null : sortedAuctions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
              <Flame className="h-12 w-12 mb-2 opacity-50" />
              <p className="text-lg font-semibold">No auctions available</p>
              <p className="text-sm mt-1">Check back later for opportunities</p>
            </div>
          ) : (
            sortedAuctions.map((auction) => (
              <AuctionCard
                key={auction.rigAddress}
                auction={auction}
                ethUsdPrice={ethUsdPrice}
                donutUsdPrice={donutUsdPrice}
                isSelected={selectedAuctionAddress === auction.rigAddress}
                onClick={() => setSelectedAuctionAddress(auction.rigAddress)}
              />
            ))
          )}
          {/* Spacer for bottom bar */}
          <div className="h-56" />
        </div>

        {/* Fixed Bottom Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-black">
          <div className="max-w-[520px] mx-auto px-2 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+72px)]">
            {mode === "buy" ? (
              /* Buy Mode - Auction interface */
              selectedAuction ? (
                <>
                  {/* PnL Indicator */}
                  <div
                    className={cn(
                      "rounded-lg px-3 py-2 mb-3 text-center",
                      selectedProfitLoss > 0.01
                        ? "bg-green-500/20 border border-green-500/50"
                        : selectedProfitLoss >= -0.01
                          ? "bg-yellow-500/20 border border-yellow-500/50"
                          : "bg-red-500/20 border border-red-500/50"
                    )}
                  >
                    {selectedProfitLoss > 0.01 ? (
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-green-400 font-semibold">GOOD DEAL</span>
                        <span className="text-green-300 text-sm">
                          +${selectedProfitLoss.toFixed(2)} profit
                        </span>
                      </div>
                    ) : selectedProfitLoss >= -0.01 ? (
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-yellow-400 font-semibold">BREAK EVEN</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-red-400 font-semibold">WARNING</span>
                        <span className="text-red-300 text-sm">
                          -${Math.abs(selectedProfitLoss).toFixed(2)} loss
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    {/* Auction Price */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span>Auction price</span>
                        <button
                          onClick={() => setMode("get")}
                          className="text-purple-500 hover:text-purple-400"
                        >
                          Get LP
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <LpPairIcon rigUri={selectedRigUri} tokenSymbol={selectedTokenSymbol} />
                        <span className="text-lg font-semibold text-white">
                          {formatEth(selectedAuction.auctionState.price, 4)}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-600">
                        ~${selectedLpPriceUsd.toFixed(2)}
                      </div>
                    </div>

                    {/* Balance and Button */}
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1 text-[10px] text-zinc-500 mb-1">
                        <span>Balance:</span>
                        <LpPairIcon rigUri={selectedRigUri} tokenSymbol={selectedTokenSymbol} size="sm" />
                        <span className="text-white font-medium">
                          {formatEth(selectedAuction.auctionState.paymentTokenBalance, 4)}
                        </span>
                      </div>
                      <Button
                        className="w-[calc(50vw-16px)] max-w-[244px] py-2.5 text-sm font-semibold rounded-lg bg-purple-500 hover:bg-purple-600 text-black"
                        onClick={() => selectedAuction && handleBuy(selectedAuction)}
                        disabled={isBuying || hasInsufficientBalance}
                      >
                        {isBuying ? (
                          <>
                            {batchState === "confirming" ? "CONFIRMING" : "BUYING"}
                            <AnimatedDots />
                          </>
                        ) : (
                          "BUY"
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              ) : null
            ) : (
              /* Get Mode - LP Maker interface */
              <div className="space-y-3">
                {selectedAuction ? (
                  <>
                    {/* UNIT Input */}
                    <div className="bg-zinc-900 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wider">You provide</div>
                        <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                          <span>Balance:</span>
                          <span className={cn(
                            "font-medium",
                            hasInsufficientUnitBalance ? "text-red-400" : "text-white"
                          )}>
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
                        <div className="flex items-center gap-2 px-2 py-1 bg-zinc-800 rounded-lg">
                          <LpPairIcon rigUri={selectedRigUri} tokenSymbol={selectedTokenSymbol} size="sm" />
                          <span className="text-sm font-medium text-white">{selectedTokenSymbol}</span>
                        </div>
                      </div>
                    </div>

                    {/* DONUT Required */}
                    <div className="bg-zinc-900 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Required DONUT</div>
                        <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                          <span>Balance:</span>
                          <span className={cn(
                            "font-medium",
                            hasInsufficientDonutBalance ? "text-red-400" : "text-white"
                          )}>
                            {formatEth(userDonutBalance?.value ?? 0n, 2)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="flex-1 text-xl font-bold text-white">
                          {requiredDonut > 0n ? formatEth(requiredDonut, 2) : "0.0"}
                        </span>
                        <div className="flex items-center gap-2 px-2 py-1 bg-zinc-800 rounded-lg">
                          <div className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-black" />
                          </div>
                          <span className="text-sm font-medium text-white">DONUT</span>
                        </div>
                      </div>
                    </div>

                    {/* Estimated LP Output */}
                    <div className="flex items-center justify-between px-2 text-xs text-zinc-500">
                      <span>You receive ~</span>
                      <div className="flex items-center gap-1">
                        <LpPairIcon rigUri={selectedRigUri} tokenSymbol={selectedTokenSymbol} size="sm" />
                        <span className="text-white font-medium">{formatEth(estimatedLpTokens, 4)}</span>
                        <span>LP tokens</span>
                      </div>
                    </div>

                    {/* Create LP Button */}
                    <Button
                      className={cn(
                        "w-full py-3 text-sm font-semibold rounded-lg text-black disabled:bg-purple-500/50 disabled:cursor-not-allowed",
                        lpSuccess
                          ? "bg-green-500 hover:bg-green-500"
                          : "bg-purple-500 hover:bg-purple-600"
                      )}
                      onClick={handleCreateLp}
                      disabled={
                        isCreatingLp ||
                        lpSuccess ||
                        parsedUnitAmount === 0n ||
                        hasInsufficientUnitBalance ||
                        hasInsufficientDonutBalance
                      }
                    >
                      {lpSuccess ? (
                        "✓ SUCCESS"
                      ) : isCreatingLp ? (
                        <>
                          {lpBatchState === "confirming" ? "CONFIRMING" : "CREATING"}
                          <AnimatedDots />
                        </>
                      ) : hasInsufficientUnitBalance ? (
                        `INSUFFICIENT ${selectedTokenSymbol}`
                      ) : hasInsufficientDonutBalance ? (
                        "INSUFFICIENT DONUT"
                      ) : (
                        "CREATE LP"
                      )}
                    </Button>
                  </>
                ) : (
                  <div className="text-center text-sm text-zinc-500 py-8">
                    Select an auction above to create LP tokens
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}
