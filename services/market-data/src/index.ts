import Fastify from "fastify";
import Redis from "ioredis";
import { loadEnv } from "@marketmind/config";
import { runPollTick } from "./poll";
import { refreshAssetCache } from "./assets";
import { createMarketRoutes } from "./routes/market";

const env = loadEnv();

// This service's entire job is the Alpaca integration — fail loudly at startup rather than
// silently polling nothing, matching loadEnv()'s own "fail at startup, not first use" rule.
if (!env.ALPACA_API_KEY || !env.ALPACA_SECRET_KEY) {
  console.error("ALPACA_API_KEY and ALPACA_SECRET_KEY are required to run services/market-data.");
  process.exit(1);
}

const credentials = {
  dataUrl: env.ALPACA_DATA_URL,
  tradingUrl: env.ALPACA_ENDPOINT,
  apiKey: env.ALPACA_API_KEY,
  secretKey: env.ALPACA_SECRET_KEY,
};

const symbols = env.MARKET_DATA_SYMBOLS.split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const app = Fastify({ logger: { level: env.LOG_LEVEL } });
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });

app.setErrorHandler((error: Error, _request, reply) => {
  const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
  if (statusCode < 500) {
    return reply.code(statusCode).send({ code: "REQUEST_ERROR", message: error.message });
  }
  app.log.error(error);
  return reply.code(500).send({ code: "INTERNAL_ERROR", message: "Internal server error" });
});

app.get("/health", async () => ({ status: "ok", symbols }));

/**
 * Same two-layer trust boundary as services/portfolio (see docs/api.md): loopback binding plus a
 * shared secret the gateway attaches, checked before any route handler runs. Now that this
 * service serves more than /health, it needs the same guard portfolio has always had.
 */
app.addHook("onRequest", async (request, reply) => {
  if (request.url === "/health") return;
  const secret = request.headers["x-internal-secret"];
  if (secret !== env.INTERNAL_SERVICE_SECRET) {
    return reply.code(401).send({ code: "UNAUTHORIZED", message: "Missing or invalid internal service credential" });
  }
});

async function main() {
  await app.register(createMarketRoutes(redis, credentials));
  // Loopback-only, same as services/portfolio — never meant to be reachable off-host.
  await app.listen({ port: env.MARKET_DATA_PORT, host: "127.0.0.1" });

  const tick = () => runPollTick(redis, credentials, symbols, app.log);
  await tick();
  setInterval(tick, env.MARKET_DATA_POLL_INTERVAL_MS);

  const refreshAssets = () => refreshAssetCache(redis, credentials, app.log);
  await refreshAssets();
  setInterval(refreshAssets, env.ASSET_REFRESH_INTERVAL_MS);
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
