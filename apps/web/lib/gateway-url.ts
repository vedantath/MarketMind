import "@marketmind/config"; // side effect: loads the repo-root .env into process.env

/** Server-only: the api-gateway base URL, derived from the shared root .env. */
export function gatewayUrl(): string {
  const port = process.env.GATEWAY_PORT ?? "3001";
  return `http://localhost:${port}`;
}
