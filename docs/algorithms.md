# Algorithms

> Source of truth for every scoring/aggregation formula in the system. Code and this doc ship
> together — if you change a formula, update this file in the same commit.

## Portfolio (`services/portfolio`)

### PnL

For a holding with aggregated `quantity` and weighted-average `costBasis` (both `Decimal(20,8)`),
and a current `price`:

```
unrealizedPnL   = (price - costBasis) * quantity
unrealizedPnLPct = (price - costBasis) / costBasis        (undefined when costBasis == 0)
```

`price` comes from `services/market-data`'s Redis quote cache (`quote:<SYMBOL>`, see "Market data"
below). If **any** held symbol is missing a fresh quote, `unrealizedPnL` for the whole portfolio
stays `unavailable` (naming the missing symbol) rather than mixing live and stale/missing prices
into one figure.

Realized PnL is the sum, over a holding's `SELL` transactions, of
`(sellPrice - costBasisAtSaleTime) * sellQuantity`. `costBasisAtSaleTime` is the weighted-average
cost basis immediately before that sale, recomputed forward through the ledger — never the
current holding's cost basis.

Weighted-average cost basis update on a `BUY` of `qty` @ `price`:

```
newCostBasis = (existingQuantity * existingCostBasis + qty * price) / (existingQuantity + qty)
```

A `SELL` reduces `quantity` but does not change `costBasis` (FIFO/weighted-average, not
lot-selection).

### Allocation

```
allocationPct(holding) = holdingMarketOrCostValue / sum(all holdingMarketOrCostValue in portfolio)
```

Uses market value (`quantity * price`) when every held symbol has a fresh quote from the cache;
falls back to cost-basis value (`quantity * costBasis`) otherwise. `valuationBasis` on each
`AllocationSlice` says which one was used — never a silent mix of both within one response.

### Risk score

`RiskScore = { score, components, explanation }`. Components:

- **concentration** — Herfindahl–Hirschman index over cost-basis allocation weights:
  `HHI = sum(weight_i^2)` for each holding `i`, `weight_i = value_i / totalValue`. Ranges from
  `1/n` (perfectly even across `n` holdings) to `1` (single position). Higher = more concentrated
  = higher risk contribution.
- **positionCount** — linear risk contribution from `1.0` at a single holding down to `0.0` at a
  10-holding "diversification floor": `1 - (count - 1) / (floor - 1)`, clamped to `[0, 1]`.
- **volatility** — stdev of daily simple returns from `services/market-data`'s recent daily bars
  (`bars:<SYMBOL>` cache), scaled to `[0, 1]` against a documented ceiling:
  `volatility_i = min(stdev(returns_i) / 0.05, 1)`, where `0.05` (5% daily stdev) is a tunable
  constant marking "maximally risky", not a statistical fact. Needs at least 6 daily closes (5
  returns) per symbol. Portfolio-level volatility is the cost-basis-weighted average of
  `volatility_i` across held symbols. If **any** held symbol lacks enough history, the whole
  component stays `unavailable` (`{ status: 'unavailable', reason: 'no price history source
  configured' }`) — no partial/blended confidence, and the overall `score`/`explanation` must say
  plainly that volatility was excluded rather than silently defaulting it to zero.

```
score = 0.6 * concentration + 0.4 * positionCount                                (volatility absent)
score = 0.4 * concentration + 0.3 * positionCount + 0.3 * volatility             (volatility present)
```

Implemented in `services/portfolio/src/risk/index.ts` (`WEIGHTS_WITHOUT_VOLATILITY`,
`WEIGHTS_WITH_VOLATILITY`, `VOLATILITY_CEILING`, `MIN_BARS_FOR_VOLATILITY`). If either weight set or
the ceiling changes, update this doc in the same commit — never let them drift.

`explanation` is a plain-language string built from the component values (e.g. "Risk is
moderate, driven mainly by concentration in 2 of 3 holdings. Recent price volatility contributes
modestly to the score (0.22 of 1.0)." — or, when there isn't enough history yet, "...volatility
could not be assessed — no price history is available yet.").

## Market data (`services/market-data`)

Polls Alpaca's Market Data API (`ALPACA_DATA_URL`, free/IEX feed only — `feed=sip` requires a paid
subscription) once per `MARKET_DATA_POLL_INTERVAL_MS` for the symbols in `MARKET_DATA_SYMBOLS`, and
writes two keys per symbol into Redis (see `packages/events/src/quote-cache.ts`):
- `quote:<SYMBOL>` — latest trade price, TTL a few minutes past the poll interval so a missed tick
  doesn't instantly blank the dashboard, but a genuinely stale feed still expires.
- `bars:<SYMBOL>` — the most recent ~30 daily bars, overwritten (not appended) each poll.

This is a cache other services read directly, not an HTTP API and not a `MarketEvent` (the event
contract is news-shaped — `title`/`summary`/`impact` — and doesn't fit a bare price). A failed
fetch for one symbol is logged and skipped for that tick; it never blocks the others. The watchlist
is a static env var, not derived from live portfolios, in MVP — a known simplification.

## News intelligence (`services/news-intelligence`) — not yet implemented

```
Impact = Sentiment × SourceWeight × MentionFrequency × MarketSensitivity
```

Normalized to `[0, 1]`. Component values are persisted alongside the final score (not just the
score) so `ai-orchestration` can explain why an item scored the way it did. Source weights and
market-sensitivity tables are config-driven, not hardcoded per source.

## Correlation (`services/ai-orchestration`) — not yet implemented

Event ↔ price likelihood via time alignment, magnitude, and sector match. To be specified when
that slice is built.
