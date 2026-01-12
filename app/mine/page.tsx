"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Copy, Check, Share2, ArrowLeftRight } from "lucide-react";
import {
  useBalance,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatEther, formatUnits, type Address, zeroAddress } from "viem";

import { rigConfig } from "@/config/rig.config";
import { NavBar } from "@/components/nav-bar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TokenStats } from "@/components/token-stats";
import { useRigState, useRigInfo } from "@/hooks/useRigState";
import { useDexScreener } from "@/hooks/useDexScreener";
import { useFarcaster, shareMiningAchievement, viewProfile } from "@/hooks/useFarcaster";
import { usePrices } from "@/hooks/usePrices";
import { useTokenMetadata } from "@/hooks/useMetadata";
import { useProfile } from "@/hooks/useBatchProfiles";
import { CONTRACT_ADDRESSES, MULTICALL_ABI, ERC20_ABI } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import {
  DEFAULT_CHAIN_ID,
  DEADLINE_BUFFER_SECONDS,
  TOKEN_DECIMALS,
} from "@/lib/constants";

// Get the rig address from config
const RIG_ADDRESS = rigConfig.rigAddress;

const formatUsd = (value: number, compact = false) => {
  if (compact) {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
  }
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function LoadingDots() {
  return (
    <span className="inline-flex">
      <span className="animate-bounce-dot-1">.</span>
      <span className="animate-bounce-dot-2">.</span>
      <span className="animate-bounce-dot-3">.</span>
    </span>
  );
}

export default function MinePage() {
  const [customMessage, setCustomMessage] = useState("");
  const [mineResult, setMineResult] = useState<"success" | "failure" | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const { ethUsdPrice, donutUsdPrice } = usePrices();
  const mineResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Farcaster context and wallet connection
  const { address, isConnected, connect, user: farcasterUser } = useFarcaster();

  // Rig data - use configured rig address
  const { rigState, refetch: refetchRigState } = useRigState(RIG_ADDRESS, address);
  const { rigInfo } = useRigInfo(RIG_ADDRESS);

  // DexScreener data for token price/market stats
  const { pairData, lpAddress } = useDexScreener(RIG_ADDRESS, rigInfo?.unitAddress);

  // Use cached metadata hook
  const { metadata: tokenMetadata, logoUrl: tokenLogoUrl } = useTokenMetadata(rigState?.rigUri);

  // Token total supply
  const { data: totalSupplyRaw } = useReadContract({
    address: rigInfo?.unitAddress,
    abi: ERC20_ABI,
    functionName: "totalSupply",
    chainId: DEFAULT_CHAIN_ID,
    query: {
      enabled: !!rigInfo?.unitAddress,
    },
  });

  // Transaction handling (mining)
  const { data: txHash, writeContract, isPending: isWriting, reset: resetWrite } = useWriteContract();
  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash, chainId: DEFAULT_CHAIN_ID });

  // ETH balance
  const { data: ethBalanceData } = useBalance({
    address,
    chainId: DEFAULT_CHAIN_ID,
  });

  // Result handling
  const resetMineResult = useCallback(() => {
    if (mineResultTimeoutRef.current) {
      clearTimeout(mineResultTimeoutRef.current);
      mineResultTimeoutRef.current = null;
    }
    setMineResult(null);
  }, []);

  const showMineResult = useCallback((result: "success" | "failure") => {
    if (mineResultTimeoutRef.current) clearTimeout(mineResultTimeoutRef.current);
    setMineResult(result);
    mineResultTimeoutRef.current = setTimeout(() => {
      setMineResult(null);
      mineResultTimeoutRef.current = null;
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (mineResultTimeoutRef.current) clearTimeout(mineResultTimeoutRef.current);
    };
  }, []);

  // Handle receipt
  useEffect(() => {
    if (!receipt) return;
    if (receipt.status === "success" || receipt.status === "reverted") {
      showMineResult(receipt.status === "success" ? "success" : "failure");
      refetchRigState();
      if (receipt.status === "success") setCustomMessage("");
      const resetTimer = setTimeout(() => resetWrite(), 500);
      return () => clearTimeout(resetTimer);
    }
  }, [receipt, refetchRigState, resetWrite, showMineResult]);

  // Interpolated mining values
  const [interpolatedGlazed, setInterpolatedGlazed] = useState<bigint | null>(null);
  const [glazeElapsedSeconds, setGlazeElapsedSeconds] = useState<number>(0);

  useEffect(() => {
    if (!rigState) {
      setInterpolatedGlazed(null);
      return;
    }
    setInterpolatedGlazed(rigState.glazed);
    const interval = setInterval(() => {
      if (rigState.nextUps > 0n) {
        setInterpolatedGlazed((prev) => (prev ? prev + rigState.nextUps : rigState.glazed));
      }
    }, 1_000);
    return () => clearInterval(interval);
  }, [rigState]);

  useEffect(() => {
    if (!rigState) {
      setGlazeElapsedSeconds(0);
      return;
    }
    const startTimeSeconds = Number(rigState.epochStartTime);
    const initialElapsed = Math.floor(Date.now() / 1000) - startTimeSeconds;
    setGlazeElapsedSeconds(initialElapsed);
    const interval = setInterval(() => {
      setGlazeElapsedSeconds(Math.floor(Date.now() / 1000) - startTimeSeconds);
    }, 1_000);
    return () => clearInterval(interval);
  }, [rigState]);

  // Mine handler
  const handleMine = useCallback(async () => {
    if (!rigState) return;
    resetMineResult();
    try {
      let targetAddress = address;
      if (!targetAddress) {
        targetAddress = await connect();
      }
      if (!targetAddress) throw new Error("Unable to determine wallet address.");

      const price = rigState.price;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS);
      const maxPrice = price === 0n ? 0n : (price * 105n) / 100n;
      const messageToSend = customMessage.trim() || tokenMetadata?.defaultMessage || "gm";

      await writeContract({
        account: targetAddress as Address,
        address: CONTRACT_ADDRESSES.multicall as Address,
        abi: MULTICALL_ABI,
        functionName: "mine",
        args: [RIG_ADDRESS, rigState.epochId, deadline, maxPrice, messageToSend],
        value: price,
        chainId: DEFAULT_CHAIN_ID,
      });
    } catch (error) {
      console.error("Failed to mine:", error);
      showMineResult("failure");
      resetWrite();
    }
  }, [address, connect, customMessage, rigState, resetMineResult, resetWrite, showMineResult, writeContract, tokenMetadata]);

  // Share mining achievement handler
  const handleShareMine = useCallback(async () => {
    if (!rigInfo) return;

    const rigUrl = `${window.location.origin}/mine`;
    const currentGlazed = interpolatedGlazed ?? rigState?.glazed ?? 0n;
    const minedAmount = currentGlazed > 0n
      ? Number(formatUnits(currentGlazed, TOKEN_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 0 })
      : rigState?.nextUps
        ? Number(formatUnits(rigState.nextUps * 60n, TOKEN_DECIMALS)).toFixed(0)
        : "some";

    await shareMiningAchievement({
      tokenSymbol: rigInfo.tokenSymbol || "TOKEN",
      tokenName: rigInfo.tokenName || "this token",
      amountMined: minedAmount,
      rigUrl,
      message: customMessage && customMessage !== "gm" ? customMessage : undefined,
    });
  }, [rigInfo, rigState?.glazed, rigState?.nextUps, interpolatedGlazed, customMessage]);

  const handleCopyAddress = useCallback(async (addr: string) => {
    try {
      await navigator.clipboard.writeText(addr);
      setCopiedAddress(addr);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, []);

  // Calculated values
  const buttonLabel = useMemo(() => {
    if (!rigState) return "LOADING...";
    if (mineResult === "success") return "MINED!";
    if (mineResult === "failure") return "FAILED";
    if (isWriting || isConfirming) return <>MINING<LoadingDots /></>;
    return "MINE";
  }, [mineResult, isConfirming, isWriting, rigState]);

  const isMineDisabled = !rigState || isWriting || isConfirming || mineResult !== null;
  const tokenSymbol = rigInfo?.tokenSymbol ?? "TOKEN";
  const tokenName = rigInfo?.tokenName ?? "Loading...";

  // Token price calculations
  const unitPrice = rigState?.unitPrice ?? 0n;
  const glazedAmount = interpolatedGlazed ?? rigState?.glazed ?? 0n;
  const glazedUsd = unitPrice > 0n
    ? Number(formatUnits(glazedAmount, TOKEN_DECIMALS)) * Number(formatEther(unitPrice)) * donutUsdPrice
    : 0;
  const rateUsd = unitPrice > 0n
    ? Number(formatUnits(rigState?.nextUps ?? 0n, TOKEN_DECIMALS)) * Number(formatEther(unitPrice)) * donutUsdPrice
    : 0;
  const priceUsd = rigState ? Number(formatEther(rigState.price)) * ethUsdPrice : 0;
  const priceEth = rigState ? Number(formatEther(rigState.price)) : 0;
  const tokenPriceUsd = unitPrice > 0n ? Number(formatEther(unitPrice)) * donutUsdPrice : 0;

  // Token stats
  const totalSupply = totalSupplyRaw ? Number(formatUnits(totalSupplyRaw as bigint, TOKEN_DECIMALS)) : 0;
  const dexPriceUsd = pairData?.priceUsd ? parseFloat(pairData.priceUsd) : null;
  const displayPriceUsd = dexPriceUsd ?? tokenPriceUsd;
  const marketCap = pairData?.marketCap ?? (totalSupply * displayPriceUsd);
  const liquidity = pairData?.liquidity?.usd ?? 0;
  const volume24h = pairData?.volume?.h24 ?? 0;

  // User balances
  const unitBalance = rigState?.unitBalance ? Number(formatUnits(rigState.unitBalance, TOKEN_DECIMALS)) : 0;
  const unitBalanceUsd = unitPrice > 0n ? unitBalance * Number(formatEther(unitPrice)) * donutUsdPrice : 0;
  const ethBalance = rigState?.ethBalance ? Number(formatEther(rigState.ethBalance)) : 0;

  // Miner info
  const minerAddress = rigState?.miner ?? zeroAddress;
  const hasMiner = minerAddress !== zeroAddress;
  const isCurrentUserMiner = address && minerAddress.toLowerCase() === address.toLowerCase();

  const {
    displayName: minerDisplayName,
    avatarUrl: minerAvatarUrl,
    fid: minerFid,
  } = useProfile(hasMiner ? minerAddress : undefined);

  const launcherAddress = rigInfo?.launcher ?? zeroAddress;
  const hasLauncher = launcherAddress !== zeroAddress;
  const {
    displayName: launcherDisplayName,
    avatarUrl: launcherAvatarUrl,
    fid: launcherFid,
  } = useProfile(hasLauncher ? launcherAddress : undefined);

  const formatTime = (seconds: number): string => {
    if (seconds < 0) return "0s";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

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
        {/* Fixed Header */}
        <div className="px-2 pb-2">
          <div className="relative flex items-center justify-between">
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
            {/* Trade Button */}
            <Link
              href="/swap"
              className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 transition-colors text-black text-xs font-semibold flex items-center gap-1"
            >
              <ArrowLeftRight className="w-3 h-3" />
              Trade
            </Link>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {/* Miner Section */}
          {hasMiner && (
            <div className="px-2 mt-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold">Current Miner</h2>
                <div className="flex items-center gap-2">
                  {isCurrentUserMiner && (
                    <button
                      onClick={handleShareMine}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 transition-colors text-xs text-purple-400"
                      title="Cast to Farcaster"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      Cast
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      const rigUrl = `${window.location.origin}/mine`;
                      try {
                        await navigator.clipboard.writeText(rigUrl);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      } catch {
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      }
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-xs text-zinc-400"
                    title="Copy link"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedLink ? "Copied" : "Share"}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => minerFid && viewProfile(minerFid)}
                  disabled={!minerFid}
                  className={minerFid ? "cursor-pointer" : "cursor-default"}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={minerAvatarUrl} alt={minerDisplayName} />
                    <AvatarFallback className="bg-zinc-800 text-white text-xs">
                      {minerAddress.slice(-2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </button>
                <button
                  onClick={() => minerFid && viewProfile(minerFid)}
                  disabled={!minerFid}
                  className={`flex-1 text-left ${minerFid ? "cursor-pointer" : "cursor-default"}`}
                >
                  <div className={`text-sm font-semibold text-white ${minerFid ? "hover:text-purple-400" : ""}`}>
                    {minerDisplayName}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {minerAddress.slice(0, 6)}...{minerAddress.slice(-4)}
                  </div>
                </button>
                <div className="text-right">
                  <div className="text-xs text-zinc-500">{formatTime(glazeElapsedSeconds)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                <div>
                  <div className="text-xs text-zinc-500">Mine rate</div>
                  <div className="text-sm font-semibold">
                    {Number(formatUnits(rigState?.nextUps ?? 0n, TOKEN_DECIMALS)).toFixed(2)}/s
                  </div>
                  <div className="text-[10px] text-zinc-600">${rateUsd.toFixed(4)}/s</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Mined</div>
                  <div className="flex items-center gap-1 text-sm font-semibold">
                    <span>+</span>
                    {tokenLogoUrl ? (
                      <img src={tokenLogoUrl} alt={tokenSymbol} className="w-4 h-4 rounded-full" />
                    ) : (
                      <span className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center text-[8px] text-black font-bold">
                        {tokenSymbol.slice(0, 2)}
                      </span>
                    )}
                    <span>{Number(formatUnits(glazedAmount, TOKEN_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="text-[10px] text-zinc-600">{formatUsd(glazedUsd)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Your Position */}
          <div className="px-2 mt-6">
            <h2 className="text-base font-bold mb-3">Your position</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              <div>
                <div className="text-xs text-zinc-500">Balance</div>
                <div className="flex items-center gap-1 text-sm font-semibold">
                  {tokenLogoUrl ? (
                    <img src={tokenLogoUrl} alt={tokenSymbol} className="w-4 h-4 rounded-full" />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center text-[8px] text-black font-bold">
                      {tokenSymbol.slice(0, 2)}
                    </span>
                  )}
                  <span>{unitBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="text-[10px] text-zinc-600">{formatUsd(unitBalanceUsd)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">ETH Balance</div>
                <div className="text-sm font-semibold">Ξ{ethBalance.toFixed(4)}</div>
                <div className="text-[10px] text-zinc-600">{formatUsd(ethBalance * ethUsdPrice)}</div>
              </div>
            </div>
          </div>

          {/* About */}
          <div className="px-2 mt-6">
            <h2 className="text-base font-bold mb-3">About</h2>
            {hasLauncher && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm text-zinc-500">Deployed by</span>
                <button
                  onClick={() => launcherFid && viewProfile(launcherFid)}
                  disabled={!launcherFid}
                  className={`flex items-center gap-2 ${launcherFid ? "cursor-pointer" : "cursor-default"}`}
                >
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={launcherAvatarUrl} alt={launcherDisplayName} />
                    <AvatarFallback className="bg-zinc-800 text-white text-[8px]">
                      {launcherAddress.slice(2, 4).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className={`text-sm font-medium text-white ${launcherFid ? "hover:text-purple-400" : ""}`}>
                    {launcherDisplayName}
                  </span>
                </button>
              </div>
            )}
            <p className="text-sm text-zinc-400 mb-3">
              {tokenMetadata?.description || `${tokenName} is a mineable token on the Miner Launchpad.`}
            </p>

            {/* Links */}
            <div className="flex flex-wrap gap-2">
              {tokenMetadata?.links?.map((link, index) => {
                const url = link.startsWith("http") ? link : `https://${link}`;
                let label = "Link";
                try {
                  const hostname = new URL(url).hostname.replace("www.", "");
                  if (hostname.includes("twitter") || hostname.includes("x.com")) label = "Twitter";
                  else if (hostname.includes("telegram") || hostname.includes("t.me")) label = "Telegram";
                  else if (hostname.includes("discord")) label = "Discord";
                  else if (hostname.includes("github")) label = "GitHub";
                  else label = hostname.split(".")[0].charAt(0).toUpperCase() + hostname.split(".")[0].slice(1);
                } catch {
                  label = "Link";
                }
                return (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  >
                    {label}
                  </a>
                );
              })}
              {rigInfo?.unitAddress && (
                <button
                  onClick={() => handleCopyAddress(rigInfo.unitAddress)}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  <span>{tokenSymbol}</span>
                  {copiedAddress === rigInfo.unitAddress ? (
                    <Check className="w-3 h-3 text-purple-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              )}
              {lpAddress && (
                <button
                  onClick={() => handleCopyAddress(lpAddress)}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  <span>LP</span>
                  {copiedAddress === lpAddress ? (
                    <Check className="w-3 h-3 text-purple-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <TokenStats
            marketCap={marketCap}
            totalSupply={totalSupply}
            liquidity={liquidity}
            volume24h={volume24h}
          />

          {/* Spacer for bottom bar */}
          <div className="h-32" />
        </div>

        {/* Bottom Action Bar - Mining */}
        <div className="fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-sm">
          <div className="max-w-[520px] mx-auto px-2 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+72px)]">
            <input
              type="text"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Add a message..."
              maxLength={100}
              className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none disabled:opacity-40 mb-2"
              disabled={isMineDisabled}
            />
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="text-xs text-zinc-500 mb-1">Mine price</div>
                <div className="text-lg font-semibold">Ξ{priceEth.toFixed(6)}</div>
                <div className="text-xs text-zinc-600">{formatUsd(priceUsd)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-zinc-500 mb-1">
                  Balance: Ξ{(ethBalanceData?.value ? Number(formatEther(ethBalanceData.value)) : 0).toFixed(4)}
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={handleMine}
                    disabled={isMineDisabled}
                    className={cn(
                      "w-[calc(50vw-16px)] max-w-[244px] py-2.5 rounded-lg font-semibold transition-all text-sm",
                      mineResult === "failure"
                        ? "bg-zinc-700 text-white"
                        : "bg-purple-500 text-black hover:bg-purple-600 active:scale-[0.98]",
                      isMineDisabled && !mineResult && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    {buttonLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}
