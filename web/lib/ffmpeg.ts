import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmodSync } from "node:fs";

const execFileAsync = promisify(execFile);

// ffmpeg-static/ffprobe-static export the binary path as their default export.
// next.config.js's outputFileTracingIncludes narrows the bundled files to just
// the Linux x64 binaries (~80MB combined) instead of every platform/arch
// ffprobe-static ships (336MB), keeping the function under Vercel's 250MB cap.
const ffmpegPath = require("ffmpeg-static") as string;
const ffprobePath = (require("ffprobe-static") as { path: string }).path;

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
  } catch (error) {
    const e = error as { stderr?: string; message?: string };
    console.error(`ffprobeDuration failed for ${path}:`, e.stderr || e.message || error);
    throw error;
  }
}

export async function toChunk(
  src: string,
  dst: string,
  start: number,
  dur: number
): Promise<void> {
  try {
    await execFileAsync(ffmpegPath, [
      "-y",
      "-f",
      "m4a",
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
  } catch (error) {
    const e = error as { stderr?: string; message?: string };
    console.error(`toChunk failed for ${src} (start=${start}, dur=${dur}):`, e.stderr || e.message || error);
    throw new Error(`ffmpeg failed: ${e.stderr || e.message || error}`);
  }
}
