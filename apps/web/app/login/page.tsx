export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">MarketMind</h1>
        <p className="text-sm text-[var(--color-muted)]">Sign in to your portfolio.</p>
      </div>

      {error && (
        <p className="rounded-md border border-[var(--color-warn)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-warn)]">
          {error}
        </p>
      )}

      <form action="/api/login" method="POST" className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            name="email"
            required
            defaultValue="demo@marketmind.dev"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            name="password"
            required
            minLength={8}
            defaultValue="password123"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text)]"
          />
        </label>
        <button
          type="submit"
          className="mt-2 rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white"
        >
          Sign in
        </button>
      </form>
      <p className="text-xs text-[var(--color-muted)]">
        Seeded demo account: demo@marketmind.dev / password123
      </p>
    </main>
  );
}
