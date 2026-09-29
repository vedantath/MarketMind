# API contracts

Covers what's actually implemented: `apps/api-gateway`, `services/portfolio`, and
`services/market-data` (the last as a cache contract, not HTTP — see below). Everything else in
the roadmap (news-intelligence, ai-orchestration, alerts) has no contract yet.

## Trust boundary

`services/portfolio` binds to `127.0.0.1` only (see `src/index.ts`) — it is not reachable from
outside the host it shares with the gateway, and is not declared in `docker-compose.yml` since it
runs as a plain local process alongside the gateway, not as a separately-networked container.

Every portfolio-service route trusts an `x-user-id` header as already-verified identity and scopes
all queries to it; the service does no JWT verification of its own. On its own, network-boundary
trust is fragile — a misconfigured deployment (a published container port, a firewall rule) would
silently turn `x-user-id` into a fully-forgeable authorization bypass. So there are two independent
layers, not one:

1. **Loopback binding** — the service isn't reachable off-host at all under normal deployment.
2. **`x-internal-secret`** — every request (other than `/health`) must carry a shared secret
   (`INTERNAL_SERVICE_SECRET`) that only the gateway knows; the portfolio service rejects any
   request missing or mismatching it with `401` before `x-user-id` is ever consulted.

The gateway is the only thing that sets `x-user-id` (from the subject (`sub`) of a verified JWT,
never from client input) and `x-internal-secret`. If the portfolio service is ever exposed to
another caller, both of these must still hold — don't remove either layer to "simplify" the proxy.

## `apps/api-gateway` (public)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/register` | none | `{ email, password }` → `201 { token, user }`. `409` if email taken. |
| POST | `/auth/login` | none | `{ email, password }` → `200 { token, user }`. `401` invalid credentials. `400 OAUTH_ONLY_ACCOUNT` if the account has no password hash (OAuth-only) — never a 500. |
| GET | `/auth/me` | Bearer JWT | `200 { id, email }`. |
| * | `/api/portfolio/*` | Bearer JWT | Proxied to the portfolio service with `x-user-id` attached; path prefix stripped. |

## `services/portfolio` (private — behind the gateway only)

All routes require `x-user-id` (see Trust boundary). A portfolio not owned by that user id returns
`404`, never `403` — existence isn't revealed to non-owners.

| Method | Path | Notes |
|---|---|---|
| POST | `/portfolios` | `{ name }` → `201`. |
| GET | `/portfolios` | List the caller's portfolios. |
| GET | `/portfolios/:id/holdings` | Aggregated holdings (one row per symbol). |
| GET | `/portfolios/:id/transactions` | The append-only ledger, oldest first. |
| POST | `/portfolios/:id/transactions` | `{ symbol, type: "BUY"\|"SELL", quantity, price, fees?, executedAt? }`. Quantity/price/fees are decimal strings. `400 INSUFFICIENT_QUANTITY` on an oversized SELL. Only BUY/SELL are wired into cost-basis math in MVP — DIVIDEND/SPLIT/TRANSFER_* exist in the schema but aren't accepted here yet. |
| GET | `/portfolios/:id/summary` | `PortfolioSummary` — holdings, PnL, allocation, risk (see `packages/types` and `docs/algorithms.md`). |

All money/quantity fields are **decimal strings**, never JSON numbers — see `packages/types`'
`DecimalString` convention.

## `services/market-data` (internal Redis cache, not HTTP)

Not reachable by the gateway or any other service over HTTP — it exposes only a loopback
`GET /health` for operator visibility. The actual contract other services rely on is the Redis
cache it writes (see `packages/events/src/quote-cache.ts` and `docs/algorithms.md`'s "Market data"
section):

| Key | Value | TTL |
|---|---|---|
| `quote:<SYMBOL>` | JSON `Quote` (`{ symbol, price, asOf }`) | ~5 min |
| `bars:<SYMBOL>` | JSON `OhlcBar[]` (~30 most recent daily bars) | ~25 hr |

A missing key means "no fresh data for that symbol" — consumers (`services/portfolio`) must treat
that as `unavailable` for anything derived from it, never as zero or stale-but-trusted.
