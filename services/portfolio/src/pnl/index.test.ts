import { describe, expect, it } from "vitest";
import { Prisma } from "@marketmind/db";
import type { Holding, Transaction } from "@marketmind/db";
import { computeAllocation, computePnl, computeRealizedPnl } from "./index";

const { Decimal } = Prisma;

function txn(overrides: Partial<Transaction>): Transaction {
  return {
    id: "t1",
    portfolioId: "p1",
    holdingId: "h1",
    symbol: "AAPL",
    type: "BUY",
    quantity: new Decimal(0),
    price: new Decimal(0),
    fees: null,
    executedAt: new Date(),
    source: "MANUAL",
    externalId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function holding(overrides: Partial<Holding>): Holding {
  return {
    id: "h1",
    portfolioId: "p1",
    symbol: "AAPL",
    quantity: new Decimal(0),
    costBasis: new Decimal(0),
    source: "MANUAL",
    externalId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("computeRealizedPnl", () => {
  it("computes gain on a simple buy-then-sell", () => {
    const transactions = [
      txn({ type: "BUY", quantity: new Decimal(10), price: new Decimal(100), executedAt: new Date("2024-01-01") }),
      txn({ type: "SELL", quantity: new Decimal(4), price: new Decimal(150), executedAt: new Date("2024-02-01") }),
    ];
    // realized = (150 - 100) * 4 = 200
    expect(computeRealizedPnl(transactions).toString()).toBe("200");
  });

  it("uses the running weighted-average cost basis, not the final one, for an earlier sell", () => {
    // A fractional-quantity case that would silently round wrong under floating point.
    const transactions = [
      txn({ type: "BUY", quantity: new Decimal("0.1"), price: new Decimal(300), executedAt: new Date("2024-01-01") }),
      txn({ type: "SELL", quantity: new Decimal("0.1"), price: new Decimal(310), executedAt: new Date("2024-01-02") }),
      txn({ type: "BUY", quantity: new Decimal("0.2"), price: new Decimal(500), executedAt: new Date("2024-01-03") }),
    ];
    // sell realized = (310 - 300) * 0.1 = 1 (unaffected by the later, higher-priced buy)
    expect(computeRealizedPnl(transactions).toString()).toBe("1");
  });

  it("ignores transaction types not yet wired into PnL", () => {
    const transactions = [
      txn({ type: "DIVIDEND", quantity: new Decimal(1), price: new Decimal(5) }),
    ];
    expect(computeRealizedPnl(transactions).toString()).toBe("0");
  });
});

describe("computeAllocation", () => {
  it("weights by cost-basis value and labels the valuation basis", () => {
    const holdings = [
      holding({ symbol: "AAPL", quantity: new Decimal(10), costBasis: new Decimal(100) }), // 1000
      holding({ symbol: "MSFT", quantity: new Decimal(5), costBasis: new Decimal(200) }), // 1000
    ];
    const allocation = computeAllocation(holdings);
    expect(allocation).toHaveLength(2);
    for (const slice of allocation) {
      expect(slice.pctOfPortfolio).toBe("50");
      expect(slice.valuationBasis).toBe("COST_BASIS");
    }
  });

  it("returns zero allocation without dividing by zero on an empty portfolio", () => {
    expect(computeAllocation([])).toEqual([]);
  });

  it("switches to market-value weighting when every held symbol has a fresh quote", () => {
    const holdings = [
      holding({ symbol: "AAPL", quantity: new Decimal(10), costBasis: new Decimal(100) }), // cost 1000
      holding({ symbol: "MSFT", quantity: new Decimal(5), costBasis: new Decimal(200) }), // cost 1000
    ];
    // market values: AAPL 10*150=1500, MSFT 5*100=500 -> 75% / 25%, not the 50/50 cost split
    const quotes = new Map([
      ["AAPL", new Decimal(150)],
      ["MSFT", new Decimal(100)],
    ]);
    const allocation = computeAllocation(holdings, quotes);
    const aapl = allocation.find((a) => a.symbol === "AAPL")!;
    const msft = allocation.find((a) => a.symbol === "MSFT")!;
    expect(aapl.valuationBasis).toBe("MARKET_VALUE");
    expect(aapl.pctOfPortfolio).toBe("75");
    expect(msft.pctOfPortfolio).toBe("25");
  });

  it("falls back to cost-basis weighting when any held symbol is missing a quote", () => {
    const holdings = [
      holding({ symbol: "AAPL", quantity: new Decimal(10), costBasis: new Decimal(100) }),
      holding({ symbol: "MSFT", quantity: new Decimal(5), costBasis: new Decimal(200) }),
    ];
    const quotes = new Map([["AAPL", new Decimal(150)]]); // MSFT missing
    const allocation = computeAllocation(holdings, quotes);
    expect(allocation.every((a) => a.valuationBasis === "COST_BASIS")).toBe(true);
  });
});

describe("computePnl", () => {
  it("reports unrealized PnL as unavailable when a held symbol has no quote", () => {
    const holdings = [holding({ symbol: "AAPL", quantity: new Decimal(10), costBasis: new Decimal(100) })];
    const pnl = computePnl([], holdings, new Map());
    expect(pnl.unrealized).toEqual({ status: "unavailable", reason: "missing a live price for AAPL" });
  });

  it("reports zero unrealized PnL (not unavailable) for a portfolio with no holdings", () => {
    const pnl = computePnl([], [], new Map());
    expect(pnl.unrealized).toEqual({ amount: "0", pct: null });
  });

  it("computes unrealized amount and pct once every held symbol has a quote", () => {
    const holdings = [
      holding({ symbol: "AAPL", quantity: new Decimal(10), costBasis: new Decimal(100) }), // cost 1000
    ];
    const quotes = new Map([["AAPL", new Decimal(150)]]);
    const pnl = computePnl([], holdings, quotes);
    // (150 - 100) * 10 = 500; pct = 500 / 1000 * 100 = 50
    expect(pnl.unrealized).toEqual({ amount: "500", pct: "50" });
  });
});
