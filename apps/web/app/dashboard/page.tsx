import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPortfolioSummary, listPortfolios } from "../../lib/api";
import { RiskCard } from "./risk-card";
import { HoldingsTable } from "./holdings-table";
import { AllocationList } from "./allocation-list";

export default async function DashboardPage() {
  const token = (await cookies()).get("token")?.value;
  if (!token) redirect("/login");

  const portfolios = await listPortfolios(token);

  if (portfolios.length === 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
        <h1 className="text-xl font-semibold">No portfolios yet</h1>
        <form action="/api/portfolios" method="POST" className="flex flex-col gap-3">
          <input
            name="name"
            placeholder="Portfolio name"
            required
            defaultValue="My Portfolio"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
          />
          <button type="submit" className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white">
            Create portfolio
          </button>
        </form>
      </main>
    );
  }

  const summary = await getPortfolioSummary(token, portfolios[0].id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{portfolios[0].name}</h1>
        <form action="/api/logout" method="POST">
          <button type="submit" className="text-sm text-[var(--color-muted)] underline">
            Sign out
          </button>
        </form>
      </header>

      <section className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs uppercase text-[var(--color-muted)]">Realized PnL</p>
          <p className="text-2xl font-semibold">{summary.pnl.realized.amount}</p>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs uppercase text-[var(--color-muted)]">Unrealized PnL</p>
          {"status" in summary.pnl.unrealized ? (
            <p className="text-sm text-[var(--color-warn)]">Unavailable — {summary.pnl.unrealized.reason}</p>
          ) : (
            <p className="text-2xl font-semibold">{summary.pnl.unrealized.amount}</p>
          )}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-[var(--color-muted)]">Holdings</h2>
        <HoldingsTable holdings={summary.holdings} />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-[var(--color-muted)]">
          Allocation <span className="text-xs">(cost-basis weighted, not live market value)</span>
        </h2>
        <AllocationList allocation={summary.allocation} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-[var(--color-muted)]">Risk</h2>
        <RiskCard risk={summary.risk} />
      </section>
    </main>
  );
}
