#!/usr/bin/env bash
# Builds python/transcribe.py into a standalone onedir binary at python-dist/transcribe.
# Must be run on macOS (matching the target arch) since PyInstaller does not cross-compile.
# For a universal app, run this once on Apple Silicon and once on Intel (or use a universal
# Python interpreter via `python3 -m venv` built from a universal2 python.org installer),
# then merge with `lipo`, or simply ship two separate Intel/arm64 dmgs.
set -euo pipefail

cd "$(dirname "$0")/.."

python3 -m venv .pybuild-venv
source .pybuild-venv/bin/activate
pip install --upgrade pip
pip install -r python/requirements.txt

# resemblyzer (via webrtcvad's old-style metadata) drags in the obsolete
# "typing" backport package, which PyInstaller refuses to run alongside.
pip uninstall -y typing

rm -rf python-dist build-pyinstaller transcribe.spec
pyinstaller \
  --name transcribe \
  --onedir \
  --noconfirm \
  --distpath python-dist \
  --workpath build-pyinstaller \
  --collect-all resemblyzer \
  --collect-all groq \
  python/transcribe.py

deactivate
echo "Built python-dist/transcribe/transcribe"
