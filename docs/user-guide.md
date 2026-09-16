---
title: Postman
excerpt: >-
  Integrate Postman Local Vault with Akeyless so request secrets are resolved
  from Akeyless at send time and never stored in the Postman cloud.
deprecated: false
hidden: false
metadata:
  title: Postman
  description: Native Akeyless connector for Postman Local Vault
  robots: index
---
# Integrate Postman Local Vault with Akeyless

**Status:** Akeyless-side setup is ready. Akeyless does not yet appear in Postman Local Vault — that ships when Postman adds this as a native desktop connector.

Use Akeyless as the source of truth for secrets referenced from Postman. After you connect Postman Local Vault to Akeyless, you link vault secrets to Akeyless items and retrieve current values when you send HTTP requests.

This integration is supported with the **Postman desktop app**.

## About the Akeyless integration

A Postman Admin or Super Admin configures the integration once for the team. That configuration points Postman at your Akeyless account (API URL, OIDC issuer, public Client ID, and JWT Access ID). Each teammate then signs in with their own Akeyless identity.

Postman authenticates using the OAuth 2.0 authorization code flow with Proof Key for Code Exchange (PKCE) against an Akeyless [OIDC App](https://docs.akeyless.io/docs/oidc-app-provider). The OIDC App must be a **public** client. After sign-in, Postman exchanges the ID token for an Akeyless session with an [OAuth2.0/JWT authentication method](https://docs.akeyless.io/docs/auth-with-oauth-jwt).

Linked items can be [static](https://docs.akeyless.io/docs/static-secrets), [dynamic](https://docs.akeyless.io/docs/how-to-create-dynamic-secret), or [rotated](https://docs.akeyless.io/docs/rotated-secrets) secrets. Postman does not store retrieved values in the local app or the Postman cloud.

## Set up Akeyless

Make sure you can create an OIDC App, an OAuth2/JWT authentication method, and an Access Role.

### Option A: setup script

The setup script creates the required objects and prints the values you enter in Postman.

```shell
./scripts/akeyless-setup-postman.sh --access-id <Auth Method Access ID> --item-path '/postman/*'
```

Or assign a group instead of a single authentication method:

```shell
./scripts/akeyless-setup-postman.sh --group-id <Group ID> --item-path '/postman/*'
```

| Flag | Details |
| --- | --- |
| `--access-id` or `--group-id` | Required. Identities allowed to sign in through the OIDC App. |
| `--item-path` | Item path the Access Role can read. Default: `/*`. Restrict this to the folder Postman users need. |
| `--unique-identifier` | JWT claim used to distinguish users. Default: `email`. |
| `--api-url` | Value Postman should call. Default: `https://api.akeyless.io`. |
| `-d`, `--dry-run` | Print commands without creating objects. |
| `-y` | Skip the confirmation prompt. |

Save the printed **API URL**, **OIDC Issuer URL**, **Client ID**, and **JWT Access ID**.

### Option B: Console or CLI

1. Create a **public** OIDC App. Set redirect URIs to `http://127.0.0.1:10545/` and `http://127.0.0.1:10534/`. Grant scopes `openid` and `email`. Assign the authentication methods or groups that may sign in.

    ```shell
    akeyless create-oidc-app \
      --name /postman-integration \
      --public \
      --redirect-uris 'http://127.0.0.1:10545/,http://127.0.0.1:10534/' \
      --scopes 'openid,email' \
      --permission-assignment '[{"assignment_type":"AUTH_METHOD","access_id":"<Access ID>"}]'
    ```

2. Read your account ID:

    ```shell
    akeyless get-account-settings --json
    ```

    The issuer URL is `https://auth.akeyless.io/oidc/provider/<account_id>`.

3. Create an OAuth2/JWT authentication method that trusts that issuer:

    ```shell
    akeyless auth-method create oauth2 \
      --name /postman-jwt \
      --jwks-uri 'https://auth.akeyless.io/oidc/provider/<account_id>/.well-known/jwks.json' \
      --issuer 'https://auth.akeyless.io/oidc/provider/<account_id>' \
      --audience '<OIDC Client ID>' \
      --unique-identifier email
    ```

4. Create an Access Role, grant `read` on the item path Postman will use, and associate the JWT authentication method:

    ```shell
    akeyless create-role --name /postman-integration-role

    akeyless set-role-rule \
      --role-name /postman-integration-role \
      --path '/postman/*' \
      --capability read \
      --rule-type item-rule

    akeyless assoc-role-am \
      --role-name /postman-integration-role \
      --am-name /postman-jwt
    ```

Users who sign in must already have an Akeyless identity assigned to the OIDC App. The JWT authentication method then maps each user by the `email` claim (or the unique identifier you configured).

## Integrate with Akeyless

As a Postman Team Admin or Super Admin, connect Local Vault to Akeyless for your team.

1. Open your Postman Local Vault, then select **Settings**.
2. Select **Set Up Integration** next to **Akeyless**.
3. Enter:

   | Field | Value |
   | --- | --- |
   | API URL | `https://api.akeyless.io` or your Gateway REST API, for example `https://gateway.example.com:8000/api/v2` |
   | OIDC Issuer URL | `https://auth.akeyless.io/oidc/provider/<account_id>` |
   | Client ID | OIDC App client ID |
   | JWT Access ID | OAuth2/JWT authentication method Access ID |
   | Scope (optional) | `openid email` |

4. Select **Set Up Akeyless**.

Admins can edit the integration later from **Settings** → **Edit details** next to **Akeyless**.

If the account uses a customer [key fragment](https://docs.akeyless.io/docs/dfc-overview), set **API URL** to the Gateway REST endpoint.

## Authenticate with Akeyless

After an admin creates the integration, each user authorizes Postman to retrieve secrets.

You need to sign in each time you open Postman, or when the session expires.

1. Open Local Vault.
2. If you have not connected an external secret manager, select **Set up external vault**. Otherwise select **Use from existing vault**, then **Akeyless**.
3. Complete sign-in in the browser, then return to Postman.

Your computer must be able to reach Akeyless. Sign in with an identity assigned to the OIDC App. Do not complete this browser step with an Access Key / API Key login — Postman will not be able to retrieve secrets for that identity.

## Link vault secrets with Akeyless

Link a Local Vault secret to an Akeyless item. Postman retrieves the current value when you send a request that references the vault secret.

1. Enter a name for the vault secret.
2. Hover over the **Value** cell, select **Link Vault**, then **Akeyless**.
3. Enter the **Item path** (full Akeyless path, for example `/prod/api/credentials`).
4. Optionally enter a **Secret key** to extract one field from a JSON payload (`password`, `api_key`, `username`). Leave it empty to use the entire value.
5. Optionally enter a **Version** for static secrets. The latest version is used when omitted.
6. Select **Use**.

To view or change a linked item, select **Configure vault** next to the secret.

Signing out of Postman deletes local vault secrets, including links. The vault key cannot restore them. After you sign in again, reauthenticate and link items again.

You can read linked secrets from scripts. Postman does not support setting the value of secrets linked to Akeyless from scripts. Enable scripts to access vault secrets or the Postman Console reports an error.

## Next steps

- [Use vault secrets](https://learning.postman.com/docs/sending-requests/postman-vault/use-vault-secrets/)
- [Manage Postman Vault integrations](https://learning.postman.com/docs/sending-requests/postman-vault/manage-vault-integrations/)
- [Troubleshoot vault secrets](https://learning.postman.com/docs/sending-requests/postman-vault/troubleshoot-vault-secrets/)
