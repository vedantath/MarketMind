import Fastify from "fastify";
import { ZodError } from "zod";
import { loadEnv } from "@marketmind/config";
import { portfolioRoutes } from "./routes/portfolios";

const env = loadEnv();
const app = Fastify({ logger: { level: env.LOG_LEVEL } });

app.setErrorHandler((error: Error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({ code: "VALIDATION_ERROR", message: error.message });
  }
  const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
  if (statusCode < 500) {
    return reply.code(statusCode).send({ code: "REQUEST_ERROR", message: error.message });
  }
  app.log.error(error);
  return reply.code(500).send({ code: "INTERNAL_ERROR", message: "Internal server error" });
});

app.get("/health", async () => ({ status: "ok" }));

/**
 * Second layer of the trust boundary described in docs/api.md: even though this service is
 * meant to be reachable only via loopback from the gateway, it must not rely on that network
 * boundary alone. Every request (other than the health check) must carry the shared secret the
 * gateway attaches — without it, x-user-id is just an unverified client-supplied header.
 */
app.addHook("onRequest", async (request, reply) => {
  if (request.url === "/health") return;
  const secret = request.headers["x-internal-secret"];
  if (secret !== env.INTERNAL_SERVICE_SECRET) {
    return reply.code(401).send({ code: "UNAUTHORIZED", message: "Missing or invalid internal service credential" });
  }
});

async function main() {
  await app.register(portfolioRoutes);
  // Loopback-only: this service is never meant to be reachable from outside the host it shares
  // with the gateway. The x-internal-secret check above is defense in depth, not the boundary.
  await app.listen({ port: env.PORTFOLIO_PORT, host: "127.0.0.1" });
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
