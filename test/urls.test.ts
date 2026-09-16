import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POSTMAN_REDIRECT_URIS } from "../src/types.ts";
import {
  issuerUrlForAccount,
  isAllowedRedirectUri,
  jwksUrl,
  normalizeApiUrl,
  wellKnownUrl,
} from "../src/urls.ts";

describe("urls", () => {
  it("builds the OIDC issuer and discovery URLs", () => {
    const issuer = issuerUrlForAccount("acc-123");
    assert.equal(issuer, "https://auth.akeyless.io/oidc/provider/acc-123");
    assert.equal(
      wellKnownUrl(issuer),
      "https://auth.akeyless.io/oidc/provider/acc-123/.well-known/openid-configuration",
    );
    assert.equal(
      jwksUrl(issuer),
      "https://auth.akeyless.io/oidc/provider/acc-123/.well-known/jwks.json",
    );
  });

  it("strips trailing slashes from API URLs", () => {
    assert.equal(
      normalizeApiUrl("https://gw.example.com:8000/api/v2/"),
      "https://gw.example.com:8000/api/v2",
    );
  });

  it("accepts only Postman loopback redirect URIs", () => {
    assert.equal(
      isAllowedRedirectUri("http://127.0.0.1:10545/", POSTMAN_REDIRECT_URIS),
      true,
    );
    assert.equal(
      isAllowedRedirectUri("http://127.0.0.1:10534/", POSTMAN_REDIRECT_URIS),
      true,
    );
    assert.equal(
      isAllowedRedirectUri("https://evil.example/callback", POSTMAN_REDIRECT_URIS),
      false,
    );
  });
});
