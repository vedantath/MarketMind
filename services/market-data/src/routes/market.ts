import type { FastifyInstance } from "fastify";
import type Redis from "ioredis";
import { getAssets, getQuote, setQuote } from "@marketmind/events";
import type { AssetSearchResult } from "@marketmind/types";
import type { AlpacaCredentials } from "../providers/alpaca";
import { getLatestTrade } from "../providers/alpaca";

/** Ranks results so exact/prefix symbol matches surface before a name-substring match. */
function rank(query: string, a: AssetSearchResult): number {
  const q = query.toUpperCase();
  const symbol = a.symbol.toUpperCase();
  if (symbol === q) return 0;
  if (symbol.startsWith(q)) return 1;
  return 2;
}

export function createMarketRoutes(redis: Redis, creds: AlpacaCredentials) {
  return async function marketRoutes(app: FastifyInstance) {
    app.get<{ Querystring: { q?: string } }>("/search", async (request) => {
      const query = (request.query.q ?? "").trim().toLowerCase();
      if (!query) return [];

      const assets = await getAssets(redis);
      if (!assets) return []; // cache not populated yet — not an error, just nothing to search

      return assets
        .filter((a) => a.symbol.toLowerCase().includes(query) || a.name.toLowerCase().includes(query))
        .sort((a, b) => rank(query, a) - rank(query, b))
        .slice(0, 20);
    });

    app.get<{ Params: { symbol: string } }>("/quote/:symbol", async (request, reply) => {
      const symbol = request.params.symbol.toUpperCase();
      // Real tickers are short letters/dot/dash (e.g. BRK.B) — reject anything else before it's
      // interpolated into the Alpaca request path, rather than sending Alpaca a malformed URL.
      if (!/^[A-Z.-]{1,10}$/.test(symbol)) {
        return reply.code(400).send({ code: "INVALID_SYMBOL", message: `Not a valid symbol: ${request.params.symbol}` });
      }

      const cached = await getQuote(redis, symbol);
      if (cached) return cached;

      try {
        const quote = await getLatestTrade(creds, symbol);
        await setQuote(redis, symbol, quote); // warm the shared cache portfolio also reads
        return quote;
      } catch (err) {
        return reply.code(404).send({
          code: "NO_QUOTE",
          message: err instanceof Error ? err.message : `No quote available for ${symbol}`,
        });
      }
    });
  };
}
