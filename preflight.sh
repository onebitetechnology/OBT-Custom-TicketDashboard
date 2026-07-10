#!/usr/bin/env bash

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

WITH_PACKAGING=0
STATIC_ONLY=0

fail() {
  echo
  echo "Preflight failed: $1"
  exit 1
}

for argument in "$@"; do
  case "$argument" in
    --with-packaging) WITH_PACKAGING=1 ;;
    --static-only) STATIC_ONLY=1 ;;
    *) fail "Unknown preflight option: $argument" ;;
  esac
done

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
check_command rg

echo "Running release preflight in $REPO_DIR"

if [[ "$STATIC_ONLY" -eq 0 ]]; then
  run_check "JavaScript syntax" npm run check:syntax --silent
  run_check "local API security smoke test" npm run security:smoke --silent
  run_check "dependency vulnerability audit" npm run security:audit --silent
  run_check "dependency signature verification" npm run security:signatures --silent
fi
run_check "GitHub workflow YAML" node -e "const fs=require('fs'); const yaml=require('js-yaml'); for (const file of fs.readdirSync('.github/workflows').filter((name)=>name.endsWith('.yml')||name.endsWith('.yaml'))) yaml.load(fs.readFileSync('.github/workflows/'+file, 'utf8'))"

check_file "$REPO_DIR/build/icon.ico"
check_file "$REPO_DIR/build/icon.icns"
check_file "$REPO_DIR/build/icon.png"
check_file "$REPO_DIR/build/installer.nsh"
check_file "$REPO_DIR/build/after-pack.js"
check_file "$REPO_DIR/lib/electron-security.js"
check_file "$REPO_DIR/scripts/local-build.js"
check_file "$REPO_DIR/scripts/verify-electron-fuses.js"
check_file "$REPO_DIR/.github/workflows/release.yml"
check_file "$REPO_DIR/.github/workflows/security.yml"

echo "Checking for forbidden tracked local data and dashboard files"
for forbidden in app/config.json app/invoice-detail-cache.json app/invoice-priority-cache.json app/ticket-meta-cache.json app/category-rules.json app/consignment-rules.json; do
  if [[ -e "$REPO_DIR/$forbidden" ]]; then
    fail "Forbidden local/dashboard data file present: $forbidden"
  fi
done

echo "Checking repo tree for likely sensitive support/debug artifacts"
while IFS= read -r artifact; do
  [[ -z "$artifact" ]] && continue
  fail "Sensitive artifact present in repo tree: ${artifact#./}"
done < <(
  find "$REPO_DIR" \
    \( -path "$REPO_DIR/.git" -o -path "$REPO_DIR/node_modules" -o -path "$REPO_DIR/dist" -o -path "$REPO_DIR/out" -o -path "$REPO_DIR/release" \) -prune \
    -o -type f \
    \( -name 'support-bundle-*.json' -o -name '*.har' -o -name '*.http' -o -name '*.secrets.json' \) \
    -print
)

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

echo "Checking immutable GitHub Action references"
while IFS= read -r action_line; do
  [[ "$action_line" =~ @[0-9a-f]{40}([[:space:]]|$) ]] || fail "GitHub Actions must be pinned to full commit SHAs: $action_line"
done < <(grep -hE '^[[:space:]]*uses:' "$REPO_DIR"/.github/workflows/*.yml)

echo "Checking mandatory release signing and provenance controls"
for required_control in \
  '"forceCodeSigning": true' \
  '"notarize": true' \
  'Require macOS signing and notarization secrets' \
  'Verify macOS signature and notarization' \
  'Require Windows signing secrets' \
  'Verify Windows Authenticode signature' \
  'Generate SHA-256 checksums' \
  'Attest release build provenance' \
  'dist/SHA256SUMS.txt'; do
  if ! grep -Fq "$required_control" "$REPO_DIR/package.json" "$REPO_DIR/.github/workflows/release.yml"; then
    fail "Release hardening control is missing: $required_control"
  fi
done

echo "Checking packaged Electron hardening controls"
for required_fuse_control in \
  'strictlyRequireAllFuses: true' \
  '[FuseV1Options.RunAsNode]: false' \
  '[FuseV1Options.EnableCookieEncryption]: true' \
  '[FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false' \
  '[FuseV1Options.EnableNodeCliInspectArguments]: false' \
  '[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true' \
  '[FuseV1Options.OnlyLoadAppFromAsar]: true' \
  '[FuseV1Options.GrantFileProtocolExtraPrivileges]: false'; do
  if ! grep -Fq "$required_fuse_control" "$REPO_DIR/build/after-pack.js"; then
    fail "Electron fuse hardening control is missing: $required_fuse_control"
  fi
done

if rg -n 'ELECTRON_RUN_AS_NODE' "$REPO_DIR/main.js" "$REPO_DIR/app/server.js" >/dev/null 2>&1; then
  fail "Bundled runtime still depends on ELECTRON_RUN_AS_NODE."
fi
if rg -n 'ipcMain\.handle' "$REPO_DIR/main.js" >/dev/null 2>&1; then
  fail "A main-process IPC handler bypasses the trusted sender registrar."
fi
if ! grep -Fq 'utilityProcess.fork' "$REPO_DIR/main.js"; then
  fail "Bundled server is not using an Electron utility process."
fi
if ! grep -Fq '"@electron/fuses": "2.1.3"' "$REPO_DIR/package.json"; then
  fail "The Electron fuse tool is missing or not pinned exactly."
fi
if ! grep -Fq 'NODE_VERSION: "22"' "$REPO_DIR/.github/workflows/release.yml"; then
  fail "Release CI must use Node 22 or newer for the pinned fuse tool."
fi
if [[ "$(grep -Fc 'name: Verify hardened Electron fuses' "$REPO_DIR/.github/workflows/release.yml")" -ne 2 ]]; then
  fail "Both macOS and Windows release jobs must verify packaged Electron fuses."
fi

echo "Checking continuous security verification"
for required_ci_control in \
  'name: Security and Tests' \
  'branches: [main]' \
  'pull_request:' \
  'run: bash ./preflight.sh'; do
  if ! grep -Fq "$required_ci_control" "$REPO_DIR/.github/workflows/security.yml"; then
    fail "Continuous security workflow control is missing: $required_ci_control"
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

echo "Checking CI builds do not auto-publish partial releases"
for build_command in '--mac dmg zip --publish never' '--win nsis --publish never'; do
  if ! grep -Fq -- "$build_command" "$REPO_DIR/.github/workflows/release.yml"; then
    fail "Release workflow is still allowing CI build jobs to auto-publish: missing $build_command"
  fi
done

echo "Checking updater metadata verification steps"
for verification_step in 'Verify Windows updater metadata' 'Verify macOS updater metadata' 'Verify release assets before publish'; do
  if ! grep -Fq "$verification_step" "$REPO_DIR/.github/workflows/release.yml"; then
    fail "Release workflow is missing updater verification step: $verification_step"
  fi
done

if [[ "$WITH_PACKAGING" -eq 1 ]]; then
  echo "Running packaging smoke tests"
  run_check "Windows unsigned local package build" npm run dist:win:local
  run_check "macOS local package build" npm run dist:mac:local
fi

echo
echo "Preflight passed."
