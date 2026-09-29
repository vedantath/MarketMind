import type { DecimalString } from "./decimal";

export type AssetClass = "EQUITY" | "CRYPTO";

export interface AssetSymbol {
  symbol: string;
  assetClass: AssetClass;
}

/** A tradable equity as returned by stock search — see services/market-data's asset cache. */
export interface AssetSearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

export interface Quote {
  symbol: string;
  price: DecimalString;
  asOf: string; // ISO 8601
}

export interface OhlcBar {
  symbol: string;
  open: DecimalString;
  high: DecimalString;
  low: DecimalString;
  close: DecimalString;
  volume: DecimalString;
  periodStart: string; // ISO 8601
}
