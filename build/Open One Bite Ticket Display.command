#!/bin/bash

set -euo pipefail

APP_NAME="One Bite Ticket Display.app"
APP_PATH="/Applications/${APP_NAME}"

echo
echo "One Bite Ticket Display macOS helper"
echo

if [ ! -d "${APP_PATH}" ]; then
  echo "The app was not found in /Applications yet."
  echo "Please drag ${APP_NAME} into Applications first, then run this helper again."
  echo
  read -r -p "Press Enter to close..."
  exit 1
fi

echo "Removing macOS quarantine from:"
echo "  ${APP_PATH}"
echo

xattr -dr com.apple.quarantine "${APP_PATH}" || true
spctl --add --label "One Bite Ticket Display" "${APP_PATH}" >/dev/null 2>&1 || true

echo "Done."
echo "Opening the app now..."
echo

open "${APP_PATH}"

echo "If macOS still blocks the app, close it and run this helper again."
echo
read -r -p "Press Enter to close..."
