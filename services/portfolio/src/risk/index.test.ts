import { describe, expect, it } from "vitest";
import { Prisma } from "@marketmind/db";
import type { Holding } from "@marketmind/db";
import { computeRiskScore } from "./index";

const { Decimal } = Prisma;

function holding(symbol: string, quantity: number, costBasis: number): Holding {
  return {
    id: symbol,
    portfolioId: "p1",
    symbol,
    quantity: new Decimal(quantity),
    costBasis: new Decimal(costBasis),
    source: "MANUAL",
    externalId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("computeRiskScore", () => {
  it("always reports volatility as unavailable in MVP", () => {
    const risk = computeRiskScore([holding("AAPL", 10, 100)]);
    expect(risk.components.volatility).toEqual({
      status: "unavailable",
      reason: "no price history source configured",
    });
    expect(risk.explanation).toMatch(/volatility could not be assessed/i);
  });

  it("scores a single-holding portfolio as maximally concentrated", () => {
    const risk = computeRiskScore([holding("AAPL", 10, 100)]);
    expect(risk.components.concentration).toBe("1");
    expect(risk.components.positionCount).toBe("1");
  });

  it("scores lower risk for an evenly split, more numerous portfolio", () => {
    const concentrated = computeRiskScore([holding("AAPL", 10, 100)]);
    const diversified = computeRiskScore([
      holding("AAPL", 10, 100),
      holding("MSFT", 10, 100),
      holding("NVDA", 10, 100),
      holding("GOOG", 10, 100),
    ]);
    expect(Number(diversified.score)).toBeLessThan(Number(concentrated.score));
  });

  it("does not divide by zero on an empty portfolio", () => {
    const risk = computeRiskScore([]);
    expect(risk.components.concentration).toBe("0");
    expect(risk.components.positionCount).toBe("1");
  });
});
