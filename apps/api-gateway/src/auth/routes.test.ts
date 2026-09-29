import Fastify from "fastify";
import jwt from "@fastify/jwt";
import bcrypt from "bcrypt";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authRoutes } from "./routes";
import authenticatePlugin from "./authenticate";

const mockDb = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@marketmind/db", () => ({ db: mockDb }));

async function buildApp() {
  const app = Fastify();
  await app.register(jwt, { secret: "test-secret" });
  await app.register(authenticatePlugin);
  await app.register(authRoutes);
  return app;
}

describe("POST /auth/login", () => {
  beforeEach(() => {
    mockDb.user.findUnique.mockReset();
  });

  it("returns a clean 400 for a password login against an OAuth-only account", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "oauth@example.com",
      passwordHash: null,
    });

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "oauth@example.com", password: "whatever123" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("OAUTH_ONLY_ACCOUNT");
  });

  it("returns 401 for an unknown email without revealing whether the account exists", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "nobody@example.com", password: "whatever123" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("INVALID_CREDENTIALS");
  });

  it("logs in successfully for a valid native-auth account", async () => {
    const passwordHash = await bcrypt.hash("correct-password", 10);
    mockDb.user.findUnique.mockResolvedValue({
      id: "u2",
      email: "native@example.com",
      passwordHash,
    });

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "native@example.com", password: "correct-password" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().token).toBeTypeOf("string");
  });
});
