# Native Postman connector specification — Akeyless

**Status:** Akeyless-side contract, setup script, and reference client are ready. This specification is what Postman implements in the desktop app; Akeyless is not in Local Vault until that ships.

This document is the implementation contract for adding **Akeyless** as a first-party Postman Local Vault connector in the Postman desktop app. Customer-facing copy lives in `user-guide.md` and must not name other secret-manager vendors.

Provider id: `akeyless`  
Display name: **Akeyless**  
Management model: **team-admin** (one Akeyless account per Postman team). Individual users still authenticate with their own Akeyless identity.

## Why this shape

The desktop app already uses:

- Loopback OIDC on `http://127.0.0.1:10545/` and `http://127.0.0.1:10534/`
- Authorization code + PKCE (S256) for public native clients
- Admin-entered issuer / client id for team-scoped integrations
- Per-secret link metadata resolved at request send time, with no cloud persistence of values

Akeyless maps onto that model with objects that already exist in the product: a **public OIDC App**, an **OAuth2/JWT authentication method**, and standard get-value APIs.

## UI

### Settings (Admin / Super Admin)

Label: **Akeyless**  
Primary action: **Set Up Integration** / **Edit details** / **Connect** / **Disconnect**

Setup form:

| Field | Required | Example | Notes |
| --- | --- | --- | --- |
| API URL | yes | `https://api.akeyless.io` | Also accept Gateway REST bases such as `https://gw.example.com:8000/api/v2`. Trim trailing slashes. |
| OIDC Issuer URL | yes | `https://auth.akeyless.io/oidc/provider/acc-…` | Used for OIDC discovery. |
| Client ID | yes | `c-…` | Public OIDC App. Never prompt for a client secret. |
| JWT Access ID | yes | `p-…` | OAuth2/JWT authentication method Access ID. |
| Scope | no | `openid email` | Default `openid email` if empty. |

Help text: “Postman signs users in with Akeyless, then retrieves secrets over the Akeyless API. Values are not stored in Postman.”

### User connect

Same picker as other Local Vault connectors: **Set up external vault** / **Use from existing vault** → **Akeyless**. Opens the system browser to the authorization URL. After the loopback redirect, close the tab and return to Postman.

### Link secret form

| Field | Required | Validation |
| --- | --- | --- |
| Item path | yes | Absolute path starting with `/` |
| Secret key | no | JSON object key or dotted path. Empty = entire value as string |
| Version | no | Integer. Static secrets only |

Preview on **Use**: resolve once, show masked value (`••••` + length), do not persist the plaintext.

## Authentication flow

All HTTP from the desktop app. No client secret.

```
GET {issuer}/.well-known/openid-configuration
GET {authorization_endpoint}
    ?response_type=code
    &client_id={client_id}
    &redirect_uri=http://127.0.0.1:10545/
    &scope=openid%20email
    &state={csrf}
    &code_challenge={s256}
    &code_challenge_method=S256
POST {token_endpoint}
    grant_type=authorization_code
    client_id={client_id}
    code={code}
    redirect_uri={same}
    code_verifier={verifier}
POST {apiUrl}/auth
    { "access-id": "{jwtAccessId}", "access-type": "jwt", "jwt": "{id_token}" }
```

Rules:

1. Redirect URI must be exactly `http://127.0.0.1:10545/` or `http://127.0.0.1:10534/` (trailing slash required).
2. Prefer `id_token` as the `jwt` body field. If the token endpoint omits `id_token`, use `access_token`.
3. Store the Akeyless session token (`t-…`) in memory only. Drop it when Postman closes or when `/auth` or a secret call returns 401.
4. Re-run the browser flow on 401.
5. Discovery `code_challenge_methods_supported` must include `S256`. If it does not, fail setup with “Akeyless OIDC App must support PKCE S256”.

Reference implementation: `src/auth.ts` in this repository.

## Secret resolution flow

On request send (and on **Use** in the link dialog):

```
POST {apiUrl}/describe-item
    { "name": "{itemPath}", "token": "{t-…}" }

# STATIC_SECRET
POST {apiUrl}/get-secret-value
    { "names": ["{itemPath}"], "token": "{t-…}", "version": <optional> }
# Response map: { "{itemPath}": <string|object> }

# DYNAMIC_SECRET
POST {apiUrl}/dynamic-secret-get-value
    { "name": "{itemPath}", "token": "{t-…}" }

# ROTATED_SECRET
POST {apiUrl}/get-rotated-secret-value
    { "names": "{itemPath}", "token": "{t-…}" }
```

Then extract `secretKey` from the payload (`src/json-key.ts`). If `secretKey` is empty, stringify the payload.

Unsupported `item_type` values (encryption keys, certificates, and so on) must fail the link with “Akeyless item type is not supported”.

Reference implementation: `src/secrets.ts`.

## Error mapping

| Condition | User-visible message |
| --- | --- |
| Discovery HTTP error | Couldn’t reach the OIDC issuer. Check the issuer URL and network access. |
| Redirect URI rejected | The Akeyless OIDC App must allow http://127.0.0.1:10545/ and http://127.0.0.1:10534/ |
| Token exchange 4xx | Sign-in didn’t complete. Try connecting again. |
| `/auth` 401/403 | Akeyless rejected the sign-in token. Confirm JWT Access ID, audience, and unique identifier. |
| describe-item 404 | Item path was not found, or you don’t have permission to see it. |
| get-value 403 | Your Akeyless role can’t read this item. |
| Missing JSON key | Secret key was not found on this item. |
| Unsupported type | This Akeyless item type can’t be linked. Use a static, dynamic, or rotated secret. |

Never include secret values, tokens, or raw Akeyless payloads in the Postman Console.

## Security requirements

- Public OIDC client only. Do not collect or store an OIDC client secret.
- PKCE S256 required.
- Allowlisted loopback redirect URIs only.
- Do not sync API URL/client id as secrets; they are integration settings. Do not sync session tokens or retrieved values to the Postman cloud.
- TLS certificate verification must stay enabled (`InsecureSkipVerify` equivalent is not allowed).
- Cache decrypted values only for the team’s Local Vault cache TTL, in memory.

## Test plan (Postman QA)

1. Admin setup with values from `scripts/akeyless-setup-postman.sh`.
2. User browser login on macOS and Windows using both loopback ports if the first is busy.
3. Link a static JSON secret and send a request that interpolates `{{vault:name}}`.
4. Link a dynamic secret field (`access_key_id` or `username`) and confirm a fresh value on two sends when cache TTL is 0.
5. Link a rotated secret `password` field.
6. Deny `read` on the item and confirm the mapped 403 message.
7. Close Postman, reopen, confirm Connect is required again.
8. Disconnect the integration and confirm linked secrets no longer resolve.

Akeyless-side smoke test (no Postman build required):

```bash
npm run verify -- \
  --issuer-url ... --client-id ... --jwt-access-id ... \
  --item-path /postman/demo --secret-key password
```

## Assets

- Display name: Akeyless
- Wordmark / mark: request from Akeyless brand (`brand@akeyless.io`)
- Docs URL for in-app “Learn more”: `https://docs.akeyless.io/docs/postman` (publish `user-guide.md` to that slug)

## Partnership

Akeyless cannot ship this UI. Postman owns the desktop connector. This repository is the Akeyless-side contract, setup tooling, and portable client so the desktop implementation stays a thin wrapper around `src/`.
