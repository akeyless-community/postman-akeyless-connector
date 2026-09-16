import { createPkcePair, randomState, type PkcePair } from "./pkce.js";
import {
  AkeylessConnectorError,
  DEFAULT_OIDC_SCOPE,
  POSTMAN_REDIRECT_URIS,
  type AuthResponse,
  type ConnectorConfig,
  type OpenIdConfiguration,
  type TokenResponse,
} from "./types.js";
import { isAllowedRedirectUri, trimSlash, wellKnownUrl } from "./urls.js";

export interface AuthorizeRequest {
  url: string;
  state: string;
  redirectUri: string;
  pkce: PkcePair;
}

export async function discoverOpenId(
  issuerUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<OpenIdConfiguration> {
  const url = wellKnownUrl(issuerUrl);
  const res = await fetcher(url, { method: "GET" });
  if (!res.ok) {
    throw new AkeylessConnectorError(
      "oidc_discovery_failed",
      `OIDC discovery failed (${res.status})`,
      res.status,
    );
  }
  return (await res.json()) as OpenIdConfiguration;
}

export function buildAuthorizeRequest(
  config: ConnectorConfig,
  discovery: OpenIdConfiguration,
  options?: { redirectUri?: string; state?: string; pkce?: PkcePair },
): AuthorizeRequest {
  const redirectUri =
    options?.redirectUri ??
    config.redirectUri ??
    POSTMAN_REDIRECT_URIS[0];

  if (!isAllowedRedirectUri(redirectUri, POSTMAN_REDIRECT_URIS)) {
    throw new AkeylessConnectorError(
      "invalid_redirect_uri",
      `Redirect URI must be one of: ${POSTMAN_REDIRECT_URIS.join(", ")}`,
    );
  }

  const pkce = options?.pkce ?? createPkcePair();
  const state = options?.state ?? randomState();
  const scope = (config.scope ?? DEFAULT_OIDC_SCOPE).trim();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope,
    state,
    code_challenge: pkce.codeChallenge,
    code_challenge_method: pkce.codeChallengeMethod,
  });

  return {
    url: `${discovery.authorization_endpoint}?${params.toString()}`,
    state,
    redirectUri,
    pkce,
  };
}

export async function exchangeAuthorizationCode(
  discovery: OpenIdConfiguration,
  params: {
    clientId: string;
    code: string;
    redirectUri: string;
    codeVerifier: string;
  },
  fetcher: typeof fetch = fetch,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: params.clientId,
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });

  const res = await fetcher(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new AkeylessConnectorError(
      "token_exchange_failed",
      `Token exchange failed (${res.status})`,
      res.status,
    );
  }

  const tokens = (await res.json()) as TokenResponse;
  if (!tokens.access_token && !tokens.id_token) {
    throw new AkeylessConnectorError(
      "token_exchange_failed",
      "Token endpoint returned neither access_token nor id_token",
    );
  }
  return tokens;
}

/**
 * Prefer the ID token for /auth access-type=jwt so unique-identifier claims
 * (email, sub) are present. Fall back to the access token if no ID token.
 */
export function jwtForAkeylessAuth(tokens: TokenResponse): string {
  if (tokens.id_token && tokens.id_token.length > 0) {
    return tokens.id_token;
  }
  return tokens.access_token;
}

export async function authenticateWithJwt(
  apiUrl: string,
  jwtAccessId: string,
  jwt: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const res = await fetcher(`${trimSlash(apiUrl)}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      "access-id": jwtAccessId,
      "access-type": "jwt",
      jwt,
    }),
  });

  if (!res.ok) {
    throw new AkeylessConnectorError(
      "akeyless_auth_failed",
      `Akeyless JWT authentication failed (${res.status})`,
      res.status,
    );
  }

  const payload = (await res.json()) as AuthResponse & { error?: string };
  if (!payload.token) {
    throw new AkeylessConnectorError(
      "akeyless_auth_failed",
      payload.error || "Akeyless /auth did not return a token",
    );
  }
  return payload.token;
}
