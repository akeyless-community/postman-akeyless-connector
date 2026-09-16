import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveLinkedSecret } from "../src/secrets.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("resolveLinkedSecret", () => {
  it("describes a static secret, fetches it, and extracts a JSON key", async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      const body = JSON.parse(String(init?.body));
      assert.equal(body.token, "t-session");
      if (url.endsWith("/describe-item")) {
        assert.equal(body.name, "/prod/api");
        return jsonResponse({ item_type: "STATIC_SECRET", item_name: "/prod/api" });
      }
      if (url.endsWith("/get-secret-value")) {
        assert.deepEqual(body.names, ["/prod/api"]);
        return jsonResponse({
          "/prod/api": { username: "svc", password: "hidden" },
        });
      }
      throw new Error(`unexpected url ${url}`);
    };

    const resolved = await resolveLinkedSecret(
      "https://api.akeyless.io",
      "t-session",
      { itemPath: "/prod/api", secretKey: "password" },
      fetcher,
    );

    assert.deepEqual(calls, [
      "https://api.akeyless.io/describe-item",
      "https://api.akeyless.io/get-secret-value",
    ]);
    assert.equal(resolved.itemType, "STATIC_SECRET");
    assert.equal(resolved.value, "hidden");
    assert.equal(resolved.valueLength, 6);
  });

  it("fetches dynamic secrets from dynamic-secret-get-value", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/describe-item")) {
        return jsonResponse({ item_type: "DYNAMIC_SECRET" });
      }
      if (url.endsWith("/dynamic-secret-get-value")) {
        return jsonResponse({
          access_key_id: "AKIA",
          secret_access_key: "wJalr",
        });
      }
      throw new Error(`unexpected url ${url}`);
    };

    const resolved = await resolveLinkedSecret(
      "https://api.akeyless.io",
      "t-session",
      { itemPath: "/prod/aws", secretKey: "access_key_id" },
      fetcher,
    );
    assert.equal(resolved.itemType, "DYNAMIC_SECRET");
    assert.equal(resolved.value, "AKIA");
  });

  it("fetches rotated secrets from get-rotated-secret-value", async () => {
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/describe-item")) {
        return jsonResponse({ item_type: "ROTATED_SECRET" });
      }
      if (url.endsWith("/get-rotated-secret-value")) {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.names, "/prod/db");
        return jsonResponse({ username: "rot", password: "pw" });
      }
      throw new Error(`unexpected url ${url}`);
    };

    const resolved = await resolveLinkedSecret(
      "https://api.akeyless.io",
      "t-session",
      { itemPath: "/prod/db", secretKey: "username" },
      fetcher,
    );
    assert.equal(resolved.value, "rot");
  });

  it("rejects relative item paths", async () => {
    await assert.rejects(
      () =>
        resolveLinkedSecret("https://api.akeyless.io", "t-session", {
          itemPath: "prod/api",
        }),
      /absolute Akeyless path/,
    );
  });

  it("rejects unsupported item types", async () => {
    const fetcher: typeof fetch = async () =>
      jsonResponse({ item_type: "ENCRYPTION_KEY" });
    await assert.rejects(
      () =>
        resolveLinkedSecret(
          "https://api.akeyless.io",
          "t-session",
          { itemPath: "/keys/k1" },
          fetcher,
        ),
      /Unsupported item type/,
    );
  });
});
