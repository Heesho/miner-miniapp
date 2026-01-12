"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Search, Rocket, Gavel, Info, User } from "lucide-react";

export function NavBar() {
  const pathname = usePathname();

  // Check if we're on a rig detail page
  const isRigPage = pathname.startsWith("/rig/");

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-black"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        paddingTop: "12px",
      }}
    >
      <div className="flex justify-around items-center max-w-[520px] mx-auto px-4">
        {/* Explore */}
        <Link
          href="/explore"
          className={cn(
            "flex items-center justify-center p-2.5 transition-colors rounded-full",
            pathname === "/explore" || isRigPage
              ? "text-purple-500"
              : "text-gray-500 hover:text-gray-300"
          )}
        >
          <Search className="w-5 h-5" />
        </Link>

        {/* Auctions */}
        <Link
          href="/auctions"
          className={cn(
            "flex items-center justify-center p-2.5 transition-colors rounded-full",
            pathname === "/auctions"
              ? "text-purple-500"
              : "text-gray-500 hover:text-gray-300"
          )}
        >
          <Gavel className="w-5 h-5" />
        </Link>

        {/* Launch (center) */}
        <Link
          href="/launch"
          className={cn(
            "flex items-center justify-center p-3 transition-colors rounded-full bg-purple-500/20",
            pathname === "/launch"
              ? "text-purple-500"
              : "text-gray-500 hover:text-gray-300"
          )}
        >
          <Rocket className="w-6 h-6" />
        </Link>

        {/* Info */}
        <Link
          href="/info"
          className={cn(
            "flex items-center justify-center p-2.5 transition-colors rounded-full",
            pathname === "/info"
              ? "text-purple-500"
              : "text-gray-500 hover:text-gray-300"
          )}
        >
          <Info className="w-5 h-5" />
        </Link>

        {/* Profile */}
        <Link
          href="/profile"
          className={cn(
            "flex items-center justify-center p-2.5 transition-colors rounded-full",
            pathname === "/profile"
              ? "text-purple-500"
              : "text-gray-500 hover:text-gray-300"
          )}
        >
          <User className="w-5 h-5" />
        </Link>
      </div>
    </nav>
  );
}
