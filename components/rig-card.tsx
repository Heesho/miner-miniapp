"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import type { RigListItem } from "@/hooks/useAllRigs";
import { cn } from "@/lib/utils";
import { ipfsToHttp } from "@/lib/constants";

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

type RigCardProps = {
  rig: RigListItem;
  donutUsdPrice?: number;
  isTopBump?: boolean;
  isNewBump?: boolean;
};

const formatUsd = (value: number) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
};

export function RigCard({ rig, donutUsdPrice = 0.01, isTopBump = false, isNewBump = false }: RigCardProps) {
  // Calculate market cap: totalMinted * unitPrice (in DONUT) * donutUsdPrice
  const marketCapUsd = rig.unitPrice > 0n
    ? Number(formatEther(rig.totalMinted)) * Number(formatEther(rig.unitPrice)) * donutUsdPrice
    : 0;
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Fetch metadata to get image URL
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
      .catch(() => {
        // Silently fail - will show fallback
      });
  }, [rig.rigUri]);

  return (
    <Link href={`/rig/${rig.address}`} className="block mb-1.5">
      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer",
          isNewBump && "animate-bump-enter",
          isTopBump && !isNewBump && "animate-bump-glow"
        )}
      >
        {/* Token Logo */}
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

        {/* Token Name & Symbol */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white truncate">
            {rig.tokenName}
          </div>
          <div className="text-sm text-gray-500">
            {rig.tokenSymbol}
          </div>
        </div>

        {/* Price & Market Cap */}
        <div className="flex-shrink-0 text-right">
          <div className="text-sm font-semibold text-purple-500">
            Ξ{formatEth(rig.price, 5)}
          </div>
          <div className="text-xs text-gray-500">
            {formatUsd(marketCapUsd)} mcap
          </div>
        </div>
      </div>
    </Link>
  );
}

