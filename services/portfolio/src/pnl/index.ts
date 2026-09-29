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
 * A held symbol not in `quotes` means "no fresh price for it" (see packages/events' quote cache —
 * a missing key there is either never polled or expired). Returns null unless every held symbol
 * has an entry, so callers never silently mix live and stale/missing prices in one figure.
 */
function symbolsMissingQuotes(holdings: Holding[], quotes: Map<string, Prisma.Decimal> | null): string[] {
  if (!quotes) return [...new Set(holdings.map((h) => h.symbol))];
  return [...new Set(holdings.filter((h) => !quotes.has(h.symbol)).map((h) => h.symbol))];
}

/**
 * Allocation weighted by live market value when every held symbol has a fresh quote; falls back
 * to cost-basis weighting otherwise. `valuationBasis` tells the UI which one it's looking at —
 * never presented as market value when it isn't. See docs/algorithms.md.
 */
export function computeAllocation(
  holdings: Holding[],
  quotes: Map<string, Prisma.Decimal> | null = null
): AllocationSlice[] {
  const useMarketValue = symbolsMissingQuotes(holdings, quotes).length === 0 && quotes !== null;
  const valueOf = (h: Holding) => (useMarketValue ? quotes!.get(h.symbol)! : h.costBasis).mul(h.quantity);

  const totalValue = holdings.reduce((sum, h) => sum.add(valueOf(h)), new Decimal(0));

  return holdings.map((h) => {
    const pct = totalValue.isZero() ? new Decimal(0) : valueOf(h).div(totalValue).mul(100);
    return {
      symbol: h.symbol,
      pctOfPortfolio: pct.toString(),
      valuationBasis: useMarketValue ? "MARKET_VALUE" : "COST_BASIS",
    };
  });
}

export function computePnl(
  transactions: Transaction[],
  holdings: Holding[],
  quotes: Map<string, Prisma.Decimal> | null = null
): PnL {
  const missing = symbolsMissingQuotes(holdings, quotes);
  const unrealized: PnL["unrealized"] =
    missing.length > 0
      ? { status: "unavailable", reason: `missing a live price for ${missing.join(", ")}` }
      : (() => {
          const totalCostValue = holdings.reduce((sum, h) => sum.add(h.costBasis.mul(h.quantity)), new Decimal(0));
          const amount = holdings.reduce(
            (sum, h) => sum.add(quotes!.get(h.symbol)!.sub(h.costBasis).mul(h.quantity)),
            new Decimal(0)
          );
          return {
            amount: amount.toString(),
            pct: totalCostValue.isZero() ? null : amount.div(totalCostValue).mul(100).toString(),
          };
        })();

  return {
    unrealized,
    realized: { amount: computeRealizedPnl(transactions).toString() },
  };
}
