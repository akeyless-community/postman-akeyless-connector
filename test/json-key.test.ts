import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractSecretField } from "../src/json-key.ts";

describe("extractSecretField", () => {
  it("returns the full string when no key is provided", () => {
    assert.equal(extractSecretField("plain-secret"), "plain-secret");
  });

  it("stringifies objects when no key is provided", () => {
    assert.equal(
      extractSecretField({ username: "ada", password: "x" }),
      JSON.stringify({ username: "ada", password: "x" }),
    );
  });

  it("extracts a top-level JSON key from an object", () => {
    assert.equal(
      extractSecretField({ username: "ada", password: "s3cret" }, "password"),
      "s3cret",
    );
  });

  it("extracts a top-level JSON key from a JSON string", () => {
    assert.equal(
      extractSecretField('{"api_key":"k-1","region":"us"}', "api_key"),
      "k-1",
    );
  });

  it("extracts a dotted nested key", () => {
    assert.equal(
      extractSecretField({ data: { token: "abc" } }, "data.token"),
      "abc",
    );
  });

  it("throws when the key is missing", () => {
    assert.throws(
      () => extractSecretField({ username: "ada" }, "password"),
      /was not found/,
    );
  });

  it("throws when asking for a key on a non-object secret", () => {
    assert.throws(
      () => extractSecretField("not-json", "password"),
      /not a JSON object/,
    );
  });
});
