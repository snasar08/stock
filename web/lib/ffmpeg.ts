import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmodSync } from "node:fs";

const execFileAsync = promisify(execFile);

// On Vercel, use the system binaries directly — ffmpeg-static/ffprobe-static's
// binaries (336MB combined) would otherwise be bundled into the function and
// exceed Vercel's 250MB size limit. Locally, fall back to the npm packages.
// require() is only called off of Vercel so the binaries are never referenced
// (and therefore never traced/bundled) in the Vercel build.
const isVercel = process.env.VERCEL === "1";

const ffmpegPath = isVercel ? "/usr/bin/ffmpeg" : (require("ffmpeg-static") as string);
const ffprobePath = isVercel
  ? "/usr/bin/ffprobe"
  : (require("ffprobe-static") as { path: string }).path;

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
