import { describe, expect, it } from "vitest";
import { mapTrade, mapBars, mapAsset } from "./alpaca";

describe("mapTrade", () => {
  it("maps an Alpaca latest-trade response to a Quote, price as a decimal string", () => {
    const quote = mapTrade({
      symbol: "AAPL",
      trade: { p: 171.29, t: "2023-09-29T19:59:59.246196362Z" },
    });
    expect(quote).toEqual({
      symbol: "AAPL",
      price: "171.29",
      asOf: "2023-09-29T19:59:59.246196362Z",
    });
  });

  it("throws a clear error rather than crashing when Alpaca returns no trade", () => {
    expect(() => mapTrade({ symbol: "AAPL", trade: null })).toThrow(/no trade for AAPL/);
  });
});

describe("mapBars", () => {
  it("maps an Alpaca bars response to OhlcBar[], all numeric fields as decimal strings", () => {
    const bars = mapBars({
      symbol: "AAPL",
      bars: [
        { t: "2023-09-29T04:00:00Z", o: 172.015, h: 173.06, l: 170.36, c: 171.29, v: 923134 },
      ],
    });
    expect(bars).toEqual([
      {
        symbol: "AAPL",
        open: "172.015",
        high: "173.06",
        low: "170.36",
        close: "171.29",
        volume: "923134",
        periodStart: "2023-09-29T04:00:00Z",
      },
    ]);
  });

  it("maps an empty bars array to an empty list", () => {
    expect(mapBars({ symbol: "AAPL", bars: [] })).toEqual([]);
  });

  it("maps Alpaca's bars: null (no start param, or no data in range) to an empty list", () => {
    expect(mapBars({ symbol: "AAPL", bars: null })).toEqual([]);
  });
});

describe("mapAsset", () => {
  it("keeps only symbol, name, and exchange — drops margin/id/attribute fields", () => {
    const asset = mapAsset({
      symbol: "AAPL",
      name: "Apple Inc. Common Stock",
      exchange: "NASDAQ",
      tradable: true,
    });
    expect(asset).toEqual({
      symbol: "AAPL",
      name: "Apple Inc. Common Stock",
      exchange: "NASDAQ",
    });
  });
});
