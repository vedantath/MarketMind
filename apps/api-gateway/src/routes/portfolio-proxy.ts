import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { loadEnv } from "@marketmind/config";

const env = loadEnv();

/**
 * Explicit forwarder rather than a generic http-proxy plugin: the entire point of this hop is
 * attaching a *verified* identity (from the JWT, never from client input) as `x-user-id` for the
 * downstream service to trust. That has to be visible in the code, not buried in proxy config.
 *
 * x-internal-secret proves to the portfolio service that this request actually came from the
 * gateway, not just from whatever can reach its loopback port — see docs/api.md trust boundary.
 */
async function forward(request: FastifyRequest, reply: FastifyReply, path: string) {
  const url = new URL(path, env.PORTFOLIO_SERVICE_URL);
  url.search = new URL(request.url, "http://internal").search;

  const init: RequestInit = {
    method: request.method,
    headers: {
      "content-type": "application/json",
      "x-user-id": request.user.sub,
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

export async function portfolioProxyRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.all("/api/portfolio/*", async (request, reply) => {
    const path = request.url.replace(/^\/api\/portfolio/, "") || "/";
    return forward(request, reply, path);
  });
}
