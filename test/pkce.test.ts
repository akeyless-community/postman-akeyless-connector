import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHash } from "node:crypto";
import { base64Url, createPkcePair } from "../src/pkce.ts";

describe("pkce", () => {
  it("creates an S256 challenge that matches the verifier", () => {
    const pair = createPkcePair();
    assert.equal(pair.codeChallengeMethod, "S256");
    assert.match(pair.codeVerifier, /^[A-Za-z0-9_-]+$/);
    const expected = base64Url(
      createHash("sha256").update(pair.codeVerifier).digest(),
    );
    assert.equal(pair.codeChallenge, expected);
  });
});
