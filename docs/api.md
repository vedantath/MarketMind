# API contracts

Covers what's actually implemented: `apps/api-gateway`, `services/portfolio`, and
`services/market-data` — the last has both an HTTP contract (search/quote, behind the gateway) and
a Redis cache contract (quotes/bars, read directly by `services/portfolio`). Everything else in the
roadmap (news-intelligence, ai-orchestration, alerts) has no contract yet.

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

`services/market-data` has the same two-layer boundary (loopback + `x-internal-secret`), even
though none of its routes are user-scoped — there's simply no unauthenticated internal service in
this system, by design.

## `apps/api-gateway` (public)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/register` | none | `{ email, password }` → `201 { token, user }`. `409` if email taken. |
| POST | `/auth/login` | none | `{ email, password }` → `200 { token, user }`. `401` invalid credentials. `400 OAUTH_ONLY_ACCOUNT` if the account has no password hash (OAuth-only) — never a 500. |
| GET | `/auth/me` | Bearer JWT | `200 { id, email }`. |
| * | `/api/portfolio/*` | Bearer JWT | Proxied to the portfolio service with `x-user-id` attached; path prefix stripped. |
| * | `/api/market/*` | Bearer JWT | Proxied to the market-data service; path prefix stripped. No `x-user-id` — nothing behind it is user-scoped. |

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

## `services/market-data` (private — behind the gateway only, plus a Redis cache contract)

`GET /health` needs no `x-internal-secret` (see Trust boundary); every other route does.

| Method | Path | Notes |
|---|---|---|
| GET | `/search?q=` | In-memory substring search over the cached tradable-US-equity list (`AssetSearchResult[]`, capped at 20, ranked exact-symbol-match first). Returns `[]`, not an error, if the asset cache hasn't populated yet or nothing matches. |
| GET | `/quote/:symbol` | Cache-first `Quote`; on a cache miss, fetches live from Alpaca and warms the cache (same key `services/portfolio` reads). `404 NO_QUOTE` for a symbol Alpaca has no trade for — never a 500. |

`services/portfolio` does **not** call these HTTP routes — it reads the Redis cache directly (see
`packages/events/src/quote-cache.ts`, `asset-cache.ts`, and `docs/algorithms.md`'s "Market data"
section):

| Key | Value | TTL |
|---|---|---|
| `quote:<SYMBOL>` | JSON `Quote` (`{ symbol, price, asOf }`) | ~5 min |
| `bars:<SYMBOL>` | JSON `OhlcBar[]` (~30 most recent daily bars) | ~25 hr |
| `assets:us_equity` | JSON `AssetSearchResult[]` (full tradable list, slimmed to `{symbol, name, exchange}`) | ~26 hr |

A missing quote/bars key means "no fresh data for that symbol" — `services/portfolio` must treat
that as `unavailable` for anything derived from it, never as zero or stale-but-trusted.
