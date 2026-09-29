import type { DecimalString } from "./decimal";

export type RecordSource = "MANUAL" | "IMPORTED";
export type TransactionType = "BUY" | "SELL" | "DIVIDEND" | "SPLIT" | "TRANSFER_IN" | "TRANSFER_OUT";

export interface HoldingView {
  id: string;
  symbol: string;
  quantity: DecimalString;
  costBasis: DecimalString;
  source: RecordSource;
}

/** A value that requires a data source this deployment doesn't have yet (e.g. live prices). */
export type Unavailable = { status: "unavailable"; reason: string };

export type MaybeAvailable<T> = T | Unavailable;

export interface PnL {
  unrealized: MaybeAvailable<{ amount: DecimalString; pct: DecimalString | null }>;
  realized: { amount: DecimalString };
}

export interface AllocationSlice {
  symbol: string;
  pctOfPortfolio: DecimalString;
  /**
   * MARKET_VALUE when every held symbol has a fresh quote (see services/portfolio/src/pnl),
   * COST_BASIS otherwise — never a silent mix of both. See docs/algorithms.md.
   */
  valuationBasis: "COST_BASIS" | "MARKET_VALUE";
}

export interface RiskScoreComponents {
  concentration: DecimalString;
  positionCount: DecimalString;
  volatility: MaybeAvailable<DecimalString>;
}

export interface RiskScore {
  score: DecimalString;
  components: RiskScoreComponents;
  explanation: string;
}

export interface PortfolioSummary {
  portfolioId: string;
  holdings: HoldingView[];
  pnl: PnL;
  allocation: AllocationSlice[];
  risk: RiskScore;
}
