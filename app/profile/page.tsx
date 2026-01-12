"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatEther } from "viem";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { useFarcaster, getUserDisplayName, getUserHandle, initialsFrom } from "@/hooks/useFarcaster";
import { useUserProfile, type UserRigData, type UserLaunchedRig } from "@/hooks/useUserProfile";
import { cn, getDonutPrice } from "@/lib/utils";
import { DEFAULT_DONUT_PRICE_USD, PRICE_REFETCH_INTERVAL_MS, ipfsToHttp } from "@/lib/constants";

type TabOption = "mined" | "launched";

const formatTokenAmount = (value: bigint, maximumFractionDigits = 2) => {
  if (value === 0n) return "0";
  const asNumber = Number(formatEther(value));
  if (!Number.isFinite(asNumber)) {
    return formatEther(value);
  }
  return asNumber.toLocaleString(undefined, {
    maximumFractionDigits,
  });
};

function MinedRigCard({ rig }: { rig: UserRigData }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!rig.rigUri) return;
    const metadataUrl = ipfsToHttp(rig.rigUri);
    if (!metadataUrl) return;

    fetch(metadataUrl)
      .then((res) => res.json())
      .then((metadata) => {
        if (metadata.image) {
          setLogoUrl(ipfsToHttp(metadata.image));
        }
      })
      .catch(() => {});
  }, [rig.rigUri]);

  return (
    <Link href={`/rig/${rig.address}`} className="block mb-1.5">
      <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer">
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center overflow-hidden">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={rig.tokenSymbol}
              className="w-12 h-12 object-cover rounded-xl"
            />
          ) : (
            <span className="text-purple-500 font-bold text-lg">
              {rig.tokenSymbol.slice(0, 2)}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white truncate">
            {rig.tokenName}
          </div>
          <div className="text-sm text-gray-500">
            {rig.tokenSymbol}
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-sm font-semibold text-purple-500">
            {formatTokenAmount(rig.userMined)} mined
          </div>
          <div className="text-xs text-gray-500">
            {formatTokenAmount(rig.userEarned - rig.userSpent, 4)} ETH pnl
          </div>
        </div>
      </div>
    </Link>
  );
}

function LaunchedRigCard({ rig, donutUsdPrice }: { rig: UserLaunchedRig; donutUsdPrice: number }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!rig.rigUri) return;
    const metadataUrl = ipfsToHttp(rig.rigUri);
    if (!metadataUrl) return;

    fetch(metadataUrl)
      .then((res) => res.json())
      .then((metadata) => {
        if (metadata.image) {
          setLogoUrl(ipfsToHttp(metadata.image));
        }
      })
      .catch(() => {});
  }, [rig.rigUri]);

  // Calculate market cap: totalMinted * unitPrice (in DONUT) * donutUsdPrice
  const marketCapUsd = rig.unitPrice > 0n
    ? Number(formatEther(rig.totalMinted)) * Number(formatEther(rig.unitPrice)) * donutUsdPrice
    : 0;

  const formatUsd = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  return (
    <Link href={`/rig/${rig.address}`} className="block mb-1.5">
      <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer">
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center overflow-hidden">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={rig.tokenSymbol}
              className="w-12 h-12 object-cover rounded-xl"
            />
          ) : (
            <span className="text-purple-500 font-bold text-lg">
              {rig.tokenSymbol.slice(0, 2)}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white truncate">
            {rig.tokenName}
          </div>
          <div className="text-sm text-gray-500">
            {rig.tokenSymbol}
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-sm font-semibold text-purple-500">
            {formatUsd(marketCapUsd)} mcap
          </div>
          <div className="text-xs text-gray-500">
            {formatTokenAmount(rig.revenue, 4)} ETH earned
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<TabOption>("mined");
  const [donutUsdPrice, setDonutUsdPrice] = useState<number>(DEFAULT_DONUT_PRICE_USD);

  const { user, address } = useFarcaster();
  const { minedRigs, launchedRigs, isLoading } = useUserProfile(address);

  // Fetch DONUT price
  useEffect(() => {
    const fetchPrice = async () => {
      const price = await getDonutPrice();
      setDonutUsdPrice(price);
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, PRICE_REFETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const userDisplayName = getUserDisplayName(user);
  const userHandle = getUserHandle(user);
  const userAvatarUrl = user?.pfpUrl ?? null;

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
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold tracking-wide">PROFILE</h1>
          </div>

          {/* User Info */}
          {user ? (
            <div className="flex items-center gap-3 mb-4 px-1">
              <Avatar className="h-14 w-14 border-2 border-purple-500">
                <AvatarImage
                  src={userAvatarUrl || undefined}
                  alt={userDisplayName}
                  className="object-cover"
                />
                <AvatarFallback className="bg-zinc-800 text-white text-lg">
                  {initialsFrom(userDisplayName)}
                </AvatarFallback>
              </Avatar>
              <div className="leading-tight text-left">
                <div className="text-lg font-bold">{userDisplayName}</div>
                {userHandle ? (
                  <div className="text-sm text-gray-400">{userHandle}</div>
                ) : null}
                {address && (
                  <div className="text-xs text-gray-600 font-mono">
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center p-6 mb-4 rounded-xl bg-zinc-900">
              <p className="text-gray-500">Connect wallet to view your profile</p>
            </div>
          )}

          {/* Stats/Tabs */}
          {user && (
            <div className="grid grid-cols-2 gap-2 mb-3 px-0.5">
              <button
                onClick={() => setActiveTab("mined")}
                className={cn(
                  "p-3 rounded-xl text-center transition-colors",
                  activeTab === "mined"
                    ? "bg-purple-500/20 ring-2 ring-purple-500"
                    : "bg-zinc-900 hover:bg-zinc-800"
                )}
              >
                <div className="text-2xl font-bold text-purple-500">{minedRigs.length}</div>
                <div className="text-xs text-gray-500">Rigs Mined</div>
              </button>
              <button
                onClick={() => setActiveTab("launched")}
                className={cn(
                  "p-3 rounded-xl text-center transition-colors",
                  activeTab === "launched"
                    ? "bg-purple-500/20 ring-2 ring-purple-500"
                    : "bg-zinc-900 hover:bg-zinc-800"
                )}
              >
                <div className="text-2xl font-bold text-purple-500">{launchedRigs.length}</div>
                <div className="text-xs text-gray-500">Rigs Launched</div>
            </button>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {!user ? null : !address ? (
              <div className="flex flex-col items-center justify-center h-32 text-center text-gray-500">
                <p className="text-lg font-semibold">Wallet not connected</p>
                <p className="text-sm mt-1">Please connect your wallet to see your rigs</p>
              </div>
            ) : isLoading ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                <p className="text-sm">Loading...</p>
              </div>
            ) : activeTab === "mined" ? (
              minedRigs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center text-gray-500">
                  <p className="text-lg font-semibold">No mining activity yet</p>
                  <p className="text-sm mt-1">Start mining on the Explore page!</p>
                </div>
              ) : (
                minedRigs.map((rig) => (
                  <MinedRigCard key={rig.address} rig={rig} />
                ))
              )
            ) : launchedRigs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center text-gray-500">
                <p className="text-lg font-semibold">No rigs launched yet</p>
                <p className="text-sm mt-1">Launch your first rig!</p>
              </div>
            ) : (
              launchedRigs.map((rig) => (
                <LaunchedRigCard key={rig.address} rig={rig} donutUsdPrice={donutUsdPrice} />
              ))
            )}
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}
