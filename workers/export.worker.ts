import { ExportRequest, ExportResponse } from "../lib/types";
import {
  computeCenterCropRect,
  computeOutputSize,
  scanHasAlpha,
  chooseOutputFormat,
  outputExtension,
} from "../lib/cropMath";
import { getWorkerSelf } from "../lib/workerGlobal";

const workerSelf = getWorkerSelf();

workerSelf.onmessage = async (ev: MessageEvent<ExportRequest>) => {
  const { id, file, mime, originalName, aspectW, aspectH, maxDimension, quality } = ev.data;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    const cropRect = computeCenterCropRect(bitmap.width, bitmap.height, aspectW, aspectH);
    const outSize = computeOutputSize(cropRect.w, cropRect.h, maxDimension);

    const canvas = new OffscreenCanvas(outSize.w, outSize.h);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(
      bitmap,
      cropRect.x,
      cropRect.y,
      cropRect.w,
      cropRect.h,
      0,
      0,
      outSize.w,
      outSize.h
    );

    // JPEG/HEIC(->JPEG) sources are guaranteed opaque; only PNG/WebP pay
    // for the alpha scan.
    const hasAlpha = mime === "image/png" || mime === "image/webp" ? scanHasAlpha(ctx, outSize.w, outSize.h) : false;
    const format = chooseOutputFormat(mime, hasAlpha);
    const blob = await canvas.convertToBlob(
      format === "image/jpeg" ? { type: format, quality } : { type: format }
    );

    bitmap.close();

    const base = originalName.replace(/\.[a-z0-9]+$/i, "");
    const filename = `${base}.${outputExtension(format)}`;

    const response: ExportResponse = { id, ok: true, filename, blob };
    workerSelf.postMessage(response);
  } catch (err) {
    bitmap?.close();
    const response: ExportResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    workerSelf.postMessage(response);
  }
};
