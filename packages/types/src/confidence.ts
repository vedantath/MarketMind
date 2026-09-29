/**
 * Carried by any output that involves inference or an incomplete data source, so the response
 * layer (and the UI) can surface uncertainty instead of presenting a number as more certain than
 * it is. Lives here, not in ai-orchestration, because portfolio risk scoring needs it too.
 */
export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

export interface Confidence {
  level: ConfidenceLevel;
  rationale: string;
}
