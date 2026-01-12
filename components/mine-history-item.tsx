"use client";

import { memo } from "react";
import { formatEther } from "viem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useProfile } from "@/hooks/useBatchProfiles";
import { viewProfile } from "@/hooks/useFarcaster";

type MineHistoryItemProps = {
  mine: {
    id: string;
    miner: string;
    uri: string;
    price: bigint;
    spent: bigint;
    timestamp: number;
  };
  timeAgo: (ts: number) => string;
};

/**
 * Memoized mine history item with cached profile lookup
 */
export const MineHistoryItem = memo(function MineHistoryItem({
  mine,
  timeAgo,
}: MineHistoryItemProps) {
  // Use cached profile lookup
  const { displayName, avatarUrl, fid } = useProfile(mine.miner);

  const handleProfileClick = () => {
    if (fid) viewProfile(fid);
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/50">
      <button
        onClick={handleProfileClick}
        disabled={!fid}
        className={fid ? "cursor-pointer" : "cursor-default"}
      >
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={avatarUrl} alt={displayName} />
          <AvatarFallback className="bg-zinc-800 text-white text-xs">
            {mine.miner.slice(2, 4).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </button>
      <div className="flex-1 min-w-0">
        <button
          onClick={handleProfileClick}
          disabled={!fid}
          className={`text-xs text-zinc-400 ${fid ? "hover:text-purple-400 cursor-pointer" : "cursor-default"}`}
        >
          {displayName}
        </button>
        {mine.uri && (
          <div className="text-sm text-white mt-0.5 break-words">{mine.uri}</div>
        )}
      </div>
      <div className="text-xs flex-shrink-0 text-right">
        <div className="text-white">
          Ξ{Number(formatEther(mine.spent)).toFixed(4)}
        </div>
        <div className="text-zinc-500">{timeAgo(mine.timestamp)}</div>
      </div>
    </div>
  );
});
