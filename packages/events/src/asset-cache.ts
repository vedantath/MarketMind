import type Redis from "ioredis";
import type { AssetSearchResult } from "@marketmind/types";

/**
 * The full tradable-US-equity list, refreshed periodically by services/market-data and searched
 * in-memory on read. A single fixed key — there's only ever one list, unlike the per-symbol
 * quote/bars cache in quote-cache.ts.
 */
const ASSETS_KEY = "assets:us_equity";
const ASSETS_TTL_SECONDS = 26 * 60 * 60; // a bit longer than the default 24h refresh interval

export function assetsKey(): string {
  return ASSETS_KEY;
}

export async function setAssets(redis: Redis, assets: AssetSearchResult[]): Promise<void> {
  await redis.set(ASSETS_KEY, JSON.stringify(assets), "EX", ASSETS_TTL_SECONDS);
}

export async function getAssets(redis: Redis): Promise<AssetSearchResult[] | null> {
  const raw = await redis.get(ASSETS_KEY);
  return raw ? (JSON.parse(raw) as AssetSearchResult[]) : null;
}
