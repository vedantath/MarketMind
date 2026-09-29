import Fastify from "fastify";
import Redis from "ioredis";
import { loadEnv } from "@marketmind/config";
import { runPollTick } from "./poll";

const env = loadEnv();

// This service's entire job is the Alpaca integration — fail loudly at startup rather than
// silently polling nothing, matching loadEnv()'s own "fail at startup, not first use" rule.
if (!env.ALPACA_API_KEY || !env.ALPACA_SECRET_KEY) {
  console.error("ALPACA_API_KEY and ALPACA_SECRET_KEY are required to run services/market-data.");
  process.exit(1);
}

const credentials = {
  dataUrl: env.ALPACA_DATA_URL,
  apiKey: env.ALPACA_API_KEY,
  secretKey: env.ALPACA_SECRET_KEY,
};

const symbols = env.MARKET_DATA_SYMBOLS.split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const app = Fastify({ logger: { level: env.LOG_LEVEL } });
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });

app.get("/health", async () => ({ status: "ok", symbols }));

async function main() {
  await app.listen({ port: env.MARKET_DATA_PORT, host: "127.0.0.1" });

  const tick = () => runPollTick(redis, credentials, symbols, app.log);
  await tick();
  setInterval(tick, env.MARKET_DATA_POLL_INTERVAL_MS);
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
