"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Segment, Meta, writeTxt, writeJson, writeSrt, writeXml } from "@/lib/format";
import { addSpeakersGap } from "@/lib/speakers";

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
      setStatus("Uploading…");
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/blob-upload",
      });

      setStatus("Converting audio…");
      const probeRes = await fetch("/api/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl: blob.url }),
      });
      if (!probeRes.ok) throw new Error((await probeRes.json()).error || "Probe failed");
      const { duration, totalChunks } = await probeRes.json();

      let allSegments: Segment[] = [];
      let nextIndex = 0;

      for (let i = 0; i < totalChunks; i++) {
        setStatus(`Transcribing chunk ${i + 1} of ${totalChunks}`);
        setProgress(Math.round(((i + 0.5) / totalChunks) * 90));

        const chunkRes = await fetch("/api/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blobUrl: blob.url,
            chunkIndex: i,
            duration,
            startIndex: nextIndex,
          }),
        });
        if (!chunkRes.ok) {
          throw new Error((await chunkRes.json()).error || "Chunk transcription failed");
        }
        const { segments, nextIndex: ni } = await chunkRes.json();
        allSegments = allSegments.concat(segments);
        nextIndex = ni;
      }

      setProgress(92);
      setStatus("Detecting speakers…");
      allSegments = addSpeakersGap(allSegments);

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
