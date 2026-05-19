#!/usr/bin/env bash
set -euo pipefail

MODEL="${GROK_API_MODEL:-grok-4.3}"
BASE_URL="${GROK_API_BASE_URL:-${GROK_MODELS_BASE_URL:-https://api.x.ai/v1}}"
LIST_URL="${GROK_API_MODELS_LIST_URL:-${GROK_MODELS_LIST_URL:-${BASE_URL%/}/models}}"
GROK_BIN="${GROK_BIN:-grok}"
HERMES_PYTHON="${HERMES_PYTHON:-$HOME/.hermes/hermes-agent/venv/bin/python}"

export GROK_LOG_FILTER="${GROK_LOG_FILTER:-error}"
export RUST_LOG="${RUST_LOG:-error}"

usage() {
  cat <<EOF
Usage:
  tools/grok-api.sh [grok args...]

Examples:
  tools/grok-api.sh
  tools/grok-api.sh --cwd /tmp --no-memory --disable-web-search -p "Reply exactly OK."
  GROK_API_MODEL=grok-4.3 tools/grok-api.sh -p "Explain this repo"

Environment:
  GROK_API_MODEL            Default: grok-4.3
  GROK_API_BASE_URL         Default: https://api.x.ai/v1
  GROK_API_MODELS_LIST_URL  Default: \$GROK_API_BASE_URL/models
  GROK_BIN                  Default: grok
  HERMES_PYTHON             Default: ~/.hermes/hermes-agent/venv/bin/python

This wrapper reads the xAI OAuth token from Hermes' credential pool at runtime
and passes it to Grok as a bearer token for xAI's OpenAI-compatible API. It
does not write the token to ~/.grok/config.toml.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if ! command -v "$GROK_BIN" >/dev/null 2>&1; then
  echo "grok-api: '$GROK_BIN' not found on PATH" >&2
  echo "Install it with: curl -fsSL https://x.ai/cli/install.sh | bash" >&2
  exit 127
fi

if [[ ! -x "$HERMES_PYTHON" ]]; then
  echo "grok-api: Hermes Python not found or not executable: $HERMES_PYTHON" >&2
  echo "Expected Hermes install at ~/.hermes/hermes-agent." >&2
  exit 127
fi

TOKEN="$("$HERMES_PYTHON" - <<'PY'
import sys

try:
    from agent.credential_pool import load_pool
except Exception as exc:
    print(f"grok-api: failed to import Hermes auth helpers: {exc}", file=sys.stderr)
    sys.exit(2)

try:
    pool = load_pool("xai-oauth")
    entry = pool.select()
except Exception as exc:
    print(f"grok-api: failed to resolve Hermes xAI OAuth token: {exc}", file=sys.stderr)
    sys.exit(3)

if entry is None:
    print("grok-api: Hermes xAI OAuth is not ready: no available xai-oauth credential", file=sys.stderr)
    print("Run: hermes auth add xai-oauth --type oauth", file=sys.stderr)
    sys.exit(3)

token = entry.access_token
if not isinstance(token, str) or not token:
    print("grok-api: Hermes xAI OAuth credential did not contain an access token", file=sys.stderr)
    sys.exit(3)

print(token)
PY
)"

has_model=0
for arg in "$@"; do
  case "$arg" in
    -m|--model|--model=*)
      has_model=1
      break
      ;;
  esac
done

if [[ "$has_model" -eq 0 ]]; then
  set -- -m "$MODEL" "$@"
fi

export GROK_CODE_XAI_API_KEY="$TOKEN"
export GROK_MODELS_BASE_URL="$BASE_URL"
export GROK_MODELS_LIST_URL="$LIST_URL"

exec "$GROK_BIN" "$@"
