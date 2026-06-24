import { del, put } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  const form = await request.formData();
  const uploadId = form.get("uploadId") as string | null;
  const index = Number(form.get("index"));
  const total = Number(form.get("total"));
  const filename = form.get("filename") as string | null;
  const chunk = form.get("chunk") as File | null;
  const priorUrlsRaw = form.get("priorUrls") as string | null;

  if (!uploadId || !filename || !chunk || Number.isNaN(index) || Number.isNaN(total)) {
    return NextResponse.json(
      { error: "Missing uploadId, filename, chunk, index, or total" },
      { status: 400 }
    );
  }

  try {
    const tempBlob = await put(`tmp/${uploadId}/${index}`, chunk, { access: "public" });

    if (index < total - 1) {
      return NextResponse.json({ done: false, url: tempBlob.url });
    }

    const priorUrls: string[] = priorUrlsRaw ? JSON.parse(priorUrlsRaw) : [];
    const allTempUrls = [...priorUrls, tempBlob.url];

    const buffers: Buffer[] = [];
    for (const url of allTempUrls) {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch temp chunk: ${res.status}`);
      }
      buffers.push(Buffer.from(await res.arrayBuffer()));
    }
    const merged = Buffer.concat(buffers);

    const finalBlob = await put(filename, merged, {
      access: "public",
      addRandomSuffix: true,
    });

    await Promise.all(allTempUrls.map((url) => del(url).catch(() => undefined)));

    return NextResponse.json({ done: true, url: finalBlob.url });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
