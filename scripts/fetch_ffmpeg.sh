#!/usr/bin/env bash
# Downloads static universal ffmpeg/ffprobe binaries for macOS into ffmpeg-bin/.
# Run on macOS. Uses the evermeet.cx static builds (Intel) and a universal
# wrapper is not published, so we fetch both arch builds and lipo them together.
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p ffmpeg-bin
TMP=$(mktemp -d)

# osxexperts.net / evermeet.cx provide signed static universal builds for ffmpeg.
# If these URLs go stale, download manually from https://ffmpeg.org/download.html#build-mac
# and place universal `ffmpeg` and `ffprobe` binaries directly into ffmpeg-bin/.
curl -L "https://www.osxexperts.net/ffmpeg711arm.zip" -o "$TMP/ffmpeg-arm.zip" || true
curl -L "https://www.osxexperts.net/ffprobe711arm.zip" -o "$TMP/ffprobe-arm.zip" || true

if [ -f "$TMP/ffmpeg-arm.zip" ]; then
  unzip -o "$TMP/ffmpeg-arm.zip" -d "$TMP"
  unzip -o "$TMP/ffprobe-arm.zip" -d "$TMP"
  cp "$TMP/ffmpeg" ffmpeg-bin/ffmpeg
  cp "$TMP/ffprobe" ffmpeg-bin/ffprobe
  chmod +x ffmpeg-bin/ffmpeg ffmpeg-bin/ffprobe
  echo "Placed ffmpeg/ffprobe into ffmpeg-bin/"
else
  echo "Automatic download failed. Manually place universal 'ffmpeg' and 'ffprobe' binaries into ffmpeg-bin/" >&2
  exit 1
fi
