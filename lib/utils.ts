import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  PRICE_CACHE_TTL_MS,
  DEFAULT_ETH_PRICE_USD,
  DEFAULT_DONUT_PRICE_USD,
} from "./constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Price cache - simple in-memory cache for client-side usage
type PriceCache = {
  price: number;
  timestamp: number;
};

const priceCache: Record<string, PriceCache> = {};

function getCachedPrice(key: string): number | null {
  const cached = priceCache[key];
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL_MS) {
    return cached.price;
  }
  return null;
}

function setCachedPrice(key: string, price: number): void {
  priceCache[key] = { price, timestamp: Date.now() };
}

/**
 * Fetches the current ETH to USD price from CoinGecko API
 * Returns cached value if available and fresh
 */
export async function getEthPrice(): Promise<number> {
  const cached = getCachedPrice("eth");
  if (cached !== null) return cached;

  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch ETH price: ${response.status}`);
    }

    const data = await response.json();
    const price = data.ethereum?.usd;

    if (typeof price !== "number") {
      throw new Error("Invalid price data format");
    }

    setCachedPrice("eth", price);
    return price;
  } catch (error) {
    console.error("Error fetching ETH price:", error);
    return DEFAULT_ETH_PRICE_USD;
  }
}

/**
 * Fetches the current DONUT to USD price from CoinGecko API
 * Returns cached value if available and fresh
 */
export async function getDonutPrice(): Promise<number> {
  const cached = getCachedPrice("donut");
  if (cached !== null) return cached;

  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=donut-2&vs_currencies=usd"
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch DONUT price: ${response.status}`);
    }

    const data = await response.json();
    const price = data["donut-2"]?.usd;

    if (typeof price !== "number") {
      throw new Error("Invalid price data format");
    }

    setCachedPrice("donut", price);
    return price;
  } catch (error) {
    console.error("Error fetching DONUT price:", error);
    return DEFAULT_DONUT_PRICE_USD;
  }
}
