import {
  completeMultipartUpload,
  createMultipartUpload,
  del,
  get,
  put,
  uploadPart,
} from "@vercel/blob";
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
    const tempBlob = await put(`tmp/${uploadId}/${index}`, chunk, {
      access: "private",
      addRandomSuffix: true,
    });

    if (index < total - 1) {
      return NextResponse.json({ done: false, url: tempBlob.url });
    }

    const priorUrls: string[] = priorUrlsRaw ? JSON.parse(priorUrlsRaw) : [];
    const allTempUrls = [...priorUrls, tempBlob.url];

    const MIN_PART_SIZE = 5 * 1024 * 1024;
    const { key, uploadId: multipartUploadId } = await createMultipartUpload(filename, {
      access: "private",
      addRandomSuffix: true,
    });

    const parts: { etag: string; partNumber: number }[] = [];
    let pending: Buffer[] = [];
    let pendingSize = 0;
    let partNumber = 1;

    for (let i = 0; i < allTempUrls.length; i++) {
      const url = allTempUrls[i];
      const result = await get(url, { access: "private" });
      if (!result || result.statusCode !== 200) {
        throw new Error(`Failed to fetch temp chunk: ${url}`);
      }
      pending.push(Buffer.from(await new Response(result.stream).arrayBuffer()));
      pendingSize += pending[pending.length - 1].length;

      const isLast = i === allTempUrls.length - 1;
      if (pendingSize >= MIN_PART_SIZE || isLast) {
        const part = await uploadPart(filename, Buffer.concat(pending), {
          uploadId: multipartUploadId,
          key,
          partNumber,
          access: "private",
        });
        parts.push(part);
        partNumber += 1;
        pending = [];
        pendingSize = 0;
      }
    }

    const finalBlob = await completeMultipartUpload(filename, parts, {
      uploadId: multipartUploadId,
      key,
      access: "private",
    });

    await Promise.all(allTempUrls.map((url) => del(url).catch(() => undefined)));

    return NextResponse.json({ done: true, url: finalBlob.url });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
