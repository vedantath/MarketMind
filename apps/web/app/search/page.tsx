import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GatewayError, getQuote, searchAssets } from "../../lib/api";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; symbol?: string }>;
}) {
  const token = (await cookies()).get("token")?.value;
  if (!token) redirect("/login");

  const { q, symbol } = await searchParams;
  const query = q?.trim() ?? "";

  const results = query ? await searchAssets(token, query) : [];

  let quote: Awaited<ReturnType<typeof getQuote>> | null = null;
  let quoteError: string | null = null;
  if (symbol) {
    try {
      quote = await getQuote(token, symbol);
    } catch (err) {
      quoteError = err instanceof GatewayError ? err.message : "Could not load a quote";
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Search</h1>
        <a href="/dashboard" className="text-sm text-[var(--color-muted)] underline">
          Dashboard
        </a>
      </header>

      <form method="GET" className="mb-6 flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Symbol or company name"
          className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        />
        <button type="submit" className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white">
          Search
        </button>
      </form>

      {query && results.length === 0 && (
        <p className="text-sm text-[var(--color-muted)]">No tradable symbols match &ldquo;{query}&rdquo;.</p>
      )}

      {results.length > 0 && (
        <ul className="mb-8 divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
          {results.map((r) => (
            <li key={r.symbol}>
              <a
                href={`/search?q=${encodeURIComponent(query)}&symbol=${encodeURIComponent(r.symbol)}`}
                className={`flex items-center justify-between px-4 py-3 text-sm hover:bg-[var(--color-surface)] ${
                  symbol === r.symbol ? "bg-[var(--color-surface)]" : ""
                }`}
              >
                <span>
                  <span className="font-medium">{r.symbol}</span>{" "}
                  <span className="text-[var(--color-muted)]">{r.name}</span>
                </span>
                <span className="text-xs text-[var(--color-muted)]">{r.exchange}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {symbol && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs uppercase text-[var(--color-muted)]">{symbol}</p>
          {quote ? (
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{quote.price}</span>
              <span className="text-xs text-[var(--color-muted)]">as of {quote.asOf}</span>
            </div>
          ) : (
            <p className="mt-1 text-sm text-[var(--color-warn)]">{quoteError}</p>
          )}
        </div>
      )}
    </main>
  );
}
