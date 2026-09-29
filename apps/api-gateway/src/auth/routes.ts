import type { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { z } from "zod";
import { db } from "@marketmind/db";

const credentialsBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const BCRYPT_ROUNDS = 10;

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (request, reply) => {
    const { email, password } = credentialsBody.parse(request.body);

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ code: "EMAIL_TAKEN", message: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await db.user.create({ data: { email, passwordHash } });
    const token = app.jwt.sign({ sub: user.id, email: user.email });

    return reply.code(201).send({ token, user: { id: user.id, email: user.email } });
  });

  app.post("/auth/login", async (request, reply) => {
    const { email, password } = credentialsBody.parse(request.body);

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return reply.code(401).send({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });
    }

    // OAuth-only accounts have no password to check against — this must fail cleanly, not 500
    // or fall through to a generic error. See root CLAUDE.md "Auth model".
    if (user.passwordHash === null) {
      return reply.code(400).send({
        code: "OAUTH_ONLY_ACCOUNT",
        message: "This account uses a provider sign-in — sign in with your provider",
      });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });
    }

    const token = app.jwt.sign({ sub: user.id, email: user.email });
    return reply.send({ token, user: { id: user.id, email: user.email } });
  });

  app.get("/auth/me", { onRequest: [app.authenticate] }, async (request) => {
    return { id: request.user.sub, email: request.user.email };
  });
}
