import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Every process that imports this module (gateway, portfolio service, web) gets the repo-root
// .env loaded automatically — there's a single source of env truth, not one per workspace.
// Resolved relative to this file's own location (packages/config/src or .../dist), not the
// caller's cwd, so it works the same whether run via ts-node-dev, a built dist/, or Next.js.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// Third-party keys are optional so a freshly cloned repo with a blank .env can still boot
// the portfolio slice (gateway + portfolio service + web). Add required keys here as slices
// that actually depend on them land.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  QDRANT_URL: z.string().optional(),
  QDRANT_API_KEY: z.string().optional(),

  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  OAUTH_GOOGLE_CLIENT_ID: z.string().optional(),
  OAUTH_GOOGLE_CLIENT_SECRET: z.string().optional(),

  NEWSAPI_KEY: z.string().optional(),
  GDELT_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  ALPACA_API_KEY: z.string().optional(),
  ALPACA_SECRET_KEY: z.string().optional(),
  POLYGON_API_KEY: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),

  WEB_PORT: z.coerce.number().int().positive().default(3000),
  GATEWAY_PORT: z.coerce.number().int().positive().default(3001),
  PORTFOLIO_PORT: z.coerce.number().int().positive().default(4001),

  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  PORTFOLIO_SERVICE_URL: z.string().default("http://127.0.0.1:4001"),

  // Shared secret the gateway attaches to every request it forwards to the portfolio service,
  // and the portfolio service verifies before trusting the x-user-id header. Binding the
  // service to loopback keeps it off the network; this secret is the second layer in case that
  // binding is ever misconfigured (e.g. a container port accidentally published).
  INTERNAL_SERVICE_SECRET: z.string().min(1, "INTERNAL_SERVICE_SECRET is required"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates process.env at startup and exits the process on failure, rather than letting a
 * missing/malformed var surface later as an obscure runtime error.
 */
export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment configuration:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}
