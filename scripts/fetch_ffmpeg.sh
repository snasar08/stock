#!/usr/bin/env bash
# Downloads a static ffmpeg/ffprobe binary for macOS into ffmpeg-bin/.
# Run on macOS. Pass ARCH=arm64 or ARCH=x64 (defaults to `uname -m` mapped).
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p ffmpeg-bin
TMP=$(mktemp -d)

ARCH="${ARCH:-}"
if [ -z "$ARCH" ]; then
  case "$(uname -m)" in
    arm64) ARCH=arm64 ;;
    x86_64) ARCH=x64 ;;
    *) echo "Unknown arch $(uname -m)" >&2; exit 1 ;;
  esac
fi

if [ "$ARCH" = "arm64" ]; then
  FFMPEG_URL="https://www.osxexperts.net/ffmpeg711arm.zip"
  FFPROBE_URL="https://www.osxexperts.net/ffprobe711arm.zip"
else
  FFMPEG_URL="https://www.osxexperts.net/ffmpeg711intel.zip"
  FFPROBE_URL="https://www.osxexperts.net/ffprobe711intel.zip"
fi

# osxexperts.net provides signed static per-arch builds of ffmpeg/ffprobe.
# If these URLs go stale, download manually from https://ffmpeg.org/download.html#build-mac
# and place the `ffmpeg`/`ffprobe` binaries for the matching arch into ffmpeg-bin/.
curl -L "$FFMPEG_URL" -o "$TMP/ffmpeg.zip"
curl -L "$FFPROBE_URL" -o "$TMP/ffprobe.zip"

unzip -o "$TMP/ffmpeg.zip" -d "$TMP"
unzip -o "$TMP/ffprobe.zip" -d "$TMP"
cp "$TMP/ffmpeg" ffmpeg-bin/ffmpeg
cp "$TMP/ffprobe" ffmpeg-bin/ffprobe
chmod +x ffmpeg-bin/ffmpeg ffmpeg-bin/ffprobe
echo "Placed $ARCH ffmpeg/ffprobe into ffmpeg-bin/"
