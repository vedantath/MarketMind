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

`price` is not yet sourced (no market-data feed in MVP) — until then, `unrealizedPnL` is reported
as `unavailable`, not computed against a stale or fabricated price.

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

Uses cost-basis value (`quantity * costBasis`) as a stand-in for market value until a price feed
exists — labeled as such in the API response, not presented as live market allocation.

### Risk score

`RiskScore = { score, components, explanation }`. Components:

- **concentration** — Herfindahl–Hirschman index over cost-basis allocation weights:
  `HHI = sum(weight_i^2)` for each holding `i`, `weight_i = value_i / totalValue`. Ranges from
  `1/n` (perfectly even across `n` holdings) to `1` (single position). Higher = more concentrated
  = higher risk contribution.
- **positionCount** — linear risk contribution from `1.0` at a single holding down to `0.0` at a
  10-holding "diversification floor": `1 - (count - 1) / (floor - 1)`, clamped to `[0, 1]`.
- **volatility** — price-history-based proxy. **Not computed in MVP** (no market-data feed yet);
  reported as `{ status: 'unavailable', reason: 'no price history source configured' }`. The
  overall `score` and `explanation` must say plainly that volatility was excluded, rather than
  silently omitting it or defaulting it to zero.

```
score = 0.6 * concentration + 0.4 * positionCount   (MVP weights, volatility absent)
```

Implemented in `services/portfolio/src/risk/index.ts`. If a volatility source is added, weights
must be redefined here and in code together — never let the two drift.

`explanation` is a plain-language string built from the component values (e.g. "Risk is
moderate, driven mainly by concentration in 2 of 3 holdings; volatility could not be assessed —
no price history is available yet.").

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
