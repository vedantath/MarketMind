import { db, Prisma } from "@marketmind/db";
import type { Holding, Transaction } from "@marketmind/db";

export class InsufficientQuantityError extends Error {
  constructor(symbol: string) {
    super(`Cannot sell more ${symbol} than is currently held`);
  }
}

export function listPortfolioHoldings(portfolioId: string): Promise<Holding[]> {
  return db.holding.findMany({ where: { portfolioId }, orderBy: { symbol: "asc" } });
}

export function listPortfolioTransactions(portfolioId: string): Promise<Transaction[]> {
  return db.transaction.findMany({ where: { portfolioId }, orderBy: { executedAt: "asc" } });
}

/**
 * BUY/SELL are the only transaction types MVP portfolio tracking supports end-to-end — DIVIDEND,
 * SPLIT, and TRANSFER_* exist in the schema for future use but aren't wired into cost-basis
 * math yet. See docs/algorithms.md for the weighted-average cost-basis formula.
 */
export type RecordableTransactionType = "BUY" | "SELL";

export interface RecordTransactionInput {
  portfolioId: string;
  symbol: string;
  type: RecordableTransactionType;
  quantity: string;
  price: string;
  fees?: string;
  executedAt: Date;
}

/**
 * Appends a ledger row and updates the aggregated Holding to match. Transactions are never
 * updated or deleted — this is the only write path into the ledger.
 */
export async function recordTransaction(input: RecordTransactionInput): Promise<Transaction> {
  const qty = new Prisma.Decimal(input.quantity);
  const price = new Prisma.Decimal(input.price);

  return db.$transaction(async (tx) => {
    const existing = await tx.holding.findUnique({
      where: { portfolioId_symbol: { portfolioId: input.portfolioId, symbol: input.symbol } },
    });

    let holdingId: string;

    if (input.type === "BUY") {
      if (existing) {
        const totalCost = existing.quantity.mul(existing.costBasis).add(qty.mul(price));
        const newQuantity = existing.quantity.add(qty);
        const newCostBasis = totalCost.div(newQuantity);
        const updated = await tx.holding.update({
          where: { id: existing.id },
          data: { quantity: newQuantity, costBasis: newCostBasis },
        });
        holdingId = updated.id;
      } else {
        const created = await tx.holding.create({
          data: {
            portfolioId: input.portfolioId,
            symbol: input.symbol,
            quantity: qty,
            costBasis: price,
            source: "MANUAL",
          },
        });
        holdingId = created.id;
      }
    } else {
      // SELL — cost basis is unchanged (weighted-average, not lot-selection); only quantity drops.
      if (!existing || existing.quantity.lt(qty)) {
        throw new InsufficientQuantityError(input.symbol);
      }
      const updated = await tx.holding.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity.sub(qty) },
      });
      holdingId = updated.id;
    }

    return tx.transaction.create({
      data: {
        portfolioId: input.portfolioId,
        holdingId,
        symbol: input.symbol,
        type: input.type,
        quantity: qty,
        price,
        ...(input.fees ? { fees: new Prisma.Decimal(input.fees) } : {}),
        executedAt: input.executedAt,
        source: "MANUAL",
      },
    });
  });
}
