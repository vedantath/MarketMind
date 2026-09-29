import { z } from "zod";

/**
 * The one shape for a "market event" across the system — news-intelligence and market-data
 * produce these, ai-orchestration and alerts consume them. Defined with zod so the same
 * artifact validates at runtime (on the queue) and types at compile time (via z.infer).
 * Do not redefine this shape locally in a service — import it from here.
 */
export const MarketEventType = z.enum(["NEWS", "PRICE_MOVE", "SENTIMENT_SHIFT"]);
export type MarketEventType = z.infer<typeof MarketEventType>;

export const ConfidenceLevel = z.enum(["LOW", "MEDIUM", "HIGH"]);

/**
 * Component values behind an impact score, persisted alongside the score itself so
 * ai-orchestration can explain *why* an event scored the way it did, not just cite the number.
 * Formula: Impact = sentiment * sourceWeight * mentionFrequency * marketSensitivity (see
 * docs/algorithms.md).
 */
export const ImpactComponents = z.object({
  sentiment: z.number(),
  sourceWeight: z.number(),
  mentionFrequency: z.number(),
  marketSensitivity: z.number(),
  score: z.number().min(0).max(1),
});
export type ImpactComponents = z.infer<typeof ImpactComponents>;

export const MarketEvent = z.object({
  id: z.string(),
  type: MarketEventType,
  symbols: z.array(z.string()).min(1),
  occurredAt: z.string().datetime(),
  source: z.string(),
  title: z.string(),
  summary: z.string(),
  /** Present when this event was deduped/merged from multiple syndicated stories. */
  clusterId: z.string().optional(),
  confidence: z.object({
    level: ConfidenceLevel,
    rationale: z.string(),
  }),
  impact: ImpactComponents,
});
export type MarketEvent = z.infer<typeof MarketEvent>;
