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
  it("reports volatility as unavailable when no price history is provided", () => {
    const risk = computeRiskScore([holding("AAPL", 10, 100)]);
    expect(risk.components.volatility).toEqual({
      status: "unavailable",
      reason: "no price history source configured",
    });
    expect(risk.explanation).toMatch(/volatility could not be assessed/i);
  });

  it("reports volatility as unavailable when a held symbol has too little history", () => {
    const closes = new Map([["AAPL", [100, 101, 99].map((n) => new Decimal(n))]]); // only 2 returns
    const risk = computeRiskScore([holding("AAPL", 10, 100)], closes);
    expect(risk.components.volatility).toEqual({
      status: "unavailable",
      reason: "no price history source configured",
    });
  });

  it("computes a volatility component once every held symbol has enough history", () => {
    const closes = new Map([
      ["AAPL", [100, 101, 99, 102, 98, 103, 97].map((n) => new Decimal(n))],
    ]);
    const risk = computeRiskScore([holding("AAPL", 10, 100)], closes);
    expect(typeof risk.components.volatility).toBe("string");
    expect(Number(risk.components.volatility)).toBeGreaterThan(0);
    expect(risk.explanation).toMatch(/recent price volatility/i);
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
