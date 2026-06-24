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

## Web app (`/web`, deployed to Vercel)

A Next.js version of the same tool lives in `web/` — drop a file in the
browser, it transcribes the same way and offers the same 4 files
(`.txt`/`.json`/`.srt`/`.xml`) as downloads. The Groq key is read from a
server-only environment variable (`GROQ_API_KEY`), never sent to the
browser.

Differences from the desktop app, both forced by Vercel's free-tier
limits:
- **Speaker labels** always use the same gap-based heuristic the desktop
  app falls back to (alternate `Speaker 1`/`Speaker 2` on any >1.5s pause
  between segments) — no resemblyzer/torch voice-embedding step, since a
  Python function bundling torch is too large/slow for Vercel's Hobby
  plan.
- **Long episodes** are handled by having the *browser* drive the
  per-chunk loop (one `/api/chunk` call per ~10-minute chunk, called
  sequentially), rather than one long server request, since Vercel
  caps function duration at 60s on the Hobby plan regardless of streaming.

### One-time Vercel setup (I can't do this part — no Vercel access from here)

1. In the Vercel dashboard: **New Project → Import** this GitHub repo,
   set **Root Directory** to `web`.
2. In that project's **Storage** tab, create a **Blob** store and connect
   it to the project — this auto-injects `BLOB_READ_WRITE_TOKEN`.
3. In **Settings → Environment Variables**, add `GROQ_API_KEY` with the
   real key (same key used in the desktop app's `config.js` / GitHub
   Actions secret).
4. Deploy. Every push to the linked branch redeploys automatically.

### Running it locally

```
cd web
cp .env.local.example .env.local   # fill in your real Groq key
npm install
npm run dev
```

(Local dev still needs a Vercel Blob token in `.env.local` — pull it
with `vercel env pull` once the project above is linked, or use a Blob
store created via the Vercel CLI.)

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
