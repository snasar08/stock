import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, chmodSync } from "node:fs";

const execFileAsync = promisify(execFile);

// Prefer the system binary (present on Vercel's runtime) so we don't need to
// bundle the much larger ffmpeg-static/ffprobe-static packages into the
// function. Fall back to the npm packages for local dev.
function resolveBinary(systemPath: string, fallback: () => string): string {
  if (existsSync(systemPath)) {
    return systemPath;
  }
  return fallback();
}

const ffmpegPath = resolveBinary("/usr/bin/ffmpeg", () => require("ffmpeg-static") as string);
const ffprobePath = resolveBinary(
  "/usr/bin/ffprobe",
  () => (require("ffprobe-static") as { path: string }).path
);

// The packaged ffmpeg-static/ffprobe-static binaries sometimes lose their
// executable bit (e.g. after install/deploy packaging), which makes execFile
// fail with EACCES. Force it back on; no-op if already executable or the
// filesystem is read-only (e.g. the system binary path).
for (const bin of [ffmpegPath, ffprobePath]) {
  try {
    chmodSync(bin, 0o755);
  } catch {
    // ignore — read-only fs or already correct
  }
}

export async function ffprobeDuration(path: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(ffprobePath, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ]);
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

export async function toChunk(
  src: string,
  dst: string,
  start: number,
  dur: number
): Promise<void> {
  await execFileAsync(ffmpegPath, [
    "-y",
    "-i",
    src,
    "-ss",
    String(start),
    "-t",
    String(dur),
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "32k",
    dst,
  ]);
}
