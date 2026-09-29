import Redis from "ioredis";
import { Prisma } from "@marketmind/db";
import { getQuote, getBars } from "@marketmind/events";
import { loadEnv } from "@marketmind/config";

const env = loadEnv();
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });

/**
 * Partial maps: a missing key means "no fresh price for that symbol", not zero. pnl/risk decide
 * what "missing" means for a given figure — this module only reads the shared cache that
 * services/market-data writes (see packages/events/src/quote-cache.ts).
 */
export async function getQuotesForSymbols(symbols: string[]): Promise<Map<string, Prisma.Decimal>> {
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      const quote = await getQuote(redis, symbol);
      return quote ? ([symbol, new Prisma.Decimal(quote.price)] as const) : null;
    })
  );
  return new Map(entries.filter((e): e is [string, Prisma.Decimal] => e !== null));
}

export async function getClosesForSymbols(symbols: string[]): Promise<Map<string, Prisma.Decimal[]>> {
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      const bars = await getBars(redis, symbol);
      return bars ? ([symbol, bars.map((b) => new Prisma.Decimal(b.close))] as const) : null;
    })
  );
  return new Map(entries.filter((e): e is [string, Prisma.Decimal[]] => e !== null));
}
