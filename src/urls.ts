import { DEFAULT_API_URL, DEFAULT_AUTH_HOST } from "./types.js";

export function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function normalizeApiUrl(apiUrl: string | undefined): string {
  const raw = (apiUrl ?? DEFAULT_API_URL).trim();
  if (!raw) {
    return DEFAULT_API_URL;
  }
  return trimSlash(raw);
}

export function issuerUrlForAccount(
  accountId: string,
  authHost: string = DEFAULT_AUTH_HOST,
): string {
  const id = accountId.trim();
  if (!id) {
    throw new Error("accountId is required");
  }
  return `${trimSlash(authHost)}/oidc/provider/${encodeURIComponent(id)}`;
}

export function wellKnownUrl(issuerUrl: string): string {
  return `${trimSlash(issuerUrl)}/.well-known/openid-configuration`;
}

export function jwksUrl(issuerUrl: string): string {
  return `${trimSlash(issuerUrl)}/.well-known/jwks.json`;
}

export function isAllowedRedirectUri(
  redirectUri: string,
  allowed: readonly string[],
): boolean {
  return allowed.includes(redirectUri);
}
