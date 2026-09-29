import { Prisma } from "@marketmind/db";
import type { Holding } from "@marketmind/db";
import type { RiskScore } from "@marketmind/types";

const { Decimal } = Prisma;

// Two weight sets — which one applies depends on whether volatility could be computed at all.
// Re-normalized to sum to 1 in each case. See docs/algorithms.md.
const WEIGHTS_WITHOUT_VOLATILITY = { concentration: 0.6, positionCount: 0.4 } as const;
const WEIGHTS_WITH_VOLATILITY = { concentration: 0.4, positionCount: 0.3, volatility: 0.3 } as const;

// Minimum daily closes needed to compute a meaningful stdev-of-returns (5 returns).
const MIN_BARS_FOR_VOLATILITY = 6;
// Daily-return stdev treated as "maximally risky" — a documented, tunable ceiling, not a
// statistical fact. A symbol at or above this scales to a volatility component of 1.0.
const VOLATILITY_CEILING = new Decimal("0.05");

/**
 * Stdev of daily simple returns, scaled to [0, 1] against VOLATILITY_CEILING. `closes` must be in
 * chronological order (oldest first), matching the shape OhlcBar[] comes back in from the
 * market-data cache. Returns null when there isn't enough history yet — never a fabricated number.
 */
function symbolVolatility(closes: Prisma.Decimal[]): Prisma.Decimal | null {
  if (closes.length < MIN_BARS_FOR_VOLATILITY) return null;

  const returns: Prisma.Decimal[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]!;
    if (prev.isZero()) continue;
    returns.push(closes[i]!.sub(prev).div(prev));
  }
  if (returns.length < MIN_BARS_FOR_VOLATILITY - 1) return null;

  const mean = returns.reduce((sum, r) => sum.add(r), new Decimal(0)).div(returns.length);
  const variance = returns.reduce((sum, r) => sum.add(r.sub(mean).pow(2)), new Decimal(0)).div(returns.length);
  const stdev = variance.sqrt();

  return Decimal.min(stdev.div(VOLATILITY_CEILING), 1);
}

/**
 * Allocation-weighted average volatility across held symbols. Returns null (whole component stays
 * `unavailable`) if any held symbol lacks enough history — no partial/blended confidence.
 */
function portfolioVolatility(
  holdings: Holding[],
  closesBySymbol: Map<string, Prisma.Decimal[]> | null
): Prisma.Decimal | null {
  if (!closesBySymbol || holdings.length === 0) return null;

  const totalValue = holdings.reduce((sum, h) => sum.add(h.quantity.mul(h.costBasis)), new Decimal(0));
  if (totalValue.isZero()) return null;

  let weighted = new Decimal(0);
  for (const h of holdings) {
    const closes = closesBySymbol.get(h.symbol);
    const vol = closes ? symbolVolatility(closes) : null;
    if (vol === null) return null; // any missing/insufficient symbol voids the whole figure
    const weight = h.quantity.mul(h.costBasis).div(totalValue);
    weighted = weighted.add(vol.mul(weight));
  }
  return weighted;
}

/** Herfindahl–Hirschman index over cost-basis allocation weights, normalized to [0, 1]. */
function concentration(holdings: Holding[]): Prisma.Decimal {
  const totalValue = holdings.reduce(
    (sum, h) => sum.add(h.quantity.mul(h.costBasis)),
    new Decimal(0)
  );
  if (totalValue.isZero()) return new Decimal(0);

  const hhi = holdings.reduce((sum, h) => {
    const weight = h.quantity.mul(h.costBasis).div(totalValue);
    return sum.add(weight.mul(weight));
  }, new Decimal(0));

  return hhi; // ranges from 1/n (perfectly diversified) to 1 (single position)
}

/**
 * Fewer distinct positions -> higher risk contribution. Scales linearly from 1.0 at a single
 * holding down to 0.0 at 10+ holdings (the configured diversification floor).
 */
function positionCountRisk(holdingCount: number): Prisma.Decimal {
  const floor = 10;
  if (holdingCount <= 1) return new Decimal(1);
  if (holdingCount >= floor) return new Decimal(0);
  return new Decimal(1).sub(new Decimal(holdingCount - 1).div(floor - 1));
}

function buildExplanation(
  concentrationScore: Prisma.Decimal,
  positionCount: number,
  overall: Prisma.Decimal,
  volatilityScore: Prisma.Decimal | null
): string {
  const level = overall.gte(0.66) ? "high" : overall.gte(0.33) ? "moderate" : "low";
  const concentrationNote = concentrationScore.gte(0.5)
    ? `driven mainly by concentration across only ${positionCount} holding${positionCount === 1 ? "" : "s"}`
    : `holdings are reasonably diversified across ${positionCount} position${positionCount === 1 ? "" : "s"}`;
  const volatilityNote =
    volatilityScore === null
      ? "Volatility could not be assessed — no price history source is configured yet."
      : `Recent price volatility contributes ${volatilityScore.gte(0.5) ? "significantly" : "modestly"} to the score (${volatilityScore.toFixed(2)} of 1.0).`;
  return `Risk is ${level}, ${concentrationNote}. ${volatilityNote}`;
}

export function computeRiskScore(
  holdings: Holding[],
  closesBySymbol: Map<string, Prisma.Decimal[]> | null = null
): RiskScore {
  const concentrationScore = concentration(holdings);
  const positionScore = positionCountRisk(holdings.length);
  const volatilityScore = portfolioVolatility(holdings, closesBySymbol);

  const overall =
    volatilityScore === null
      ? concentrationScore
          .mul(WEIGHTS_WITHOUT_VOLATILITY.concentration)
          .add(positionScore.mul(WEIGHTS_WITHOUT_VOLATILITY.positionCount))
      : concentrationScore
          .mul(WEIGHTS_WITH_VOLATILITY.concentration)
          .add(positionScore.mul(WEIGHTS_WITH_VOLATILITY.positionCount))
          .add(volatilityScore.mul(WEIGHTS_WITH_VOLATILITY.volatility));

  return {
    score: overall.toString(),
    components: {
      concentration: concentrationScore.toString(),
      positionCount: positionScore.toString(),
      volatility:
        volatilityScore === null
          ? { status: "unavailable", reason: "no price history source configured" }
          : volatilityScore.toString(),
    },
    explanation: buildExplanation(concentrationScore, holdings.length, overall, volatilityScore),
  };
}
