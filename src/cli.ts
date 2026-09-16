#!/usr/bin/env node
/**
 * Verifies the Akeyless-side Postman connector setup using the same OIDC
 * loopback ports the Postman desktop app uses. Never prints secret values.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { exec } from "node:child_process";
import { parseArgs } from "node:util";
import {
  authenticateWithJwt,
  buildAuthorizeRequest,
  discoverOpenId,
  exchangeAuthorizationCode,
  jwtForAkeylessAuth,
} from "./auth.js";
import { resolveLinkedSecret } from "./secrets.js";
import {
  DEFAULT_API_URL,
  DEFAULT_OIDC_SCOPE,
  POSTMAN_REDIRECT_URIS,
  type ConnectorConfig,
} from "./types.js";
import { normalizeApiUrl } from "./urls.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "api-url": { type: "string" },
      "issuer-url": { type: "string" },
      "client-id": { type: "string" },
      "jwt-access-id": { type: "string" },
      scope: { type: "string" },
      "item-path": { type: "string" },
      "secret-key": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    printHelp();
    return;
  }

  const config: ConnectorConfig = {
    apiUrl: normalizeApiUrl(
      values["api-url"] ?? process.env.AKEYLESS_API_URL ?? DEFAULT_API_URL,
    ),
    issuerUrl: required(
      values["issuer-url"] ?? process.env.AKEYLESS_OIDC_ISSUER_URL,
      "--issuer-url",
    ),
    clientId: required(
      values["client-id"] ?? process.env.AKEYLESS_OIDC_CLIENT_ID,
      "--client-id",
    ),
    jwtAccessId: required(
      values["jwt-access-id"] ?? process.env.AKEYLESS_JWT_ACCESS_ID,
      "--jwt-access-id",
    ),
    scope: values.scope ?? process.env.AKEYLESS_OIDC_SCOPE ?? DEFAULT_OIDC_SCOPE,
    redirectUri: POSTMAN_REDIRECT_URIS[0],
  };

  const itemPath =
    values["item-path"] ?? process.env.AKEYLESS_ITEM_PATH ?? "";
  const secretKey =
    values["secret-key"] ?? process.env.AKEYLESS_SECRET_KEY ?? "";

  process.stderr.write(
    "Discovering OIDC configuration and opening the Akeyless login browser...\n",
  );

  const discovery = await discoverOpenId(config.issuerUrl);
  const authorize = buildAuthorizeRequest(config, discovery);
  const code = await waitForAuthorizationCode(authorize.url, authorize.redirectUri, authorize.state);

  const tokens = await exchangeAuthorizationCode(discovery, {
    clientId: config.clientId,
    code,
    redirectUri: authorize.redirectUri,
    codeVerifier: authorize.pkce.codeVerifier,
  });

  const akeylessToken = await authenticateWithJwt(
    config.apiUrl,
    config.jwtAccessId,
    jwtForAkeylessAuth(tokens),
  );

  process.stderr.write("Authenticated with Akeyless.\n");

  if (!itemPath) {
    process.stderr.write(
      "OIDC and JWT authentication succeeded. Pass --item-path to also resolve a secret.\n",
    );
    return;
  }

  const resolved = await resolveLinkedSecret(config.apiUrl, akeylessToken, {
    itemPath,
    secretKey: secretKey || undefined,
  });

  // Never print the secret value.
  console.log(
    JSON.stringify({
      ok: true,
      itemPath: resolved.itemPath,
      itemType: resolved.itemType,
      secretKey: resolved.secretKey ?? null,
      valueLength: resolved.valueLength,
    }),
  );
}

function required(value: string | undefined, flag: string): string {
  if (!value || !value.trim()) {
    throw new Error(`Missing required ${flag}`);
  }
  return value.trim();
}

function printHelp(): void {
  console.log(`akeyless-postman-verify

Verifies the Akeyless Postman connector using the same OIDC loopback ports
as the Postman desktop app. Secret values are never printed.

Options:
  --api-url          Akeyless API URL (default: https://api.akeyless.io)
  --issuer-url       OIDC issuer URL from the setup script
  --client-id        Public OIDC App client ID
  --jwt-access-id    OAuth2/JWT authentication method Access ID
  --scope            OIDC scopes (default: openid email)
  --item-path        Optional item path to resolve after login
  --secret-key       Optional JSON key to extract
  -h, --help         Show this help
`);
}

function waitForAuthorizationCode(
  authorizeUrl: string,
  redirectUri: string,
  expectedState: string,
): Promise<string> {
  const redirect = new URL(redirectUri);
  const port = Number(redirect.port);
  const pathname = redirect.pathname || "/";

  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      try {
        const requestUrl = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
        if (requestUrl.pathname !== pathname && requestUrl.pathname !== pathname.replace(/\/$/, "")) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        const error = requestUrl.searchParams.get("error");
        if (error) {
          failPage(res, error);
          server.close();
          reject(new Error(`OIDC error: ${error}`));
          return;
        }
        const state = requestUrl.searchParams.get("state");
        const code = requestUrl.searchParams.get("code");
        if (!code || state !== expectedState) {
          failPage(res, "invalid_state");
          server.close();
          reject(new Error("OIDC callback missing code or state did not match"));
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          "<html><body><p>Akeyless authentication complete. You can close this tab and return to the terminal.</p></body></html>",
        );
        server.close();
        resolve(code);
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      openBrowser(authorizeUrl);
    });
  });
}

function failPage(res: ServerResponse, message: string): void {
  res.statusCode = 400;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(`Authentication failed: ${message}`);
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? `open ${JSON.stringify(url)}`
      : platform === "win32"
        ? `start "" ${JSON.stringify(url)}`
        : `xdg-open ${JSON.stringify(url)}`;
  exec(cmd, () => {
    process.stderr.write(`If the browser did not open, visit:\n${url}\n`);
  });
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
