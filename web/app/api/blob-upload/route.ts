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
      allowedContentTypes: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/m4a"],
      addRandomSuffix: true,
    });

    return NextResponse.json({ clientToken });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
