/**
 * Loopback redirect URIs the Postman desktop app uses for native OIDC clients.
 * Register these exactly on the Akeyless OIDC App. Do not change the ports.
 */
export const POSTMAN_REDIRECT_URIS = [
  "http://127.0.0.1:10545/",
  "http://127.0.0.1:10534/",
] as const;

export const DEFAULT_API_URL = "https://api.akeyless.io";
export const DEFAULT_AUTH_HOST = "https://auth.akeyless.io";
export const DEFAULT_OIDC_SCOPE = "openid email";
export const DEFAULT_UNIQUE_IDENTIFIER = "email";

export const ITEM_TYPE_STATIC = "STATIC_SECRET";
export const ITEM_TYPE_DYNAMIC = "DYNAMIC_SECRET";
export const ITEM_TYPE_ROTATED = "ROTATED_SECRET";

export type SecretItemType =
  | typeof ITEM_TYPE_STATIC
  | typeof ITEM_TYPE_DYNAMIC
  | typeof ITEM_TYPE_ROTATED
  | string;

export interface ConnectorConfig {
  /** Akeyless API base, e.g. https://api.akeyless.io or https://gw:8000/api/v2 */
  apiUrl: string;
  /** OIDC issuer, e.g. https://auth.akeyless.io/oidc/provider/{accountId} */
  issuerUrl: string;
  /** Public OIDC App client ID */
  clientId: string;
  /** OAuth2/JWT authentication method Access ID */
  jwtAccessId: string;
  /** Space-separated OIDC scopes. Default: openid email */
  scope?: string;
  /** Loopback redirect URI. Must be one of POSTMAN_REDIRECT_URIS. */
  redirectUri?: string;
}

export interface OpenIdConfiguration {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
  code_challenge_methods_supported?: string[];
}

export interface TokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface AuthResponse {
  token: string;
}

export interface LinkedSecret {
  /** Full Akeyless item path, e.g. /prod/api/credentials */
  itemPath: string;
  /**
   * Optional JSON object key to extract from the secret payload.
   * Leave empty to use the entire secret value as a string.
   */
  secretKey?: string;
  /** Optional static-secret version. Omit for the latest version. */
  version?: number;
}

export interface ResolvedSecret {
  itemPath: string;
  itemType: SecretItemType;
  secretKey?: string;
  /** Length of the resolved string. The value itself is never logged. */
  valueLength: number;
  value: string;
}

export interface DescribeItemResponse {
  item_name?: string;
  item_type?: string;
  item?: {
    item_name?: string;
    item_type?: string;
  };
}

export class AkeylessConnectorError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "AkeylessConnectorError";
    this.code = code;
    this.status = status;
  }
}
