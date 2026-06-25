import { readFile } from "node:fs/promises";
import { Segment, Word } from "./format";

interface GroqVerboseSegment {
  start: number;
  end: number;
  text: string;
}

interface GroqVerboseWord {
  start: number;
  end: number;
  word: string;
}

interface GroqVerboseResponse {
  segments?: GroqVerboseSegment[];
  words?: GroqVerboseWord[];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, hi));
}

export async function transcribeChunk(
  chunkPath: string,
  chunkOffset: number,
  duration: number,
  startIndex: number,
  language: string | undefined,
  apiKey: string
): Promise<{ segments: Segment[]; nextIndex: number }> {
  const fileBuffer = await readFile(chunkPath);
  const form = new FormData();
  form.append("file", new Blob([fileBuffer]), "chunk.mp3");
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("timestamp_granularities[]", "word");
  if (language) form.append("language", language);

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") || "", 10) || 60;
      throw new Error(JSON.stringify({ error: "rate_limit", retryAfter }));
    }
    const errText = await res.text();
    throw new Error(`Groq request failed (${res.status}): ${errText}`);
  }

  const r = (await res.json()) as GroqVerboseResponse;
  const rsegs = r.segments || [];
  const rwords = r.words || [];

  const segments: Segment[] = [];
  let idx = startIndex;
  let wi = 0;

  for (const rs of rsegs) {
    const ss = round3(clamp(chunkOffset + rs.start, 0, duration));
    let se = round3(clamp(chunkOffset + rs.end, 0, duration));
    if (se < ss) se = ss;
    const words: Word[] = [];
    while (wi < rwords.length) {
      const rw = rwords[wi];
      if (rw.start <= rs.end + 0.05) {
        const ws = round3(clamp(chunkOffset + rw.start, 0, duration));
        let we = round3(clamp(chunkOffset + rw.end, 0, duration));
        if (we < ws) we = ws;
        words.push({ start: ws, end: we, text: rw.word.trim() });
        wi += 1;
      } else {
        break;
      }
    }
    segments.push({
      index: idx,
      start: ss,
      end: se,
      text: rs.text.trim(),
      speaker: null,
      words,
    });
    idx += 1;
  }

  return { segments, nextIndex: idx };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
