#!/usr/bin/env bash

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

WITH_PACKAGING=0
if [[ "${1:-}" == "--with-packaging" ]]; then
  WITH_PACKAGING=1
fi

fail() {
  echo
  echo "Preflight failed: $1"
  exit 1
}

check_command() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is required but was not found."
}

check_file() {
  local path="$1"
  [[ -f "$path" ]] || fail "Required file is missing: $path"
}

run_check() {
  local label="$1"
  shift
  echo "Checking: $label"
  "$@" || fail "$label"
}

check_command git
check_command node
check_command npm
check_command grep

echo "Running release preflight in $REPO_DIR"

run_check "main.js syntax" node -c "$REPO_DIR/main.js"
run_check "preload.js syntax" node -c "$REPO_DIR/preload.js"
run_check "app/server.js syntax" node -c "$REPO_DIR/app/server.js"

check_file "$REPO_DIR/build/icon.ico"
check_file "$REPO_DIR/build/icon.icns"
check_file "$REPO_DIR/build/icon.png"
check_file "$REPO_DIR/build/installer.nsh"
check_file "$REPO_DIR/build/after-pack.js"
check_file "$REPO_DIR/.github/workflows/release.yml"

echo "Checking for forbidden tracked local data files"
for forbidden in app/config.json app/invoice-detail-cache.json app/ticket-meta-cache.json; do
  if git ls-files --error-unmatch "$forbidden" >/dev/null 2>&1; then
    fail "Tracked local data file detected: $forbidden"
  fi
done

echo "Checking for known shop-specific hardcoded endpoints"
if rg -n --hidden --glob '!dist/**' --glob '!node_modules/**' 'obtadmin\.repairdesk\.co' "$REPO_DIR" >/dev/null 2>&1; then
  fail "Found hardcoded One Bite RepairDesk endpoint in source."
fi

echo "Checking release metadata upload patterns"
for required_pattern in 'dist/latest.yml' 'dist/latest-mac.yml' 'dist/*.blockmap'; do
  if ! grep -Fq "$required_pattern" "$REPO_DIR/.github/workflows/release.yml"; then
    fail "Release workflow is missing updater metadata artifact pattern: $required_pattern"
  fi
done

echo "Checking beta updater compatibility step"
if ! grep -Fq 'Add updater compatibility metadata' "$REPO_DIR/.github/workflows/release.yml"; then
  fail "Release workflow is missing the updater compatibility metadata step for beta builds."
fi

echo "Checking release publish job"
if ! grep -Fq 'publish-release:' "$REPO_DIR/.github/workflows/release.yml"; then
  fail "Release workflow is missing the final publish-release job."
fi

if [[ "$WITH_PACKAGING" -eq 1 ]]; then
  echo "Running packaging smoke tests"
  run_check "Windows package build" npm run dist:win
  run_check "macOS local package build" npm run dist:mac:local
fi

echo
echo "Preflight passed."
