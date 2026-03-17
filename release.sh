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

VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"
MESSAGE="${1:-Release ${VERSION}}"

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

git add .
git commit -m "$MESSAGE"
git push
git tag "$TAG"
git push origin "$TAG"

echo
echo "Release ${TAG} pushed."
echo "Next: watch GitHub Actions for the release workflow to finish."
