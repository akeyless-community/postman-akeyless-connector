import { createHash, randomBytes } from "node:crypto";

const VERIFIER_BYTES = 32;

export function base64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
}

export function createPkcePair(): PkcePair {
  const codeVerifier = base64Url(randomBytes(VERIFIER_BYTES));
  const codeChallenge = base64Url(
    createHash("sha256").update(codeVerifier).digest(),
  );
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: "S256",
  };
}

export function randomState(): string {
  return base64Url(randomBytes(24));
}
