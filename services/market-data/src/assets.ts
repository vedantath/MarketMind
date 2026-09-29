import type Redis from "ioredis";
import { setAssets } from "@marketmind/events";
import type { AlpacaCredentials } from "./providers/alpaca";
import { getTradableUsEquities } from "./providers/alpaca";

/**
 * Refreshes the shared tradable-assets cache. Failure is logged and the process keeps running —
 * the last good cache (if any) just keeps serving search until the next successful refresh,
 * same resilience philosophy as poll.ts's per-symbol skip-and-continue.
 */
export async function refreshAssetCache(
  redis: Redis,
  creds: AlpacaCredentials,
  log: { info: (msg: string) => void; warn: (msg: string) => void }
): Promise<void> {
  try {
    const assets = await getTradableUsEquities(creds);
    await setAssets(redis, assets);
    log.info(`Refreshed tradable-assets cache: ${assets.length} symbols`);
  } catch (err) {
    log.warn(`Asset cache refresh failed, keeping last good cache: ${err instanceof Error ? err.message : String(err)}`);
  }
}
