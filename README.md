# Momentum Transcribe

Drag-and-drop Mac desktop app: drop an mp3/m4a/wav onto the window, it
transcribes via Groq's `whisper-large-v3`, and writes `.txt` / `.json` /
`.srt` / `.xml` plus the moved source file into
`~/Desktop/momentum/<episode name>/`.

## Run in dev (any OS with Python + ffmpeg on PATH)

```
cp config.example.js config.js   # fill in your real Groq key
npm install
pip install -r python/requirements.txt
npm start
```

`config.js` is gitignored — GitHub's push protection blocks commits that
contain a live API key, and a key baked into git history can never really
be removed. Keep the real key only in your local `config.js`; electron-builder
bundles it into the packaged app at build time, so the end user still never
sees or enters it.

In dev mode the app shells out to `python3 python/transcribe.py` and expects
`ffmpeg`/`ffprobe` on your `PATH`.

## Building the distributable .dmg (must run on macOS)

PyInstaller does not cross-compile, and electron-builder can't produce a
signed/working mac dmg from Linux, so the actual `.dmg` build has to happen
on a Mac (or macOS CI, e.g. GitHub Actions `macos-latest`):

```
npm install
npm run build:python   # PyInstaller-bundles python/transcribe.py -> python-dist/transcribe
npm run build:ffmpeg    # downloads static ffmpeg/ffprobe -> ffmpeg-bin/
npm run dist             # electron-builder -> dist/Momentum Transcribe.dmg
```

`scripts/build_python.sh` and `scripts/fetch_ffmpeg.sh` automate the two
native dependencies; see comments in each for the universal (Intel +
Apple Silicon) build notes — building a single universal2 binary requires
either a universal2 Python interpreter or lipo-merging two PyInstaller
builds (one from an Intel Mac/runner, one from Apple Silicon).

## Building automatically via GitHub Actions

`.github/workflows/build-dmg.yml` builds both an Apple Silicon (`macos-14`)
and an Intel (`macos-13`) dmg in parallel and, when triggered by a `v*` tag
push, attaches both to a GitHub release.

Setup:
1. Add a repository secret named `GROQ_API_KEY` (Settings → Secrets and
   variables → Actions) with the real key. The workflow writes it into a
   local `config.js` at build time — it never touches the committed source.
2. Push a tag (`git tag v1.0.0 && git push origin v1.0.0`) to build + release,
   or run the workflow manually via the Actions tab ("Run workflow") to just
   get the two dmg artifacts without cutting a release.

This sidesteps the "can't cross-compile from Linux" limitation entirely —
each arch's PyInstaller binary and ffmpeg build happens natively on a
matching macOS runner.

## Security note on the bundled API key

The Groq API key is hardcoded in `main.js` so the app works with zero setup
for anyone who downloads it. That means anyone who downloads the `.dmg` can
extract the key from the unpacked app resources and use it on your Groq
account — there is no way to fully hide a secret inside a binary shipped to
end users. If usage/cost or abuse becomes a concern, the standard fix is to
proxy requests through your own backend (with the real key kept server-side)
and have the app call that backend instead of Groq directly.

## Progress protocol

`python/transcribe.py` prints status lines to stdout that `main.js` forwards
to the renderer via IPC:

- `DURATION <seconds>` → "Converting audio…"
- `CHUNK X/Y` → "Transcribing chunk X of Y" + progress bar
- `SPEAKERS_START` / `SPEAKERS_FALLBACK ...` → "Detecting speakers…"
- `WRITING_OUTPUTS` → "Writing outputs…"
- `DONE <output folder path>` → "Done" + clickable output path
