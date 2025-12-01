"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UploadSimple, FileCsv } from "@phosphor-icons/react";

type UploadState =
  | "idle"
  | "file_selected"
  | "uploading"
  | "uploaded_success"
  | "upload_error";

type AnalysisStatus =
  | "not_started"
  | "embedding"
  | "analyzing"
  | "ready"
  | "error";

export default function ListenView({
  conversationId,
  hiveId,
  initialAnalysisStatus,
}: {
  conversationId: string;
  hiveId: string;
  initialAnalysisStatus: AnalysisStatus;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>(
    initialAnalysisStatus
  );
  const [isPending, startTransition] = useTransition();

  const handleFile = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selected = files[0];
    if (!selected.name.toLowerCase().endsWith(".csv")) {
      setError("Only .csv files are supported");
      setFile(null);
      setStatus("idle");
      return;
    }
    setFile(selected);
    setError(null);
    setStatus("file_selected");
  };

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files);
  };

  const upload = async () => {
    if (!file) return;
    setStatus("uploading");
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/conversations/${conversationId}/upload`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Upload failed");
      setStatus("upload_error");
      return;
    }

    setStatus("uploaded_success");
    setAnalysisStatus("embedding");

    // Kick off analysis
    startTransition(async () => {
      await fetch(`/api/conversations/${conversationId}/analyze`, {
        method: "POST",
      }).catch(() => null);
      setAnalysisStatus("analyzing");
      router.push(
        `/hives/${hiveId}/conversations/${conversationId}/understand`
      );
    });
  };

  const disabled = status === "uploading" || isPending;

  const analysisCopy: Record<AnalysisStatus, string> = {
    not_started: "Analysis has not been started.",
    embedding: "Analysis started: embedding responses…",
    analyzing: "Analysis running: clustering and labeling…",
    ready: "Analysis complete.",
    error: "Analysis failed. Retry from Listen or Understand.",
  };
  const showSpinner =
    analysisStatus === "embedding" || analysisStatus === "analyzing";

  return (
    <div className="space-y-6 pt-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-medium text-slate-900">Listen</h2>
          <p className="text-slate-600">
            Import responses to start clustering, summarizing, and tagging
            themes.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600 px-3 py-1 rounded-full bg-slate-100 border border-slate-200">
          {showSpinner && (
            <span className="inline-block w-4 h-4 aspect-square border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          )}
          <span>{analysisCopy[analysisStatus]}</span>
          {showSpinner && (
            <span className="text-xs text-slate-500">(usually ~30s)</span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-200 rounded-xl px-6 py-10 cursor-pointer hover:border-indigo-300 transition"
        >
          <div className="p-3 rounded-full bg-slate-100 text-slate-500">
            <FileCsv size={28} />
          </div>
          <div className="text-center">
            <p className="text-slate-900 font-medium">Drag & drop CSV</p>
            <p className="text-sm text-slate-500">
              or click to choose a CSV file
            </p>
          </div>
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files)}
          />
        </label>

        <div className="text-sm text-slate-600">
          <p>Requirements:</p>
          <ul className="list-disc list-inside text-slate-500">
            <li>Must include a column named &quot;response&quot;</li>
            <li>
              Optional column: &quot;tag&quot;
              (data/problem/need/want/risk/proposal)
            </li>
            <li>Up to 1000 rows</li>
          </ul>
        </div>

        {file && (
          <div className="flex items-center gap-3 text-sm text-slate-700">
            <UploadSimple size={18} className="text-indigo-600" />
            <span className="font-medium">{file.name}</span>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={upload}
            disabled={!file || disabled}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "uploading" ? "Uploading…" : "Upload & analyze"}
          </button>
        </div>

        {status === "uploaded_success" && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
            Import successful, starting analysis…
          </div>
        )}
      </div>
    </div>
  );
}
