import type { AllocationSlice } from "@marketmind/types";

export function AllocationList({ allocation }: { allocation: AllocationSlice[] }) {
  if (allocation.length === 0) {
    return <p className="text-sm text-[var(--color-muted)]">Nothing to allocate yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {allocation.map((slice) => (
        <li key={slice.symbol} className="flex items-center gap-3 text-sm">
          <span className="w-14 font-medium">{slice.symbol}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-border)]">
            <div
              className="h-full rounded-full bg-[var(--color-accent)]"
              style={{ width: `${Math.min(100, Number(slice.pctOfPortfolio))}%` }}
            />
          </div>
          <span className="w-14 text-right text-[var(--color-muted)]">{slice.pctOfPortfolio}%</span>
        </li>
      ))}
    </ul>
  );
}
