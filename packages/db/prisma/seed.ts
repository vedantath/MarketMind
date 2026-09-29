import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

/**
 * Demo data for local development — gives the dashboard something to render before any real
 * market-data or ingestion pipeline exists. All records are MANUAL (see V2 brokerage-import
 * seam in root CLAUDE.md).
 */
async function main() {
  const user = await prisma.user.upsert({
    where: { email: "demo@marketmind.dev" },
    update: {},
    create: {
      email: "demo@marketmind.dev",
      // demo credentials only, never used outside local dev — see console output below
      passwordHash: await bcrypt.hash("password123", 10),
    },
  });

  const portfolio = await prisma.portfolio.upsert({
    where: { id: "demo-portfolio" },
    update: {},
    create: {
      id: "demo-portfolio",
      userId: user.id,
      name: "Demo Portfolio",
    },
  });

  const positions: Array<{ symbol: string; quantity: string; price: string }> = [
    { symbol: "AAPL", quantity: "10", price: "180.50" },
    { symbol: "MSFT", quantity: "5", price: "410.25" },
    { symbol: "NVDA", quantity: "2", price: "900.00" },
  ];

  for (const p of positions) {
    const holding = await prisma.holding.upsert({
      where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol: p.symbol } },
      update: { quantity: p.quantity, costBasis: p.price },
      create: {
        portfolioId: portfolio.id,
        symbol: p.symbol,
        quantity: p.quantity,
        costBasis: p.price,
        source: "MANUAL",
      },
    });

    await prisma.transaction.create({
      data: {
        portfolioId: portfolio.id,
        holdingId: holding.id,
        symbol: p.symbol,
        type: "BUY",
        quantity: p.quantity,
        price: p.price,
        executedAt: new Date(),
        source: "MANUAL",
      },
    });
  }

  console.log(`Seeded demo user ${user.email} (password: password123) with portfolio ${portfolio.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
