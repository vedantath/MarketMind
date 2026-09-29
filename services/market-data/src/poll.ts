import type Redis from "ioredis";
import { setQuote, setBars } from "@marketmind/events";
import type { AlpacaCredentials } from "./providers/alpaca";
import { getLatestTrade, getRecentDailyBars } from "./providers/alpaca";

const BARS_LOOKBACK = 30; // enough for a 20-30 day volatility window

/**
 * One poll tick: fetch trade + bars for every watched symbol in parallel and write them to the
 * shared cache. A single symbol's failure (rate limit, bad symbol, network blip) is logged and
 * skipped — it must never take down the loop or block the other symbols.
 */
export async function runPollTick(
  redis: Redis,
  creds: AlpacaCredentials,
  symbols: string[],
  log: { info: (msg: string) => void; warn: (msg: string) => void }
): Promise<void> {
  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const [quote, bars] = await Promise.all([
          getLatestTrade(creds, symbol),
          getRecentDailyBars(creds, symbol, BARS_LOOKBACK),
        ]);
        await Promise.all([setQuote(redis, symbol, quote), setBars(redis, symbol, bars)]);
        log.info(`Updated cache for ${symbol}: price=${quote.price}, bars=${bars.length}`);
      } catch (err) {
        log.warn(`Skipping ${symbol} this tick: ${err instanceof Error ? err.message : String(err)}`);
      }
    })
  );
}
