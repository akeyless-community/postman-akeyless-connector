/**
 * Extract a field from a secret payload the way the Postman connector should.
 * Nested keys use dot notation (password, data.token). Literal dots in a key
 * are not supported — store those keys at the top level instead.
 */
export function extractSecretField(
  rawValue: unknown,
  secretKey?: string,
): string {
  const key = secretKey?.trim();
  if (!key) {
    return stringifySecret(rawValue);
  }

  const parsed = parseIfJson(rawValue);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `Secret is not a JSON object; cannot extract key "${key}"`,
    );
  }

  const value = getPath(parsed as Record<string, unknown>, key);
  if (value === undefined) {
    throw new Error(`Secret key "${key}" was not found`);
  }
  return stringifySecret(value);
}

function parseIfJson(rawValue: unknown): unknown {
  if (typeof rawValue !== "string") {
    return rawValue;
  }
  const trimmed = rawValue.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return rawValue;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return rawValue;
  }
}

function getPath(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function stringifySecret(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
