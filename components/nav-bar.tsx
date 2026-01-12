"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Pickaxe, ArrowLeftRight, Gavel, Info } from "lucide-react";

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-black"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        paddingTop: "12px",
      }}
    >
      <div className="flex justify-around items-center max-w-[520px] mx-auto px-4">
        {/* Mine */}
        <Link
          href="/mine"
          className={cn(
            "flex flex-col items-center justify-center p-2 transition-colors rounded-lg",
            pathname === "/mine" || pathname === "/"
              ? "text-purple-500"
              : "text-gray-500 hover:text-gray-300"
          )}
        >
          <Pickaxe className="w-5 h-5" />
          <span className="text-[10px] mt-1">Mine</span>
        </Link>

        {/* Swap */}
        <Link
          href="/swap"
          className={cn(
            "flex flex-col items-center justify-center p-2 transition-colors rounded-lg",
            pathname === "/swap"
              ? "text-purple-500"
              : "text-gray-500 hover:text-gray-300"
          )}
        >
          <ArrowLeftRight className="w-5 h-5" />
          <span className="text-[10px] mt-1">Swap</span>
        </Link>

        {/* Auction */}
        <Link
          href="/auction"
          className={cn(
            "flex flex-col items-center justify-center p-2 transition-colors rounded-lg",
            pathname === "/auction"
              ? "text-purple-500"
              : "text-gray-500 hover:text-gray-300"
          )}
        >
          <Gavel className="w-5 h-5" />
          <span className="text-[10px] mt-1">Auction</span>
        </Link>

        {/* Info */}
        <Link
          href="/info"
          className={cn(
            "flex flex-col items-center justify-center p-2 transition-colors rounded-lg",
            pathname === "/info"
              ? "text-purple-500"
              : "text-gray-500 hover:text-gray-300"
          )}
        >
          <Info className="w-5 h-5" />
          <span className="text-[10px] mt-1">Info</span>
        </Link>
      </div>
    </nav>
  );
}
