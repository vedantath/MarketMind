import type { RiskScore } from "@marketmind/types";

/**
 * Renders the explainability rule, not just the score: the component breakdown and the
 * plain-language explanation are always visible here, and an unavailable component says so
 * instead of being hidden or defaulted to a number. See root CLAUDE.md "Hard rule".
 */
export function RiskCard({ risk }: { risk: RiskScore }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-3xl font-semibold">{Number(risk.score).toFixed(2)}</span>
        <span className="text-xs text-[var(--color-muted)]">risk score (0 = low, 1 = high)</span>
      </div>

      <dl className="mb-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Concentration</dt>
          <dd>{Number(risk.components.concentration).toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Position count</dt>
          <dd>{Number(risk.components.positionCount).toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Volatility</dt>
          {typeof risk.components.volatility === "object" ? (
            <dd className="text-[var(--color-warn)]">
              Unavailable — {risk.components.volatility.reason}
            </dd>
          ) : (
            <dd>{Number(risk.components.volatility).toFixed(2)}</dd>
          )}
        </div>
      </dl>

      <p className="text-sm text-[var(--color-text)]">{risk.explanation}</p>
    </div>
  );
}
