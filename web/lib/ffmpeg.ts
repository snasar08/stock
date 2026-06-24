import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmodSync } from "node:fs";

const execFileAsync = promisify(execFile);

// ffmpeg-static/ffprobe-static export the binary path as their default export.
const ffmpegPath = require("ffmpeg-static") as string;
const ffprobePath = (require("ffprobe-static") as { path: string }).path;

// The packaged ffmpeg-static binary sometimes loses its executable bit
// (e.g. after install/deploy packaging), which makes execFile fail with
// EACCES. Force it back on; no-op if already executable.
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
