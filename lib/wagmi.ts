import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { fallback, http, createStorage, cookieStorage } from "wagmi";
import { base } from "wagmi/chains";
import { createConfig } from "wagmi";

// Backup RPC endpoints for Base mainnet with automatic fallback
// Order: Primary (env) -> Alchemy (env) -> Public RPCs
const BASE_RPC_ENDPOINTS = [
  // Primary RPC from env
  process.env.NEXT_PUBLIC_BASE_RPC_URL,
  // Alchemy backup from env
  process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL,
  // Public backup RPCs
  "https://base.llamarpc.com",
  "https://1rpc.io/base",
  "https://base.drpc.org",
  "https://base-rpc.publicnode.com",
  // Default wagmi transport as last resort
  undefined,
].filter((url): url is string | undefined => url !== null && url !== "");

// Create transport array with retry configuration
const baseTransports = BASE_RPC_ENDPOINTS.map((url) =>
  http(url, {
    // Retry configuration for each transport
    retryCount: 2,
    retryDelay: 1000,
    timeout: 10_000,
  })
);

export const wagmiConfig = createConfig({
  chains: [base],
  ssr: true,
  connectors: [farcasterMiniApp()],
  transports: {
    // Fallback transport: tries each RPC in order until one succeeds
    // rank: true means it will prefer faster RPCs over time
    [base.id]: fallback(baseTransports, { rank: true }),
  },
  storage: createStorage({
    storage: cookieStorage,
  }),
  // Increased polling interval to reduce request frequency
  pollingInterval: 15_000,
});
