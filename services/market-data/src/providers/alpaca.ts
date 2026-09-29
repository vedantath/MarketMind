import type { Quote, OhlcBar, AssetSearchResult } from "@marketmind/types";

export interface AlpacaCredentials {
  dataUrl: string;
  tradingUrl: string;
  apiKey: string;
  secretKey: string;
}

interface AlpacaTradeResponse {
  symbol: string;
  trade: { p: number; t: string } | null;
}

interface AlpacaBarsResponse {
  symbol: string;
  bars: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }> | null;
}

interface AlpacaAsset {
  symbol: string;
  name: string;
  exchange: string;
  tradable: boolean;
}

export function authHeaders(creds: AlpacaCredentials): Record<string, string> {
  return {
    "APCA-API-KEY-ID": creds.apiKey,
    "APCA-API-SECRET-KEY": creds.secretKey,
  };
}

/** Pure mapper, tested against fixture JSON — no network in unit tests. */
export function mapTrade(response: AlpacaTradeResponse): Quote {
  if (!response.trade) {
    throw new Error(`Alpaca returned no trade for ${response.symbol} (market may be closed)`);
  }
  return {
    symbol: response.symbol,
    price: response.trade.p.toString(),
    asOf: response.trade.t,
  };
}

/**
 * Pure mapper, tested against fixture JSON — no network in unit tests. `bars` comes back `null`
 * (not `[]`) when the request has no `start` param or the range has no data — never assume it's
 * an array.
 */
export function mapBars(response: AlpacaBarsResponse): OhlcBar[] {
  if (!response.bars) return [];
  return response.bars.map((bar) => ({
    symbol: response.symbol,
    open: bar.o.toString(),
    high: bar.h.toString(),
    low: bar.l.toString(),
    close: bar.c.toString(),
    volume: bar.v.toString(),
    periodStart: bar.t,
  }));
}

/**
 * Latest trade price for a symbol. Free tier is IEX-feed only — feed=sip 403s without a paid
 * subscription, so this always requests feed=iex.
 */
export async function getLatestTrade(creds: AlpacaCredentials, symbol: string): Promise<Quote> {
  const url = `${creds.dataUrl}/v2/stocks/${symbol}/trades/latest?feed=iex`;
  const response = await fetch(url, { headers: authHeaders(creds) });
  if (!response.ok) {
    throw new Error(`Alpaca latest trade for ${symbol} failed: ${response.status} ${response.statusText}`);
  }
  return mapTrade((await response.json()) as AlpacaTradeResponse);
}

/**
 * Recent daily bars for a symbol, most-recent-last as returned by Alpaca. Alpaca's `/bars`
 * endpoint returns `bars: null` without an explicit `start` — it does not default to "recent" on
 * its own. `limit` daily (trading-day) bars need roughly `limit * 1.6` calendar days of range to
 * absorb weekends/holidays; a little slack costs nothing since `limit` still caps the result.
 */
export async function getRecentDailyBars(
  creds: AlpacaCredentials,
  symbol: string,
  limit: number
): Promise<OhlcBar[]> {
  const start = new Date(Date.now() - Math.ceil(limit * 1.6) * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const url = `${creds.dataUrl}/v2/stocks/${symbol}/bars?feed=iex&timeframe=1Day&start=${start}&limit=${limit}`;
  const response = await fetch(url, { headers: authHeaders(creds) });
  if (!response.ok) {
    throw new Error(`Alpaca bars for ${symbol} failed: ${response.status} ${response.statusText}`);
  }
  return mapBars((await response.json()) as AlpacaBarsResponse);
}

/** Pure mapper, tested against fixture JSON — no network in unit tests. */
export function mapAsset(asset: AlpacaAsset): AssetSearchResult {
  return { symbol: asset.symbol, name: asset.name, exchange: asset.exchange };
}

/**
 * The full list of tradable US equities — Alpaca's /v2/assets has no free-text search param and
 * returns everything in one call, so search itself happens in-memory against a cached copy of
 * this list (see src/routes/market.ts), not as a live call per keystroke. Read-only use of the
 * Trading API — never used to place orders (that's V2 brokerage territory).
 */
export async function getTradableUsEquities(creds: AlpacaCredentials): Promise<AssetSearchResult[]> {
  const url = `${creds.tradingUrl}/assets?status=active&asset_class=us_equity`;
  const response = await fetch(url, { headers: authHeaders(creds) });
  if (!response.ok) {
    throw new Error(`Alpaca assets list failed: ${response.status} ${response.statusText}`);
  }
  const assets = (await response.json()) as AlpacaAsset[];
  return assets.filter((a) => a.tradable).map(mapAsset);
}
