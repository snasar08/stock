export type SupportedMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "image/bmp"
  | "image/avif"
  | "image/heic"
  | "image/heif";

export const EXT_TO_MIME: Record<string, SupportedMime> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
};

export interface IntakeFile {
  id: string;
  file: File;
  relativePath: string;
  mime: SupportedMime;
}

export type SkipReason =
  | "unsupported-type"
  | "decode-error"
  | "too-large"
  | "empty-file";

export interface SkippedFile {
  relativePath: string;
  reason: SkipReason;
  detail?: string;
}

export interface ScanResult {
  id: string;
  hashHi: number;
  hashLo: number;
  width: number;
  height: number;
  thumbnailBlob: Blob;
}

export interface ScanFailure {
  id: string;
  error: string;
}

export interface DuplicateCluster {
  clusterId: number;
  memberIds: string[];
  keptIds: Set<string>;
}

export interface CropConfig {
  aspectW: number | null;
  aspectH: number | null;
  maxDimension: number; // 0 means "original, no resize"
  quality: number;
}

export interface ExportProgress {
  completed: number;
  total: number;
  currentName: string;
}

export type Phase = "upload" | "review" | "configure" | "process";

// ---- Worker message contracts ----

export interface ScanRequest {
  id: string;
  file: File | Blob;
  mime: SupportedMime;
  thumbnailSize: number;
}

export interface ScanResponseOk {
  id: string;
  ok: true;
  hashHi: number;
  hashLo: number;
  width: number;
  height: number;
  thumbnailBlob: Blob;
}

export interface ScanResponseErr {
  id: string;
  ok: false;
  error: string;
}

export type ScanResponse = ScanResponseOk | ScanResponseErr;

export interface ExportRequest {
  id: string;
  file: File | Blob;
  mime: SupportedMime;
  originalName: string;
  aspectW: number;
  aspectH: number;
  maxDimension: number;
  quality: number;
}

export interface ExportResponseOk {
  id: string;
  ok: true;
  filename: string;
  blob: Blob;
}

export interface ExportResponseErr {
  id: string;
  ok: false;
  error: string;
}

export type ExportResponse = ExportResponseOk | ExportResponseErr;

export interface ClusterHashEntry {
  id: string;
  hashHi: number;
  hashLo: number;
}

export interface ClusterRequest {
  entries: ClusterHashEntry[];
  thresholdBits: number;
}

export interface ClusterResponse {
  clusters: { clusterId: number; memberIds: string[] }[];
}
