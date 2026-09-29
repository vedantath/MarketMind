import { Prisma } from "@marketmind/db";
import type { Holding } from "@marketmind/db";
import type { RiskScore } from "@marketmind/types";

const { Decimal } = Prisma;

// Component weights when volatility is unavailable (MVP default — no price feed yet).
// Re-normalized to sum to 1 over whatever components are actually available.
const WEIGHTS_WITHOUT_VOLATILITY = { concentration: 0.6, positionCount: 0.4 } as const;

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
  overall: Prisma.Decimal
): string {
  const level = overall.gte(0.66) ? "high" : overall.gte(0.33) ? "moderate" : "low";
  const concentrationNote = concentrationScore.gte(0.5)
    ? `driven mainly by concentration across only ${positionCount} holding${positionCount === 1 ? "" : "s"}`
    : `holdings are reasonably diversified across ${positionCount} position${positionCount === 1 ? "" : "s"}`;
  return (
    `Risk is ${level}, ${concentrationNote}. ` +
    `Volatility could not be assessed — no price history source is configured yet.`
  );
}

export function computeRiskScore(holdings: Holding[]): RiskScore {
  const concentrationScore = concentration(holdings);
  const positionScore = positionCountRisk(holdings.length);

  const overall = concentrationScore
    .mul(WEIGHTS_WITHOUT_VOLATILITY.concentration)
    .add(positionScore.mul(WEIGHTS_WITHOUT_VOLATILITY.positionCount));

  return {
    score: overall.toString(),
    components: {
      concentration: concentrationScore.toString(),
      positionCount: positionScore.toString(),
      volatility: { status: "unavailable", reason: "no price history source configured" },
    },
    explanation: buildExplanation(concentrationScore, holdings.length, overall),
  };
}
