#!/usr/bin/env bash
# Pre-build check: ensure no developer keys, paths, or personal data leak into the package.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PATTERNS=(
  "aw-local-dev-key"
  "aw-local-admin-key"
  "/Users/kimfischer99"
)

FAILED=0

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

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "Sanitization check FAILED. Remove the above occurrences before packaging."
  exit 1
fi

echo ""
echo "Sanitization check PASSED."
