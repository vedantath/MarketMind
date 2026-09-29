import Redis from "ioredis";
import { MarketEvent } from "./market-event";

export const CHANNELS = {
  MARKET_EVENTS: "marketmind:market-events",
} as const;

export function publishEvent(redis: Redis, event: MarketEvent): Promise<number> {
  const parsed = MarketEvent.parse(event); // throws on a shape that violates the contract
  return redis.publish(CHANNELS.MARKET_EVENTS, JSON.stringify(parsed));
}

/**
 * Subscribes to the market-events channel and validates every incoming payload against the
 * contract before invoking the handler — a malformed message from a misbehaving producer is
 * dropped (with a warning), never passed downstream.
 */
export function subscribeEvents(redis: Redis, handler: (event: MarketEvent) => void): void {
  redis.subscribe(CHANNELS.MARKET_EVENTS);
  redis.on("message", (channel, raw) => {
    if (channel !== CHANNELS.MARKET_EVENTS) return;
    const result = MarketEvent.safeParse(JSON.parse(raw));
    if (!result.success) {
      console.warn("Dropped malformed market event:", result.error.message);
      return;
    }
    handler(result.data);
  });
}
