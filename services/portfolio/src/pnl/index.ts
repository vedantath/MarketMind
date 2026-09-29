import { Prisma } from "@marketmind/db";
import type { Holding, Transaction } from "@marketmind/db";
import type { AllocationSlice, PnL } from "@marketmind/types";

const { Decimal } = Prisma;

/**
 * Realized PnL: replay each symbol's BUY/SELL ledger in chronological order, tracking a running
 * weighted-average cost basis exactly as recordTransaction does. A SELL's realized gain is
 * (price - runningCostBasis) * quantity at that point in the ledger — not the holding's current
 * cost basis, which may have moved due to later BUYs. See docs/algorithms.md.
 */
export function computeRealizedPnl(transactions: Transaction[]): Prisma.Decimal {
  const bySymbol = new Map<string, Transaction[]>();
  for (const txn of transactions) {
    if (txn.type !== "BUY" && txn.type !== "SELL") continue; // other types not wired into PnL yet
    const list = bySymbol.get(txn.symbol) ?? [];
    list.push(txn);
    bySymbol.set(txn.symbol, list);
  }

  let realized = new Decimal(0);

  for (const symbolTxns of bySymbol.values()) {
    const ordered = [...symbolTxns].sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime());
    let runningQty = new Decimal(0);
    let runningCostBasis = new Decimal(0);

    for (const txn of ordered) {
      if (txn.type === "BUY") {
        const totalCost = runningQty.mul(runningCostBasis).add(txn.quantity.mul(txn.price));
        runningQty = runningQty.add(txn.quantity);
        runningCostBasis = runningQty.isZero() ? new Decimal(0) : totalCost.div(runningQty);
      } else {
        realized = realized.add(txn.price.sub(runningCostBasis).mul(txn.quantity));
        runningQty = runningQty.sub(txn.quantity);
      }
    }
  }

  return realized;
}

/**
 * Allocation weighted by cost-basis value, not live market value — there's no price feed yet.
 * Callers must surface `valuationBasis` so the UI doesn't imply this is current market allocation.
 */
export function computeAllocation(holdings: Holding[]): AllocationSlice[] {
  const totalValue = holdings.reduce(
    (sum, h) => sum.add(h.quantity.mul(h.costBasis)),
    new Decimal(0)
  );

  return holdings.map((h) => {
    const value = h.quantity.mul(h.costBasis);
    const pct = totalValue.isZero() ? new Decimal(0) : value.div(totalValue).mul(100);
    return {
      symbol: h.symbol,
      pctOfPortfolio: pct.toString(),
      valuationBasis: "COST_BASIS" as const,
    };
  });
}

export function computePnl(transactions: Transaction[]): PnL {
  return {
    // No market-data price feed in MVP — reporting a number here would be fabricated, not derived.
    unrealized: { status: "unavailable", reason: "no price feed configured" },
    realized: { amount: computeRealizedPnl(transactions).toString() },
  };
}
