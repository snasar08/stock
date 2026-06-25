"use client";

import { useRef, useState } from "react";
import { Segment, Meta, writeTxt, writeJson, writeSrt, writeXml } from "@/lib/format";

interface DownloadFile {
  name: string;
  url: string;
}

export default function Page() {
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragover, setDragover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<DownloadFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setDownloads([]);
    setProgress(0);

    try {
      const CHUNK_SIZE = 4 * 1024 * 1024;
      const uploadId = crypto.randomUUID();
      const uploadChunkCount = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
      const priorUrls: string[] = [];
      let blobUrl = "";

      for (let i = 0; i < uploadChunkCount; i++) {
        setStatus(`Uploading chunk ${i + 1} of ${uploadChunkCount}`);
        setProgress(Math.round(((i + 0.5) / uploadChunkCount) * 10));

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const formData = new FormData();
        formData.append("uploadId", uploadId);
        formData.append("index", String(i));
        formData.append("total", String(uploadChunkCount));
        formData.append("filename", file.name);
        formData.append("chunk", file.slice(start, end));
        formData.append("priorUrls", JSON.stringify(priorUrls));

        const uploadRes = await fetch("/api/blob-upload", { method: "POST", body: formData });
        if (!uploadRes.ok) throw new Error((await uploadRes.json()).error || "Upload chunk failed");
        const uploadJson = await uploadRes.json();

        if (uploadJson.done) {
          blobUrl = uploadJson.url;
        } else {
          priorUrls.push(uploadJson.url);
        }
      }

      setStatus("Upload complete, starting transcription…");
      const probeRes = await fetch("/api/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl }),
      });
      if (!probeRes.ok) throw new Error((await probeRes.json()).error || "Probe failed");
      const { duration, totalChunks } = await probeRes.json();
      setStatus("Converting audio…");

      let allSegments: Segment[] = [];
      let nextIndex = 0;
      let lastSpeaker = "Speaker 1";
      let lastEnd = 0;

      for (let i = 0; i < totalChunks; i++) {
        setStatus(`Transcribing chunk ${i + 1} of ${totalChunks}`);
        setProgress(10 + Math.round(((i + 0.5) / totalChunks) * 80));

        const chunkRes = await fetch("/api/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blobUrl,
            chunkIndex: i,
            duration,
            startIndex: nextIndex,
            lastSpeaker,
            lastEnd,
          }),
        });
        const chunkJson = await chunkRes.json();
        if (chunkRes.status === 429 && chunkJson.error === "rate_limit") {
          const retryAfter = chunkJson.retryAfter ?? 60;
          setStatus(`Rate limit hit, waiting ${retryAfter}s...`);
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          i--;
          continue;
        }
        if (!chunkRes.ok) {
          throw new Error(chunkJson.error || "Chunk transcription failed");
        }
        const { segments, nextIndex: ni, lastSpeaker: ls, lastEnd: le } = chunkJson;
        allSegments = allSegments.concat(segments);
        nextIndex = ni;
        lastSpeaker = ls;
        lastEnd = le;
      }

      setProgress(96);
      setStatus("Writing outputs…");
      const base = file.name.replace(/\.[^/.]+$/, "");
      const meta: Meta = {
        source: file.name,
        duration: Math.round(duration * 1000) / 1000,
        model: "whisper-large-v3-groq",
        fps: 30,
        language: "auto",
      };

      const files: DownloadFile[] = [
        { name: `${base}.txt`, content: writeTxt(allSegments) },
        { name: `${base}.json`, content: writeJson(allSegments, meta) },
        { name: `${base}.srt`, content: writeSrt(allSegments) },
        { name: `${base}.xml`, content: writeXml(allSegments, 30, meta) },
      ].map((f) => ({
        name: f.name,
        url: URL.createObjectURL(new Blob([f.content], { type: "text/plain" })),
      }));

      setDownloads(files);
      setProgress(100);
      setStatus("Done");
    } catch (err) {
      setError((err as Error).message);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragover(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <main>
      <h1>Momentum Transcribe</h1>
      <div
        className={`dropzone ${dragover ? "dragover" : ""} ${busy ? "busy" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragover(true);
        }}
        onDragLeave={() => setDragover(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className="dropzone-label">
          Drop an mp3 / m4a / wav file here
          <br />
          <span>or click to choose a file</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/m4a,.mp3,.m4a,.wav"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>
      <div className="status-area">
        <div className="status-text">{status}</div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        {error && <div className="error-text">{error}</div>}
        {downloads.length > 0 && (
          <div className="downloads">
            {downloads.map((d) => (
              <a key={d.name} href={d.url} download={d.name}>
                {d.name}
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
