/// <reference path="./types/fastify-jwt.d.ts" />
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Redis from "ioredis";
import { ZodError } from "zod";
import { loadEnv } from "@marketmind/config";
import authenticatePlugin from "./auth/authenticate";
import { authRoutes } from "./auth/routes";
import { portfolioProxyRoutes } from "./routes/portfolio-proxy";

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

async function main() {
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });

  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute", redis });
  await app.register(jwt, { secret: env.JWT_SECRET, sign: { expiresIn: env.JWT_EXPIRES_IN } });
  await app.register(authenticatePlugin);
  await app.register(authRoutes);
  await app.register(portfolioProxyRoutes);

  await app.listen({ port: env.GATEWAY_PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
