import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { toChunk } from "@/lib/ffmpeg";
import { transcribeChunk } from "@/lib/groq";

export const runtime = "nodejs";
export const maxDuration = 60;

const CHUNK_SECONDS = 1200;

export async function POST(request: Request): Promise<NextResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing GROQ_API_KEY" },
      { status: 500 }
    );
  }

  const { blobUrl, chunkIndex, duration, startIndex, language } =
    (await request.json()) as {
      blobUrl: string;
      chunkIndex: number;
      duration: number;
      startIndex: number;
      language?: string;
    };

  if (!blobUrl || chunkIndex == null || duration == null) {
    return NextResponse.json(
      { error: "Missing blobUrl, chunkIndex, or duration" },
      { status: 400 }
    );
  }

  const dir = await mkdtemp(path.join(tmpdir(), "chunk-"));
  const sourcePath = path.join(dir, "source");
  const chunkPath = path.join(dir, "chunk.mp3");

  try {
    const result = await get(blobUrl, { access: "private" });
    if (!result || result.statusCode !== 200) {
      throw new Error(`Failed to download blob: ${blobUrl}`);
    }
    const buf = Buffer.from(await new Response(result.stream).arrayBuffer());
    await writeFile(sourcePath, buf);

    const start = chunkIndex * CHUNK_SECONDS;
    const cdur = Math.min(CHUNK_SECONDS, duration - start);
    if (cdur <= 0) {
      return NextResponse.json({ segments: [], nextIndex: startIndex ?? 0 });
    }

    await toChunk(sourcePath, chunkPath, start, cdur);

    const { segments, nextIndex } = await transcribeChunk(
      chunkPath,
      start,
      duration,
      startIndex ?? 0,
      language,
      apiKey
    );

    return NextResponse.json({ segments, nextIndex });
  } catch (error) {
    try {
      const parsed = JSON.parse((error as Error).message);
      if (parsed && parsed.error === "rate_limit") {
        return NextResponse.json(
          { error: "rate_limit", retryAfter: parsed.retryAfter },
          { status: 429 }
        );
      }
    } catch {
      // not a JSON-encoded rate_limit error
    }
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
