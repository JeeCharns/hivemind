"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "@phosphor-icons/react";
import Button from "@/components/button";

type ConversationType = "understand" | "decide";

export default function NewSessionWizard({
  open,
  onClose,
  hiveId,
  hiveSlug,
}: {
  open: boolean;
  onClose: () => void;
  hiveId: string;
  hiveSlug?: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [type, setType] = useState<ConversationType>("understand");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "uploaded" | "error"
  >("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setWizardError(null);
    setConversationId(null);
    setTitle("");
    setDescription("");
    setFile(null);
    setUploadStatus("idle");
    setUploadError(null);
    setTitleError(null);
    setTypeError(null);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-[800px] px-6 md:px-10 py-8 flex flex-col gap-6 mx-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[#566888]">Step {step} of 2</p>
            <h2 className="text-2xl font-semibold text-[#172847]">
              {step === 1 ? "Create your session" : "Import data (optional)"}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-sm text-[#566888] hover:text-[#172847]"
            onClick={onClose}
          >
            Close
          </Button>
        </div>

        {wizardError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {wizardError}
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    key: "understand",
                    title: "Understand a Problem",
                    desc: "Collect signals to clarify a problem space.",
                  },
                  {
                    key: "decide",
                    title: "Make a Decision",
                    desc: "Gather inputs to choose between options.",
                  },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setType(opt.key as ConversationType)}
                    className={`w-full rounded-xl border p-4 flex flex-col items-start gap-1 text-left transition ${
                      type === opt.key
                        ? "border-[#3A1DC8] bg-[#EDEFFD]"
                        : "border-slate-200 hover:border-[#cbd5f5]"
                    }`}
                  >
                    <span className="text-base font-semibold text-[#172847]">
                      {opt.title}
                    </span>
                    <span className="text-sm text-[#566888]">{opt.desc}</span>
                  </button>
                ))}
              </div>

              {typeError && (
                <div className="text-sm text-red-600">{typeError}</div>
              )}

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 w-full">
                  <label className="text-sm font-medium text-[#172847]">
                    Session title{" "}
                    <span className="text-red-600 text-xs">*</span>
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full"
                    placeholder="e.g., Align on Q3 focus"
                  />
                  {titleError && (
                    <span className="text-xs text-red-600">{titleError}</span>
                  )}
                </div>
                <div className="flex flex-col gap-2 w-full">
                  <label className="text-sm font-medium text-[#172847]">
                    Description
                  </label>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full"
                    placeholder="What is this session about?"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={!title.trim() || loading}
                onClick={async () => {
                  setWizardError(null);
                  setTitleError(null);
                  setTypeError(null);
                  setLoading(true);
                  try {
                    if (!title.trim()) {
                      setTitleError("A session title is required.");
                    }
                    if (!type) {
                      setTypeError("Select a session type.");
                    }
                    if (!title.trim() || !type) {
                      setLoading(false);
                      return;
                    }
                    const res = await fetch("/api/conversations", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        hiveId,
                        type,
                        title: title.trim(),
                        description: description.trim(),
                      }),
                    });
                    if (!res.ok) {
                      const body = await res.json().catch(() => null);
                      throw new Error(
                        body?.error ?? "Failed to create session"
                      );
                    }
                    const body = await res.json();
                    setConversationId(body.id);
                    setStep(2);
                  } catch (err) {
                    const message =
                      err instanceof Error
                        ? err.message
                        : "Failed to create session";
                    setWizardError(message);
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <p className="text-sm text-[#566888]">
                  Optionally import a CSV to pre-populate responses and the live
                  feed.
                </p>
              </div>

              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const files = e.dataTransfer.files;
                  if (!files || files.length === 0) return;
                  const selected = files[0];
                  if (!selected.name.toLowerCase().endsWith(".csv")) {
                    setUploadError("Only .csv files are supported");
                    setFile(null);
                    setUploadStatus("idle");
                    return;
                  }
                  setFile(selected);
                  setUploadError(null);
                  setUploadStatus("idle");
                }}
                className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-200 rounded-xl px-6 py-10 cursor-pointer hover:border-indigo-300 transition"
              >
                <div className="p-3 rounded-full bg-slate-100 text-slate-500">
                  <PlusIcon size={24} />
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
                  onChange={(e) => {
                    const files = e.target.files;
                    if (!files || files.length === 0) return;
                    const selected = files[0];
                    if (!selected.name.toLowerCase().endsWith(".csv")) {
                      setUploadError("Only .csv files are supported");
                      setFile(null);
                      setUploadStatus("idle");
                      return;
                    }
                    setFile(selected);
                    setUploadError(null);
                    setUploadStatus("idle");
                  }}
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
                  <span className="font-medium">{file.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFile(null)}
                  >
                    Remove
                  </Button>
                </div>
              )}

              {uploadError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {uploadError}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-4">
              <Button
                variant="ghost"
                size="sm"
                className="text-[#566888]"
                onClick={() => setStep(1)}
              >
                ← Back
              </Button>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!conversationId) {
                      setWizardError("Create the session first.");
                      return;
                    }
                    onClose();
                    router.push(
                      `/hives/${
                        hiveSlug ?? hiveId
                      }/conversations/${conversationId}/listen`
                    );
                  }}
                >
                  Skip import
                </Button>
                <Button
                  disabled={
                    !conversationId || loading || uploadStatus === "uploading"
                  }
                  onClick={async () => {
                    if (!conversationId || !file) {
                      onClose();
                      router.push(
                        `/hives/${hiveSlug ?? hiveId}/conversations/${
                          conversationId ?? ""
                        }/listen`
                      );
                      return;
                    }
                    setLoading(true);
                    setUploadStatus("uploading");
                    setUploadError(null);
                    try {
                      const formData = new FormData();
                      formData.append("file", file);
                      const res = await fetch(
                        `/api/conversations/${conversationId}/upload`,
                        { method: "POST", body: formData }
                      );
                      if (!res.ok) {
                        const body = await res.json().catch(() => null);
                        throw new Error(body?.error ?? "Upload failed");
                      }
                      // Kick off analysis immediately after upload
                      fetch(`/api/conversations/${conversationId}/analyze`, {
                        method: "POST",
                      }).catch(() => null);
                      setUploadStatus("uploaded");
                      onClose();
                      router.push(
                        `/hives/${
                          hiveSlug ?? hiveId
                        }/conversations/${conversationId}/listen`
                      );
                    } catch (err) {
                      const message =
                        err instanceof Error ? err.message : "Upload failed";
                      setUploadStatus("error");
                      setUploadError(message);
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  {uploadStatus === "uploading" ? "Uploading…" : "Finish"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
