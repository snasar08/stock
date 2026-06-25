import { IntakeFile, CropConfig, ExportRequest, ExportResponse } from "./types";
import { WorkerPool } from "./workerPool";
import { prepareSourceForWorker } from "./imageDecode";
import { ZipEntryInput } from "./zipExport";

export const EXPORT_CHUNK_SIZE = 250;

interface SettledExport {
  ok: boolean;
  name: string;
  blob?: Blob;
  error?: string;
}

// Async generator so client-zip can stream entries into the archive as each
// chunk finishes, instead of buffering all encoded photos in memory first.
export async function* runExportPipeline(
  files: IntakeFile[],
  cropConfig: CropConfig,
  pool: WorkerPool<ExportRequest, ExportResponse>,
  onProgress: (completed: number, total: number, currentName: string) => void,
  onError: (name: string, error: string) => void
): AsyncGenerator<ZipEntryInput> {
  let completed = 0;

  for (let start = 0; start < files.length; start += EXPORT_CHUNK_SIZE) {
    const chunk = files.slice(start, start + EXPORT_CHUNK_SIZE);
    const settled = await Promise.all(
      chunk.map(async (f): Promise<SettledExport> => {
        const baseName = f.relativePath.split("/").pop() || f.file.name;
        try {
          const { blob, mime } = await prepareSourceForWorker(f.id, f.file, f.mime);
          const req: ExportRequest = {
            id: f.id,
            file: blob,
            mime,
            originalName: baseName,
            aspectW: cropConfig.aspectW as number,
            aspectH: cropConfig.aspectH as number,
            maxDimension: cropConfig.maxDimension,
            quality: cropConfig.quality,
          };
          const res = await pool.run(req);
          completed++;
          onProgress(completed, files.length, baseName);
          if (res.ok) return { ok: true, name: res.filename, blob: res.blob };
          return { ok: false, name: baseName, error: res.error };
        } catch (err) {
          completed++;
          onProgress(completed, files.length, baseName);
          return { ok: false, name: baseName, error: err instanceof Error ? err.message : String(err) };
        }
      })
    );

    for (const item of settled) {
      if (item.ok && item.blob) {
        yield { name: item.name, input: item.blob };
      } else {
        onError(item.name, item.error ?? "unknown error");
      }
    }
  }
}
