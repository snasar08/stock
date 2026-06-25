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
  const { id, file, mime, originalName, aspectW, aspectH, maxDimension, quality, filterCss, frameRectNorm } = ev.data;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    // frameRectNorm (when present) carves out a sub-rect of the original
    // bitmap first — e.g. the inner photo inside a detected border. The
    // aspect crop must then be computed *within* that sub-rect's own
    // coordinate space (computeCenterCropRect's returned x/y are relative to
    // whatever srcW/srcH it's given), then translated back into the
    // original bitmap's coordinates by adding the sub-rect's own offset.
    const frameRect = frameRectNorm
      ? {
          x: Math.round(frameRectNorm.x * bitmap.width),
          y: Math.round(frameRectNorm.y * bitmap.height),
          w: Math.round(frameRectNorm.w * bitmap.width),
          h: Math.round(frameRectNorm.h * bitmap.height),
        }
      : { x: 0, y: 0, w: bitmap.width, h: bitmap.height };

    const innerCrop = computeCenterCropRect(frameRect.w, frameRect.h, aspectW, aspectH);
    const cropRect = {
      x: frameRect.x + innerCrop.x,
      y: frameRect.y + innerCrop.y,
      w: innerCrop.w,
      h: innerCrop.h,
    };
    const outSize = computeOutputSize(cropRect.w, cropRect.h, maxDimension);

    const canvas = new OffscreenCanvas(outSize.w, outSize.h);
    const ctx = canvas.getContext("2d")!;
    if (filterCss && filterCss !== "none") ctx.filter = filterCss;
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
