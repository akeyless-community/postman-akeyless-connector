import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  authenticateWithJwt,
  buildAuthorizeRequest,
  discoverOpenId,
  exchangeAuthorizationCode,
  jwtForAkeylessAuth,
} from "../src/auth.ts";
import { POSTMAN_REDIRECT_URIS, type ConnectorConfig, type OpenIdConfiguration } from "../src/types.ts";

const discovery: OpenIdConfiguration = {
  issuer: "https://auth.akeyless.io/oidc/provider/acc-1",
  authorization_endpoint:
    "https://auth.akeyless.io/oidc/provider/acc-1/oauth2/auth",
  token_endpoint: "https://auth.akeyless.io/oidc/provider/acc-1/oauth2/token",
  jwks_uri: "https://auth.akeyless.io/oidc/provider/acc-1/.well-known/jwks.json",
  code_challenge_methods_supported: ["S256"],
};

const config: ConnectorConfig = {
  apiUrl: "https://api.akeyless.io",
  issuerUrl: discovery.issuer,
  clientId: "c-public",
  jwtAccessId: "p-jwt",
};

describe("auth", () => {
  it("builds an authorization-code + PKCE URL", () => {
    const req = buildAuthorizeRequest(config, discovery);
    const url = new URL(req.url);
    assert.equal(url.origin + url.pathname, discovery.authorization_endpoint);
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("client_id"), "c-public");
    assert.equal(url.searchParams.get("redirect_uri"), POSTMAN_REDIRECT_URIS[0]);
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.ok(url.searchParams.get("code_challenge"));
    assert.ok(url.searchParams.get("state"));
  });

  it("rejects a non-Postman redirect URI", () => {
    assert.throws(
      () =>
        buildAuthorizeRequest(config, discovery, {
          redirectUri: "https://evil.example/cb",
        }),
      /Redirect URI must be one of/,
    );
  });

  it("prefers the ID token for Akeyless JWT auth", () => {
    assert.equal(
      jwtForAkeylessAuth({
        access_token: "access",
        id_token: "id.jwt",
        token_type: "bearer",
        expires_in: 3600,
      }),
      "id.jwt",
    );
  });

  it("discovers OIDC metadata", async () => {
    const fetcher: typeof fetch = async (input) => {
      assert.equal(
        String(input),
        "https://auth.akeyless.io/oidc/provider/acc-1/.well-known/openid-configuration",
      );
      return new Response(JSON.stringify(discovery), { status: 200 });
    };
    const found = await discoverOpenId(discovery.issuer, fetcher);
    assert.equal(found.token_endpoint, discovery.token_endpoint);
  });

  it("exchanges an authorization code without a client secret", async () => {
    const fetcher: typeof fetch = async (_input, init) => {
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get("grant_type"), "authorization_code");
      assert.equal(body.get("client_id"), "c-public");
      assert.equal(body.get("code"), "auth-code");
      assert.equal(body.get("code_verifier"), "verifier");
      assert.equal(body.get("client_secret"), null);
      return new Response(
        JSON.stringify({
          access_token: "at",
          id_token: "id",
          token_type: "bearer",
          expires_in: 3600,
        }),
        { status: 200 },
      );
    };

    const tokens = await exchangeAuthorizationCode(
      discovery,
      {
        clientId: "c-public",
        code: "auth-code",
        redirectUri: POSTMAN_REDIRECT_URIS[0],
        codeVerifier: "verifier",
      },
      fetcher,
    );
    assert.equal(tokens.id_token, "id");
  });

  it("authenticates to Akeyless with access-type jwt", async () => {
    const fetcher: typeof fetch = async (input, init) => {
      assert.equal(String(input), "https://api.akeyless.io/auth");
      const body = JSON.parse(String(init?.body));
      assert.equal(body["access-type"], "jwt");
      assert.equal(body["access-id"], "p-jwt");
      assert.equal(body.jwt, "id.jwt");
      return new Response(JSON.stringify({ token: "t-session" }), {
        status: 200,
      });
    };
    const token = await authenticateWithJwt(
      "https://api.akeyless.io",
      "p-jwt",
      "id.jwt",
      fetcher,
    );
    assert.equal(token, "t-session");
  });
});
