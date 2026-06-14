#!/usr/bin/env bash
# Pre-build check: ensure no developer keys, paths, or personal data leak into the package.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

LEGACY_KEY_PREFIX="aw-local"
LEGACY_HOST="localhost"
LEGACY_PORT="3000"
LOCAL_HOME="${HOME:-}"

PATTERNS=(
  "${LEGACY_KEY_PREFIX}-dev-key"
  "${LEGACY_KEY_PREFIX}-admin-key"
  "${LEGACY_HOST}:${LEGACY_PORT}"
)

if [ -n "$LOCAL_HOME" ]; then
  PATTERNS+=("$LOCAL_HOME")
fi

FAILED=0

is_tracked() {
  git -C "$ROOT_DIR" ls-files --error-unmatch "$1" >/dev/null 2>&1
}

for pattern in "${PATTERNS[@]}"; do
  # Exclude this script itself, .git, node_modules, .venv, dist, build, .aw-runtime, .env
  HITS=$(grep -r "$pattern" "$ROOT_DIR" \
    --exclude-dir='.git' \
    --exclude-dir='node_modules' \
    --exclude-dir='.venv' \
    --exclude-dir='dist' \
    --exclude-dir='build' \
    --exclude-dir='.aw-runtime' \
    --exclude='*.log' \
    --exclude='*.jsonl' \
    --exclude='check-sanitized.sh' \
    --exclude='.env' \
    --exclude='accounts.json' \
    -l 2>/dev/null || true)

  if [ -n "$HITS" ]; then
    echo "FAIL: Found '$pattern' in:"
    echo "$HITS"
    FAILED=1
  else
    echo "PASS: No '$pattern' found"
  fi
done

LEGACY_RUNTIME_PATTERN="clo""ve"
HITS=$(grep -ri "$LEGACY_RUNTIME_PATTERN" "$ROOT_DIR" \
  --exclude-dir='.git' \
  --exclude-dir='node_modules' \
  --exclude-dir='.venv' \
  --exclude-dir='dist' \
  --exclude-dir='build' \
  --exclude-dir='.aw-runtime' \
  --exclude='requirements.txt' \
  --exclude='check-sanitized.sh' \
  --exclude='*.log' \
  --exclude='*.jsonl' \
  -l 2>/dev/null || true)

if [ -n "$HITS" ]; then
  echo "FAIL: Found product-facing legacy runtime references in:"
  echo "$HITS"
  FAILED=1
else
  echo "PASS: No product-facing legacy runtime references found"
fi

FORBIDDEN_TRACKED_FILES=(
  "DeepSeek_API_test.txt"
  "SPEC.md"
  "Commands"
  "local-proxy/.env"
  "local-proxy/runtime.json"
  "local-proxy/data/accounts.json"
)

for file in "${FORBIDDEN_TRACKED_FILES[@]}"; do
  if is_tracked "$file"; then
    echo "FAIL: Local/private file is tracked: $file"
    FAILED=1
  else
    echo "PASS: Local/private file is not tracked: $file"
  fi
done

SECRET_REGEX='(sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|sessionKey=[^;[:space:]]{20,}|Cookie:[[:space:]]*[^[:space:]]{20,}|BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY)'
SECRET_HITS=$(grep -R -I -E "$SECRET_REGEX" "$ROOT_DIR" \
  --exclude-dir='.git' \
  --exclude-dir='node_modules' \
  --exclude-dir='.venv' \
  --exclude-dir='dist' \
  --exclude-dir='build' \
  --exclude-dir='.aw-runtime' \
  --exclude-dir='data' \
  --exclude-dir='logs' \
  --exclude='package-lock.json' \
  --exclude='check-sanitized.sh' \
  --exclude='.env' \
  --exclude='runtime.json' \
  --exclude='*.log' \
  --exclude='*.jsonl' \
  -n 2>/dev/null || true)

if [ -n "$SECRET_HITS" ]; then
  echo "FAIL: Potential secret material found:"
  echo "$SECRET_HITS"
  FAILED=1
else
  echo "PASS: No API key, cookie, bearer token, or private key patterns found"
fi

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "Sanitization check FAILED. Remove the above occurrences before packaging."
  exit 1
fi

echo ""
echo "Sanitization check PASSED."
