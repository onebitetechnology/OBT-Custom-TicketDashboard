#!/usr/bin/env bash

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required but was not found."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required but was not found."
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "This script must be run inside the project git repository."
  exit 1
fi

if [[ ! -f "./preflight.sh" ]]; then
  echo "preflight.sh is required but was not found."
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"
STABLE_RELEASE="false"
if [[ "${1:-}" == "--stable" ]]; then
  STABLE_RELEASE="true"
  shift
fi
MESSAGE="${1:-Release ${VERSION}}"
RELEASE_KIND="beta"
if [[ "$VERSION" != *-* ]]; then
  RELEASE_KIND="stable"
fi

if [[ "$RELEASE_KIND" == "stable" && "$STABLE_RELEASE" != "true" ]]; then
  echo "Stable releases now require an explicit --stable flag."
  echo "For normal test builds, bump to a beta version like 2.1.68-beta.1 and rerun."
  echo "If you really want a public release, run:"
  echo "  bash ./release.sh --stable \"${MESSAGE}\""
  exit 1
fi

if [[ "$RELEASE_KIND" == "beta" && "$STABLE_RELEASE" == "true" ]]; then
  echo "This version (${VERSION}) is already a beta/prerelease version."
  echo "Remove --stable or bump the version to a stable semver first."
  exit 1
fi

if [[ -z "$(git status --porcelain)" ]]; then
  echo "No changes to release."
  exit 1
fi

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag ${TAG} already exists locally. Bump the version first or delete the old tag."
  exit 1
fi

echo "Releasing ${TAG}"
echo "Commit message: ${MESSAGE}"
echo "Release type: ${RELEASE_KIND}"

echo
echo "Running preflight checks before release..."
bash ./preflight.sh

git add .
git commit -m "$MESSAGE"
git push
git tag "$TAG"
git push origin "$TAG"

echo
echo "Release ${TAG} pushed."
echo "Next: watch GitHub Actions for the release workflow to finish."
