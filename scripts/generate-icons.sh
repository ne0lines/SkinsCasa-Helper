#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build"
ICON_SVG="$BUILD_DIR/icon.svg"
ICON_PNG="$BUILD_DIR/icon.png"
ICON_ICNS="$BUILD_DIR/icon.icns"

if ! command -v sips >/dev/null 2>&1; then
  echo "sips is required to generate app icons." >&2
  exit 1
fi

if ! command -v qlmanage >/dev/null 2>&1; then
  echo "qlmanage is required to rasterize the SVG icon source." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
ICONSET_DIR="$TMP_DIR/icon.iconset"
RENDERED_PNG="$TMP_DIR/icon.svg.png"
ICON_ICO="$BUILD_DIR/icon.ico"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$ICONSET_DIR"

qlmanage -t -s 1024 -o "$TMP_DIR" "$ICON_SVG" >/dev/null 2>&1

if [ ! -f "$RENDERED_PNG" ]; then
  echo "Failed to rasterize SVG icon source." >&2
  exit 1
fi

cp "$RENDERED_PNG" "$ICON_PNG"

for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$ICON_PNG" --out "$ICONSET_DIR/icon_${size}x${size}.png" >/dev/null
done

sips -z 32 32 "$ICON_PNG" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 64 64 "$ICON_PNG" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 256 256 "$ICON_PNG" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 512 512 "$ICON_PNG" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 1024 1024 "$ICON_PNG" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null

if command -v iconutil >/dev/null 2>&1; then
  iconutil -c icns "$ICONSET_DIR" -o "$ICON_ICNS"
fi

python3 - "$ICON_PNG" "$ICON_ICO" <<'PY'
import sys
from PIL import Image

source_path, output_path = sys.argv[1], sys.argv[2]
image = Image.open(source_path)
sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
image.save(output_path, format="ICO", sizes=sizes)
PY

echo "Generated:"
echo "  $ICON_PNG"
if [ -f "$ICON_ICNS" ]; then
  echo "  $ICON_ICNS"
fi
if [ -f "$ICON_ICO" ]; then
  echo "  $ICON_ICO"
fi
