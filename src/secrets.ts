import { extractSecretField } from "./json-key.js";
import {
  AkeylessConnectorError,
  ITEM_TYPE_DYNAMIC,
  ITEM_TYPE_ROTATED,
  ITEM_TYPE_STATIC,
  type DescribeItemResponse,
  type LinkedSecret,
  type ResolvedSecret,
  type SecretItemType,
} from "./types.js";
import { trimSlash } from "./urls.js";

export function itemTypeFromDescribe(
  body: DescribeItemResponse,
): SecretItemType {
  const type = body.item_type ?? body.item?.item_type;
  if (!type) {
    throw new AkeylessConnectorError(
      "describe_item_failed",
      "describe-item response did not include item_type",
    );
  }
  return type;
}

export async function describeItem(
  apiUrl: string,
  token: string,
  itemPath: string,
  fetcher: typeof fetch = fetch,
): Promise<DescribeItemResponse> {
  const res = await fetcher(`${trimSlash(apiUrl)}/describe-item`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: itemPath, token }),
  });
  if (!res.ok) {
    throw new AkeylessConnectorError(
      "describe_item_failed",
      `describe-item failed (${res.status})`,
      res.status,
    );
  }
  return (await res.json()) as DescribeItemResponse;
}

export async function fetchSecretPayload(
  apiUrl: string,
  token: string,
  itemPath: string,
  itemType: SecretItemType,
  version: number | undefined,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const base = trimSlash(apiUrl);

  if (itemType === ITEM_TYPE_DYNAMIC) {
    return postJson(fetcher, `${base}/dynamic-secret-get-value`, {
      name: itemPath,
      token,
    });
  }

  if (itemType === ITEM_TYPE_ROTATED) {
    return postJson(fetcher, `${base}/get-rotated-secret-value`, {
      names: itemPath,
      token,
    });
  }

  if (itemType !== ITEM_TYPE_STATIC) {
    throw new AkeylessConnectorError(
      "unsupported_item_type",
      `Unsupported item type "${itemType}". Supported types: STATIC_SECRET, DYNAMIC_SECRET, ROTATED_SECRET`,
    );
  }

  const body: Record<string, unknown> = {
    names: [itemPath],
    token,
  };
  if (version !== undefined) {
    body.version = version;
  }
  const payload = await postJson(fetcher, `${base}/get-secret-value`, body);
  if (payload && typeof payload === "object" && itemPath in payload) {
    return (payload as Record<string, unknown>)[itemPath];
  }
  return payload;
}

export async function resolveLinkedSecret(
  apiUrl: string,
  token: string,
  linked: LinkedSecret,
  fetcher: typeof fetch = fetch,
): Promise<ResolvedSecret> {
  const itemPath = linked.itemPath.trim();
  if (!itemPath.startsWith("/")) {
    throw new AkeylessConnectorError(
      "invalid_item_path",
      "Item path must be an absolute Akeyless path starting with /",
    );
  }

  const described = await describeItem(apiUrl, token, itemPath, fetcher);
  const itemType = itemTypeFromDescribe(described);
  const payload = await fetchSecretPayload(
    apiUrl,
    token,
    itemPath,
    itemType,
    linked.version,
    fetcher,
  );
  const value = extractSecretField(payload, linked.secretKey);

  return {
    itemPath,
    itemType,
    secretKey: linked.secretKey,
    valueLength: value.length,
    value,
  };
}

async function postJson(
  fetcher: typeof fetch,
  url: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const code =
      url.endsWith("/dynamic-secret-get-value")
        ? "get_dynamic_secret_failed"
        : url.endsWith("/get-rotated-secret-value")
          ? "get_rotated_secret_failed"
          : "get_secret_value_failed";
    throw new AkeylessConnectorError(
      code,
      `Secret retrieval failed (${res.status})`,
      res.status,
    );
  }
  return res.json();
}
