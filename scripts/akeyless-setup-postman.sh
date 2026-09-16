#!/usr/bin/env bash
# Creates the Akeyless objects the Postman desktop app needs for the native
# Akeyless connector: a public OIDC App, an OAuth2/JWT auth method, and an
# Access Role with read on the chosen item path.
set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
DRY_RUN=0
YES=0

OIDC_APP_NAME="${OIDC_APP_NAME:-/postman-integration}"
JWT_AUTH_NAME="${JWT_AUTH_NAME:-/postman-jwt}"
ROLE_NAME="${ROLE_NAME:-/postman-integration-role}"
REDIRECT_URIS="${REDIRECT_URIS:-http://127.0.0.1:10545/,http://127.0.0.1:10534/}"
OIDC_SCOPES="${OIDC_SCOPES:-openid,email}"
UNIQUE_IDENTIFIER="${UNIQUE_IDENTIFIER:-email}"
ROLE_ITEM_PATH="${ROLE_ITEM_PATH:-/*}"
API_URL="${AKEYLESS_API_URL:-https://api.akeyless.io}"
AUTH_HOST="${AKEYLESS_AUTH_HOST:-https://auth.akeyless.io}"
PROFILE_ARGS=()

usage() {
  cat <<EOF
Usage: ${SCRIPT_NAME} [options]

Creates Akeyless objects for the native Postman connector and prints the values
a Postman Admin enters in Local Vault settings.

Required (one of):
  --access-id <id>     Authentication method Access ID allowed to use the OIDC App
  --group-id <id>      Group ID allowed to use the OIDC App

Options:
  --oidc-app-name      OIDC App path (default: /postman-integration)
  --jwt-auth-name      OAuth2/JWT auth method path (default: /postman-jwt)
  --role-name          Access Role path (default: /postman-integration-role)
  --item-path          Item path the role can read (default: /*)
  --unique-identifier  JWT unique identifier claim (default: email)
  --profile            Akeyless CLI profile name
  --api-url            Akeyless API URL (default: https://api.akeyless.io)
  --auth-host          OIDC issuer host (default: https://auth.akeyless.io)
  -d, --dry-run        Print commands without running them
  -y                   Do not prompt before creating objects
  -h, --help           Show this help

Environment:
  ACCESS_ID, GROUP_ID, OIDC_APP_NAME, JWT_AUTH_NAME, ROLE_NAME,
  ROLE_ITEM_PATH, UNIQUE_IDENTIFIER, AKEYLESS_API_URL, AKEYLESS_AUTH_HOST
EOF
}

json_get() {
  local json="$1"
  local key="$2"
  python3 -c 'import json,sys; data=json.load(sys.stdin); print(data.get(sys.argv[1],"") or "")' "$key" <<<"$json"
}

run_akeyless() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '+ akeyless %s\n' "$*"
    return 0
  fi
  akeyless "$@"
}

run_akeyless_json() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '+ akeyless %s --json\n' "$*" >&2
    echo '{}'
    return 0
  fi
  akeyless "$@" --json
}

ACCESS_ID="${ACCESS_ID:-}"
GROUP_ID="${GROUP_ID:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --access-id) ACCESS_ID="$2"; shift 2 ;;
    --group-id) GROUP_ID="$2"; shift 2 ;;
    --oidc-app-name) OIDC_APP_NAME="$2"; shift 2 ;;
    --jwt-auth-name) JWT_AUTH_NAME="$2"; shift 2 ;;
    --role-name) ROLE_NAME="$2"; shift 2 ;;
    --item-path) ROLE_ITEM_PATH="$2"; shift 2 ;;
    --unique-identifier) UNIQUE_IDENTIFIER="$2"; shift 2 ;;
    --profile) PROFILE_ARGS=(--profile "$2"); shift 2 ;;
    --api-url) API_URL="$2"; shift 2 ;;
    --auth-host) AUTH_HOST="$2"; shift 2 ;;
    -d|--dry-run) DRY_RUN=1; shift ;;
    -y) YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if [[ -z "${ACCESS_ID}" && -z "${GROUP_ID}" ]]; then
  echo "Provide --access-id or --group-id so users can authenticate through the OIDC App." >&2
  exit 1
fi
if [[ -n "${ACCESS_ID}" && -n "${GROUP_ID}" ]]; then
  echo "Provide only one of --access-id or --group-id." >&2
  exit 1
fi

if ! [[ "${REDIRECT_URIS}" == *"http://127.0.0.1:10545/"* && "${REDIRECT_URIS}" == *"http://127.0.0.1:10534/"* ]]; then
  echo "Redirect URIs must include http://127.0.0.1:10545/ and http://127.0.0.1:10534/" >&2
  exit 1
fi

if [[ "${DRY_RUN}" -eq 0 ]] && ! command -v akeyless >/dev/null 2>&1; then
  echo "The Akeyless CLI is required. Install it from https://docs.akeyless.io/docs/cli" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to parse CLI JSON output." >&2
  exit 1
fi

if [[ "${ACCESS_ID}" == *'"'* || "${GROUP_ID}" == *'"'* ]]; then
  echo "access-id and group-id must not contain double quotes." >&2
  exit 1
fi

if [[ -n "${ACCESS_ID}" ]]; then
  PERMISSION_ASSIGNMENT="[{\"assignment_type\":\"AUTH_METHOD\",\"access_id\":\"${ACCESS_ID}\"}]"
else
  PERMISSION_ASSIGNMENT="[{\"assignment_type\":\"GROUP\",\"group_id\":\"${GROUP_ID}\"}]"
fi

echo "This will create:"
echo "  OIDC App:          ${OIDC_APP_NAME} (public client)"
echo "  JWT auth method:   ${JWT_AUTH_NAME}"
echo "  Access Role:       ${ROLE_NAME} (read ${ROLE_ITEM_PATH})"
echo "  Redirect URIs:     ${REDIRECT_URIS}"
echo

if [[ "${YES}" -ne 1 && "${DRY_RUN}" -eq 0 ]]; then
  read -r -p "Continue? [y/N] " reply
  case "${reply}" in
    y|Y|yes|YES) ;;
    *) echo "Aborted."; exit 1 ;;
  esac
fi

ACCOUNT_JSON="$(run_akeyless_json get-account-settings "${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"}")"
ACCOUNT_ID="$(json_get "${ACCOUNT_JSON}" account_id)"
if [[ "${DRY_RUN}" -eq 1 ]]; then
  ACCOUNT_ID="${ACCOUNT_ID:-acc-DRY-RUN}"
fi
if [[ -z "${ACCOUNT_ID}" ]]; then
  echo "Could not read account_id from get-account-settings." >&2
  exit 1
fi

ISSUER_URL="${AUTH_HOST%/}/oidc/provider/${ACCOUNT_ID}"
JWKS_URI="${ISSUER_URL}/.well-known/jwks.json"

OIDC_JSON="$(run_akeyless_json create-oidc-app \
  "${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"}" \
  --name "${OIDC_APP_NAME}" \
  --public \
  --redirect-uris "${REDIRECT_URIS}" \
  --scopes "${OIDC_SCOPES}" \
  --permission-assignment "${PERMISSION_ASSIGNMENT}")"
CLIENT_ID="$(json_get "${OIDC_JSON}" client_id)"
if [[ "${DRY_RUN}" -eq 1 ]]; then
  CLIENT_ID="${CLIENT_ID:-c-DRY-RUN}"
fi

JWT_JSON="$(run_akeyless_json auth-method create oauth2 \
  "${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"}" \
  --name "${JWT_AUTH_NAME}" \
  --jwks-uri "${JWKS_URI}" \
  --issuer "${ISSUER_URL}" \
  --audience "${CLIENT_ID}" \
  --unique-identifier "${UNIQUE_IDENTIFIER}")"
JWT_ACCESS_ID="$(json_get "${JWT_JSON}" access_id)"
if [[ "${DRY_RUN}" -eq 1 ]]; then
  JWT_ACCESS_ID="${JWT_ACCESS_ID:-p-DRY-RUN}"
fi

run_akeyless create-role \
  "${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"}" \
  --name "${ROLE_NAME}" >/dev/null

run_akeyless set-role-rule \
  "${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"}" \
  --role-name "${ROLE_NAME}" \
  --path "${ROLE_ITEM_PATH}" \
  --capability read \
  --rule-type item-rule >/dev/null

run_akeyless assoc-role-am \
  "${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"}" \
  --role-name "${ROLE_NAME}" \
  --am-name "${JWT_AUTH_NAME}" >/dev/null

cat <<EOF

Akeyless Postman connector is ready.

Share these values with a Postman Admin. Enter them in Local Vault → Settings → Akeyless.

  API URL           ${API_URL}
  OIDC Issuer URL   ${ISSUER_URL}
  Client ID         ${CLIENT_ID}
  JWT Access ID     ${JWT_ACCESS_ID}
  Scope             ${OIDC_SCOPES//,/ }

Do not change the OIDC App redirect URIs. Postman listens on:
  http://127.0.0.1:10545/
  http://127.0.0.1:10534/

Verify the flow (secret values are never printed):

  npm run verify -- \\
    --api-url ${API_URL} \\
    --issuer-url ${ISSUER_URL} \\
    --client-id ${CLIENT_ID} \\
    --jwt-access-id ${JWT_ACCESS_ID} \\
    --item-path /path/to/secret
EOF
