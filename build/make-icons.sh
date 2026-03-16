#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SVG_PATH="$ROOT_DIR/icon-source.svg"
PNG_PATH="$ROOT_DIR/icon.png"
ICONSET_DIR="$ROOT_DIR/icon.iconset"
ICNS_PATH="$ROOT_DIR/icon.icns"
ICO_PATH="$ROOT_DIR/icon.ico"
RENDER_DIR="$ROOT_DIR/rendered"
TMP_DIR="$ROOT_DIR/tmp"

if [ ! -f "$SVG_PATH" ]; then
  echo "Missing $SVG_PATH"
  exit 1
fi

rm -rf "$ICONSET_DIR" "$RENDER_DIR" "$TMP_DIR"
mkdir -p "$ICONSET_DIR" "$RENDER_DIR" "$TMP_DIR"
export TMPDIR="$TMP_DIR/"

qlmanage -t -s 1024 -o "$RENDER_DIR" "$SVG_PATH" >/dev/null 2>&1 || {
  echo "Could not render PNG preview from $SVG_PATH"
  echo "Try opening build/icon-source.svg in Preview and exporting a 1024x1024 PNG as build/icon.png"
  exit 1
}

THUMBNAIL_PATH="$(find "$RENDER_DIR" -name '*.png' | head -n 1)"
if [ -z "${THUMBNAIL_PATH:-}" ]; then
  echo "Could not render PNG from $SVG_PATH"
  exit 1
fi

cp "$THUMBNAIL_PATH" "$PNG_PATH"

sips -z 16 16 "$PNG_PATH" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
sips -z 32 32 "$PNG_PATH" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$PNG_PATH" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 64 64 "$PNG_PATH" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$PNG_PATH" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 256 256 "$PNG_PATH" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$PNG_PATH" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 512 512 "$PNG_PATH" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$PNG_PATH" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$PNG_PATH" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null

iconutil -c icns "$ICONSET_DIR" -o "$ICNS_PATH"
sips -z 256 256 "$PNG_PATH" --out "$TMP_DIR/icon-256.png" >/dev/null
node <<'NODE'
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const pngPath = path.join(root, 'build', 'tmp', 'icon-256.png');
const icoPath = path.join(root, 'build', 'icon.ico');
const png = fs.readFileSync(pngPath);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);

const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0);
entry.writeUInt8(0, 1);
entry.writeUInt8(0, 2);
entry.writeUInt8(0, 3);
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(22, 12);

fs.writeFileSync(icoPath, Buffer.concat([header, entry, png]));
NODE

echo "Built:"
echo "  $PNG_PATH"
echo "  $ICNS_PATH"
echo "  $ICO_PATH"
