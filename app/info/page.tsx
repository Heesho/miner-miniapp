"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { NavBar } from "@/components/nav-bar";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

export default function InfoPage() {
  const readyRef = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    const hydrateContext = async () => {
      try {
        const ctx = (await (sdk as unknown as {
          context: Promise<MiniAppContext> | MiniAppContext;
        }).context) as MiniAppContext;
        if (!cancelled) {
          setContext(ctx);
        }
      } catch {
        if (!cancelled) setContext(null);
      }
    };
    hydrateContext();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        sdk.actions.ready().catch(() => {});
      }
    }, 1200);
    return () => clearTimeout(timeout);
  }, []);

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
          <div className="sticky top-0 z-10 bg-black pb-2">
            <h1 className="text-2xl font-bold tracking-wide">INFO</h1>
          </div>

          <div className="space-y-6 px-2 overflow-y-auto scrollbar-hide flex-1">
            <section>
              <h2 className="text-lg font-bold text-purple-500 mb-2">
                What Is Franchiser?
              </h2>
              <p className="text-sm text-gray-300 mb-2">
                Franchiser is a fair token launch platform where anyone can create their own coin. Every token launched through Franchiser is an extension of $DONUT.
              </p>
              <ul className="space-y-1 text-sm text-gray-300 list-disc list-inside">
                <li>Launch your own token with permanent liquidity</li>
                <li>No rug pulls possible - liquidity is locked forever</li>
                <li>Fair distribution through mining, not bulk buying</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-purple-500 mb-2">
                How Mining Works
              </h2>
              <p className="text-sm text-gray-300 mb-2">
                Think of each token as a mine. Miners compete for control of the mine to earn tokens.
              </p>
              <ul className="space-y-1 text-sm text-gray-300 list-disc list-inside">
                <li>Only one active miner at a time</li>
                <li>Pay ETH to become the miner and start earning tokens</li>
                <li>Price doubles after each purchase, then decays to 0 over time</li>
                <li>Earn tokens for as long as you hold the position</li>
                <li>When someone takes over, you get 80% of what they paid</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-purple-500 mb-2">
                Why It's Fair
              </h2>
              <p className="text-sm text-gray-300 mb-2">
                The Dutch auction system defeats bots and snipers.
              </p>
              <ul className="space-y-1 text-sm text-gray-300 list-disc list-inside">
                <li>Price starts high and drops over time</li>
                <li>Being first means paying the HIGHEST price</li>
                <li>Patience wins, not speed - no advantage to bots</li>
                <li>Tokens are distributed gradually, not grabbed at launch</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-purple-500 mb-2">
                Fee Split
              </h2>
              <p className="text-sm text-gray-300 mb-2">
                When someone mines, their payment is split:
              </p>
              <ul className="space-y-1 text-sm text-gray-300 list-disc list-inside">
                <li>80% → previous miner (reward for holding)</li>
                <li>15% → treasury (customizable by creator)</li>
                <li>4% → franchise creator</li>
                <li>1% → protocol (supports $DONUT ecosystem)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-purple-500 mb-2">
                Franchise Customization
              </h2>
              <p className="text-sm text-gray-300 mb-2">
                Creators have full control over their franchise:
              </p>
              <ul className="space-y-1 text-sm text-gray-300 list-disc list-inside">
                <li>Treasury defaults to buying/burning token-DONUT LP</li>
                <li>Creators can redirect treasury funds however they want</li>
                <li>Custom emission rates and halving schedules</li>
                <li>Adjustable mining epoch duration</li>
                <li>Custom price multipliers and floor prices</li>
                <li>Every parameter is configurable at launch</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-purple-500 mb-2">
                How It Benefits $DONUT
              </h2>
              <p className="text-sm text-gray-300 mb-2">
                Franchiser is a shield for $DONUT. Every coin launched extends the $DONUT ecosystem:
              </p>
              <ul className="space-y-1 text-sm text-gray-300 list-disc list-inside">
                <li>15% treasury fee buys back LP containing $DONUT</li>
                <li>1% protocol fee supports the $DONUT ecosystem</li>
                <li>New miners get exposure to $DONUT through every launch</li>
                <li>More franchises = more demand for $DONUT liquidity</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-purple-500 mb-2">
                Token Emission
              </h2>
              <p className="text-sm text-gray-300 mb-2">
                Like Bitcoin, token production decreases over time:
              </p>
              <ul className="space-y-1 text-sm text-gray-300 list-disc list-inside">
                <li>Starts at a set emission rate per second</li>
                <li>Halves periodically (e.g., every 30 days)</li>
                <li>Continues forever at a minimum tail rate</li>
                <li>Early miners earn the most tokens</li>
              </ul>
            </section>

            <section className="pb-4">
              <h2 className="text-lg font-bold text-purple-500 mb-2">
                Permanent Liquidity
              </h2>
              <p className="text-sm text-gray-300 mb-2">
                When a token launches, the initial liquidity is locked forever:
              </p>
              <ul className="space-y-1 text-sm text-gray-300 list-disc list-inside">
                <li>LP tokens are burned to an unrecoverable address</li>
                <li>Liquidity can NEVER be removed</li>
                <li>Token will always be tradeable</li>
                <li>No rug pulls possible - by design</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}
