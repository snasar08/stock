import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<NextResponse> {
  const { filename, contentType } = (await request.json()) as {
    filename: string;
    contentType?: string;
  };

  if (!filename) {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 });
  }

  try {
    const clientToken = await generateClientTokenFromReadWriteToken({
      token: process.env.BLOB_READ_WRITE_TOKEN,
      pathname: filename,
      allowedContentTypes: [
        "audio/mpeg",
        "audio/mp4",
        "audio/x-m4a",
        "audio/m4a",
        "audio/wav",
        "audio/x-wav",
        "application/octet-stream",
        "",
      ],
      addRandomSuffix: true,
      validUntil: Date.now() + 30 * 60 * 1000,
    });

    return NextResponse.json({ clientToken });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
