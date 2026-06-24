export interface Word {
  start: number;
  end: number;
  text: string;
}

export interface Segment {
  index: number;
  start: number;
  end: number;
  text: string;
  speaker: string | null;
  words: Word[];
}

export interface Meta {
  source: string;
  duration: number;
  model: string;
  fps: number;
  language: string;
}

export function secondsToTimestamp(s: number, sep = ","): string {
  if (s < 0) s = 0;
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000);
  let r = ms % 3600000;
  const m = Math.floor(r / 60000);
  r = r % 60000;
  const sc = Math.floor(r / 1000);
  const msRem = r % 1000;
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(sc)}${sep}${pad(msRem, 3)}`;
}

function toFrames(s: number, fps: number): number {
  return Math.round(Math.max(0, s) * fps);
}

function esc(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function writeJson(segs: Segment[], meta: Meta): string {
  return JSON.stringify({ meta, segments: segs }, null, 2);
}

export function writeSrt(segs: Segment[]): string {
  const lines: string[] = [];
  let n = 0;
  for (const s of segs) {
    if (!s.text) continue;
    n += 1;
    lines.push(
      String(n),
      `${secondsToTimestamp(s.start)} --> ${secondsToTimestamp(s.end)}`,
      s.text,
      ""
    );
  }
  return lines.join("\n");
}

export function writeXml(segs: Segment[], fps: number, meta: Meta): string {
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<transcript source="${esc(meta.source || "")}" fps="${fps}" duration="${meta.duration || 0}" model="whisper-large-v3-groq">`,
  ];
  for (const s of segs) {
    out.push(
      `  <segment index="${s.index}" start="${s.start}" end="${s.end}" start_ms="${Math.round(
        s.start * 1000
      )}" end_ms="${Math.round(s.end * 1000)}" start_frame="${toFrames(
        s.start,
        fps
      )}" end_frame="${toFrames(s.end, fps)}"${
        s.speaker ? ` speaker="${esc(s.speaker)}"` : ""
      }>`
    );
    out.push(`    <text>${esc(s.text)}</text>`);
    if (s.words && s.words.length) {
      out.push("    <words>");
      for (const w of s.words) {
        out.push(
          `      <word start="${w.start}" end="${w.end}" start_ms="${Math.round(
            w.start * 1000
          )}" end_ms="${Math.round(w.end * 1000)}" start_frame="${toFrames(
            w.start,
            fps
          )}" end_frame="${toFrames(w.end, fps)}">${esc(w.text)}</word>`
        );
      }
      out.push("    </words>");
    }
    out.push("  </segment>");
  }
  out.push("</transcript>");
  return out.join("\n");
}

export function writeTxt(segs: Segment[]): string {
  const lines: string[] = [];
  for (const s of segs) {
    if (!s.text) continue;
    const ts = secondsToTimestamp(s.start, ".").slice(0, 8);
    const speakerPart = s.speaker ? ` ${s.speaker}:` : "";
    lines.push(`[${ts}]${speakerPart} ${s.text}`);
  }
  return lines.join("\n");
}
