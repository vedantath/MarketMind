import type { HoldingView } from "@marketmind/types";

export function HoldingsTable({ holdings }: { holdings: HoldingView[] }) {
  if (holdings.length === 0) {
    return <p className="text-sm text-[var(--color-muted)]">No holdings recorded yet.</p>;
  }

  return (
    <table className="w-full text-left text-sm">
      <thead className="text-[var(--color-muted)]">
        <tr>
          <th className="pb-2">Symbol</th>
          <th className="pb-2">Quantity</th>
          <th className="pb-2">Cost basis</th>
          <th className="pb-2">Source</th>
        </tr>
      </thead>
      <tbody>
        {holdings.map((h) => (
          <tr key={h.id} className="border-t border-[var(--color-border)]">
            <td className="py-2 font-medium">{h.symbol}</td>
            <td className="py-2">{h.quantity}</td>
            <td className="py-2">{h.costBasis}</td>
            <td className="py-2 text-[var(--color-muted)]">{h.source}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
