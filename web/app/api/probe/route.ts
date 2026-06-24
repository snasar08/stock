import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ffprobeDuration } from "@/lib/ffmpeg";

export const runtime = "nodejs";
export const maxDuration = 30;

const CHUNK_SECONDS = 600;

export async function POST(request: Request): Promise<NextResponse> {
  const { blobUrl } = (await request.json()) as { blobUrl: string };
  if (!blobUrl) {
    return NextResponse.json({ error: "Missing blobUrl" }, { status: 400 });
  }

  const dir = await mkdtemp(path.join(tmpdir(), "probe-"));
  const localPath = path.join(dir, "source");

  try {
    const result = await get(blobUrl, { access: "private" });
    if (!result || result.statusCode !== 200) {
      throw new Error(`Failed to download blob: ${blobUrl}`);
    }
    const buf = Buffer.from(await new Response(result.stream).arrayBuffer());
    await writeFile(localPath, buf);

    const duration = await ffprobeDuration(localPath);
    const totalChunks = Math.max(1, Math.ceil(duration / CHUNK_SECONDS));

    return NextResponse.json({ duration, totalChunks });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
