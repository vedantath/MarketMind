import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "@marketmind/db";
import type { PortfolioSummary } from "@marketmind/types";
import {
  InsufficientQuantityError,
  listPortfolioHoldings,
  listPortfolioTransactions,
  recordTransaction,
} from "../holdings/repository";
import { computeAllocation, computePnl } from "../pnl/index";
import { computeRiskScore } from "../risk/index";
import { getClosesForSymbols, getQuotesForSymbols } from "../pricing/quotes";

/**
 * Every route trusts `x-user-id` as already-verified identity. That's only safe because this
 * service binds to loopback AND every request is required to carry `x-internal-secret` (checked
 * in src/index.ts before any route handler runs) — two independent layers, not one. See the
 * Trust boundary section in docs/api.md before changing either.
 */
function requireUserId(request: { headers: Record<string, unknown> }): string {
  const userId = request.headers["x-user-id"];
  if (typeof userId !== "string" || userId.length === 0) {
    throw Object.assign(new Error("Missing x-user-id"), { statusCode: 401 });
  }
  return userId;
}

async function loadOwnedPortfolio(portfolioId: string, userId: string) {
  const portfolio = await db.portfolio.findUnique({ where: { id: portfolioId } });
  if (!portfolio || portfolio.userId !== userId) return null; // 404, not 403 — don't leak existence
  return portfolio;
}

const createPortfolioBody = z.object({ name: z.string().min(1) });

const createTransactionBody = z.object({
  symbol: z.string().min(1),
  type: z.enum(["BUY", "SELL"]),
  quantity: z.string().regex(/^\d+(\.\d+)?$/, "must be a positive decimal string"),
  price: z.string().regex(/^\d+(\.\d+)?$/, "must be a positive decimal string"),
  fees: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  executedAt: z.string().datetime().optional(),
});

export async function portfolioRoutes(app: FastifyInstance) {
  app.post("/portfolios", async (request, reply) => {
    const userId = requireUserId(request);
    const body = createPortfolioBody.parse(request.body);
    const portfolio = await db.portfolio.create({ data: { userId, name: body.name } });
    return reply.code(201).send(portfolio);
  });

  app.get("/portfolios", async (request) => {
    const userId = requireUserId(request);
    return db.portfolio.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  });

  app.get<{ Params: { id: string } }>("/portfolios/:id/holdings", async (request, reply) => {
    const userId = requireUserId(request);
    const portfolio = await loadOwnedPortfolio(request.params.id, userId);
    if (!portfolio) return reply.code(404).send({ code: "NOT_FOUND", message: "Portfolio not found" });
    return listPortfolioHoldings(portfolio.id);
  });

  app.get<{ Params: { id: string } }>("/portfolios/:id/transactions", async (request, reply) => {
    const userId = requireUserId(request);
    const portfolio = await loadOwnedPortfolio(request.params.id, userId);
    if (!portfolio) return reply.code(404).send({ code: "NOT_FOUND", message: "Portfolio not found" });
    return listPortfolioTransactions(portfolio.id);
  });

  app.post<{ Params: { id: string } }>("/portfolios/:id/transactions", async (request, reply) => {
    const userId = requireUserId(request);
    const portfolio = await loadOwnedPortfolio(request.params.id, userId);
    if (!portfolio) return reply.code(404).send({ code: "NOT_FOUND", message: "Portfolio not found" });

    const body = createTransactionBody.parse(request.body);
    try {
      const transaction = await recordTransaction({
        portfolioId: portfolio.id,
        symbol: body.symbol.toUpperCase(),
        type: body.type,
        quantity: body.quantity,
        price: body.price,
        ...(body.fees ? { fees: body.fees } : {}),
        executedAt: body.executedAt ? new Date(body.executedAt) : new Date(),
      });
      return reply.code(201).send(transaction);
    } catch (err) {
      if (err instanceof InsufficientQuantityError) {
        return reply.code(400).send({ code: "INSUFFICIENT_QUANTITY", message: err.message });
      }
      throw err;
    }
  });

  app.get<{ Params: { id: string } }>("/portfolios/:id/summary", async (request, reply) => {
    const userId = requireUserId(request);
    const portfolio = await loadOwnedPortfolio(request.params.id, userId);
    if (!portfolio) return reply.code(404).send({ code: "NOT_FOUND", message: "Portfolio not found" });

    const [holdings, transactions] = await Promise.all([
      listPortfolioHoldings(portfolio.id),
      listPortfolioTransactions(portfolio.id),
    ]);

    const symbols = [...new Set(holdings.map((h) => h.symbol))];
    const [quotes, closes] = await Promise.all([
      getQuotesForSymbols(symbols),
      getClosesForSymbols(symbols),
    ]);

    const summary: PortfolioSummary = {
      portfolioId: portfolio.id,
      holdings: holdings.map((h) => ({
        id: h.id,
        symbol: h.symbol,
        quantity: h.quantity.toString(),
        costBasis: h.costBasis.toString(),
        source: h.source,
      })),
      pnl: computePnl(transactions, holdings, quotes),
      allocation: computeAllocation(holdings, quotes),
      risk: computeRiskScore(holdings, closes),
    };

    return summary;
  });
}
