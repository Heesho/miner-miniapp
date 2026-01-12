"use client";

import { ExternalLink } from "lucide-react";
import { rigConfig } from "@/config/rig.config";
import { NavBar } from "@/components/nav-bar";
import { useRigInfo, useRigState } from "@/hooks/useRigState";
import { useTokenMetadata } from "@/hooks/useMetadata";

const RIG_ADDRESS = rigConfig.rigAddress;

export default function InfoPage() {
  const { rigInfo } = useRigInfo(RIG_ADDRESS);
  const { rigState } = useRigState(RIG_ADDRESS, undefined);
  const { logoUrl: tokenLogoUrl } = useTokenMetadata(rigState?.rigUri);

  const tokenSymbol = rigInfo?.tokenSymbol ?? "TOKEN";
  const tokenName = rigInfo?.tokenName ?? rigConfig.branding.appName;
  const { sections, links } = rigConfig.projectInfo;

  // Build links array from config
  const linkItems = [
    links.website && { label: "Website", url: links.website },
    links.twitter && { label: "Twitter", url: `https://x.com/${links.twitter}` },
    links.telegram && { label: "Telegram", url: `https://t.me/${links.telegram}` },
    links.discord && { label: "Discord", url: links.discord.startsWith("http") ? links.discord : `https://discord.gg/${links.discord}` },
    links.github && { label: "GitHub", url: links.github },
  ].filter((link): link is { label: string; url: string } => Boolean(link && link.url));

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
        <div className="flex items-center gap-3 mb-4">
          {tokenLogoUrl ? (
            <img src={tokenLogoUrl} alt={tokenSymbol} className="w-10 h-10 rounded-xl" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-purple-500 flex items-center justify-center text-black font-bold">
              {tokenSymbol.slice(0, 2)}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold">{tokenName}</h1>
            <p className="text-sm text-zinc-500">{rigConfig.branding.tagline}</p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide space-y-6">
          {/* Dynamic Sections from Config */}
          {sections.map((section, index) => (
            <section key={index}>
              <h2 className="text-lg font-bold text-purple-500 mb-2">
                {section.title}
              </h2>
              {section.content && (
                <p className="text-sm text-zinc-300 mb-2">
                  {section.content}
                </p>
              )}
              {section.bullets && section.bullets.length > 0 && (
                <ul className="space-y-1 text-sm text-zinc-300 list-disc list-inside">
                  {section.bullets.map((bullet, bulletIndex) => (
                    <li key={bulletIndex}>{bullet}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {/* Links Section */}
          {linkItems.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-purple-500 mb-3">Links</h2>
              <div className="flex flex-wrap gap-2">
                {linkItems.map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 transition-colors text-sm"
                  >
                    <span>{link.label}</span>
                    <ExternalLink className="w-3 h-3 text-zinc-500" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Mining Info - Always show this */}
          <section>
            <h2 className="text-lg font-bold text-purple-500 mb-2">
              How Mining Works
            </h2>
            <p className="text-sm text-zinc-300 mb-2">
              Mine ${tokenSymbol} by paying ETH. The mining system works like a Dutch auction:
            </p>
            <ul className="space-y-1 text-sm text-zinc-300 list-disc list-inside">
              <li>Only one active miner at a time</li>
              <li>Pay ETH to become the miner and start earning tokens</li>
              <li>Price doubles after each purchase, then decays over time</li>
              <li>When someone takes over, you get 80% of what they paid</li>
            </ul>
          </section>

          {/* Spacer */}
          <div className="h-4" />
        </div>
      </div>
      <NavBar />
    </main>
  );
}
