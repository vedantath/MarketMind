import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { loadEnv } from "@marketmind/config";

const env = loadEnv();

/**
 * Same explicit-forwarder shape as portfolio-proxy.ts. No x-user-id here — nothing behind this
 * proxy is user-scoped — but x-internal-secret still proves the request came from the gateway,
 * not just from whatever can reach market-data's loopback port. See docs/api.md trust boundary.
 */
async function forward(request: FastifyRequest, reply: FastifyReply, path: string) {
  const url = new URL(path, env.MARKET_DATA_SERVICE_URL);
  url.search = new URL(request.url, "http://internal").search;

  const init: RequestInit = {
    method: request.method,
    headers: {
      "content-type": "application/json",
      "x-internal-secret": env.INTERNAL_SERVICE_SECRET,
    },
  };
  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = JSON.stringify(request.body);
  }

  const response = await fetch(url, init);

  const text = await response.text();
  reply.code(response.status);
  if (text) {
    reply.header("content-type", "application/json");
    return reply.send(text);
  }
  return reply.send();
}

export async function marketProxyRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.all("/api/market/*", async (request, reply) => {
    const path = request.url.replace(/^\/api\/market/, "") || "/";
    return forward(request, reply, path);
  });
}
