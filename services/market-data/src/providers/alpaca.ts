import type { Quote, OhlcBar } from "@marketmind/types";

export interface AlpacaCredentials {
  dataUrl: string;
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

function authHeaders(creds: AlpacaCredentials): Record<string, string> {
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
