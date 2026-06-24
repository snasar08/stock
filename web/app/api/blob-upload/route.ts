import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        return {
          allowedContentTypes: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/m4a"],
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // No-op: the client moves on to /api/probe once the blob URL is returned.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
