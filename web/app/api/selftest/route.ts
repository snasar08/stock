// TEMPORARY end-to-end test harness. Drives the real upload/probe/chunk
// endpoints from inside Vercel's network. Remove after verification.
import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const runtime = "nodejs";
export const maxDuration = 300;

const execFileAsync = promisify(execFile);
const ffmpegPath = require("ffmpeg-static") as string;

export async function GET(request: Request): Promise<NextResponse> {
  const u = new URL(request.url);
  const step = u.searchParams.get("step");
  const origin = `https://${request.headers.get("host")}`;

  try {
    if (step === "upload") {
      // Build a 3-hour CBR mp3: encode 10 minutes once, repeat 18x.
      // Deterministic, so resumable batches can regenerate it per call.
      const hours = Number(u.searchParams.get("hours") || 3);
      const from = Number(u.searchParams.get("from") || 0);
      const count = Number(u.searchParams.get("count") || 5);
      const uploadId = u.searchParams.get("uploadId") || crypto.randomUUID();
      const priorRaw = u.searchParams.get("prior") || "";
      const priorUrls = priorRaw ? priorRaw.split(",") : [];

      const dir = await mkdtemp(path.join(tmpdir(), "selftest-"));
      const piece = path.join(dir, "piece.mp3");
      await execFileAsync(ffmpegPath, [
        "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000",
        "-t", "600", "-ac", "1", "-b:a", "64k", piece,
      ]);
      const pieceBuf = await readFile(piece);
      await rm(dir, { recursive: true, force: true });
      const data = Buffer.concat(Array(hours * 6).fill(pieceBuf));

      const CHUNK_SIZE = 4 * 1024 * 1024;
      const total = Math.ceil(data.length / CHUNK_SIZE);
      const upTo = Math.min(from + count, total);
      let blobUrl = "";
      const timings: number[] = [];

      for (let i = from; i < upTo; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, data.length);
        const fd = new FormData();
        fd.append("uploadId", uploadId);
        fd.append("index", String(i));
        fd.append("total", String(total));
        fd.append("filename", "selftest3h.mp3");
        fd.append("chunk", new Blob([data.subarray(start, end)]));
        fd.append("priorUrls", JSON.stringify(priorUrls));
        const t0 = Date.now();
        const res = await fetch(`${origin}/api/blob-upload`, { method: "POST", body: fd });
        const j = (await res.json()) as { done?: boolean; url?: string; error?: string };
        timings.push(Date.now() - t0);
        if (!res.ok) {
          return NextResponse.json(
            { step: `upload chunk ${i + 1}/${total}`, status: res.status, error: j.error },
            { status: 500 }
          );
        }
        if (j.done) blobUrl = j.url!;
        else priorUrls.push(j.url!);
      }
      const done = upTo >= total;
      return NextResponse.json({
        ok: true,
        done,
        blobUrl: done ? blobUrl : undefined,
        uploadId,
        nextFrom: upTo,
        total,
        bytes: data.length,
        prior: done ? undefined : priorUrls.join(","),
        timings,
      });
    }

    if (step === "probe") {
      const blobUrl = u.searchParams.get("blobUrl");
      const res = await fetch(`${origin}/api/probe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl }),
      });
      const j = await res.json();
      return NextResponse.json({ ok: res.ok, status: res.status, ...j });
    }

    if (step === "chunk") {
      const blobUrl = u.searchParams.get("blobUrl");
      const res = await fetch(`${origin}/api/chunk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobUrl,
          chunkIndex: Number(u.searchParams.get("i")),
          duration: Number(u.searchParams.get("duration")),
          startIndex: Number(u.searchParams.get("startIndex") || 0),
          lastSpeaker: u.searchParams.get("lastSpeaker") || "Speaker 1",
          lastEnd: Number(u.searchParams.get("lastEnd") || 0),
        }),
      });
      const j = (await res.json()) as {
        segments?: unknown[]; nextIndex?: number; lastSpeaker?: string; lastEnd?: number;
        error?: string; retryAfter?: number;
      };
      return NextResponse.json({
        ok: res.ok,
        status: res.status,
        segmentCount: j.segments?.length,
        nextIndex: j.nextIndex,
        lastSpeaker: j.lastSpeaker,
        lastEnd: j.lastEnd,
        error: j.error,
        retryAfter: j.retryAfter,
      });
    }

    return NextResponse.json({ error: "unknown step" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).stack || (error as Error).message },
      { status: 500 }
    );
  }
}
