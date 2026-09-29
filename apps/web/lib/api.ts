import "server-only";
import type { PortfolioSummary } from "@marketmind/types";
import { gatewayUrl } from "./gateway-url";

export class GatewayError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function gatewayFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${gatewayUrl()}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new GatewayError(response.status, body.message ?? "Request to api-gateway failed");
  }

  return response.json() as Promise<T>;
}

export interface PortfolioListItem {
  id: string;
  name: string;
}

export function listPortfolios(token: string): Promise<PortfolioListItem[]> {
  return gatewayFetch("/api/portfolio/portfolios", token);
}

export function createPortfolio(token: string, name: string): Promise<PortfolioListItem> {
  return gatewayFetch("/api/portfolio/portfolios", token, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function getPortfolioSummary(token: string, portfolioId: string): Promise<PortfolioSummary> {
  return gatewayFetch(`/api/portfolio/portfolios/${portfolioId}/summary`, token);
}

export interface LoginResult {
  token: string;
  user: { id: string; email: string };
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const response = await fetch(`${gatewayUrl()}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok) {
    throw new GatewayError(response.status, body.message ?? "Login failed");
  }
  return body;
}
