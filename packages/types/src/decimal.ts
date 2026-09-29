/**
 * Money and quantity values cross service boundaries as strings, never `number`.
 * Postgres stores them as `Decimal(20,8)` (see packages/db/prisma/schema.prisma); round-tripping
 * through a JSON `number` would silently reintroduce float rounding error on financial data —
 * exactly the bug the DB schema exists to prevent. Every service must serialize with
 * `Prisma.Decimal#toString()` and never `parseFloat`/`Number()` a value meant for arithmetic.
 */
export type DecimalString = string;
