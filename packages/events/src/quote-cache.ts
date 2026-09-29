import type Redis from "ioredis";
import type { Quote, OhlcBar } from "@marketmind/types";

/**
 * A shared Redis cache for latest quotes and recent daily bars — NOT the event queue above.
 * A price isn't a discrete "market event" (the MarketEvent contract is news-shaped: title,
 * summary, impact components), so it gets its own narrower contract here instead of being forced
 * through publishEvent/subscribeEvents. services/market-data writes this cache; services/portfolio
 * reads it. Neither service imports the other — this file is the entire coupling contract.
 */

const QUOTE_TTL_SECONDS = 5 * 60; // a few minutes longer than the default poll interval
const BARS_TTL_SECONDS = 25 * 60 * 60; // just over a day — daily bars don't need to outlive that

export function quoteKey(symbol: string): string {
  return `quote:${symbol.toUpperCase()}`;
}

export function barsKey(symbol: string): string {
  return `bars:${symbol.toUpperCase()}`;
}

export async function setQuote(redis: Redis, symbol: string, quote: Quote): Promise<void> {
  await redis.set(quoteKey(symbol), JSON.stringify(quote), "EX", QUOTE_TTL_SECONDS);
}

export async function getQuote(redis: Redis, symbol: string): Promise<Quote | null> {
  const raw = await redis.get(quoteKey(symbol));
  return raw ? (JSON.parse(raw) as Quote) : null;
}

export async function setBars(redis: Redis, symbol: string, bars: OhlcBar[]): Promise<void> {
  await redis.set(barsKey(symbol), JSON.stringify(bars), "EX", BARS_TTL_SECONDS);
}

export async function getBars(redis: Redis, symbol: string): Promise<OhlcBar[] | null> {
  const raw = await redis.get(barsKey(symbol));
  return raw ? (JSON.parse(raw) as OhlcBar[]) : null;
}
