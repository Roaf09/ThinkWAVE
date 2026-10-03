/* FILE GUIDE:
 * client/src/lib/exportJobs.js
 * Purpose: Async export flow — POST a job, poll until DONE, download the file.
 * Falls back to the direct blob download if the jobs endpoint is unavailable
 * (guest hosts, old server), so export buttons never hard-break.
 */
import { api } from "./api";

const POLL_MS = 2000;
const MAX_POLLS = 60; // ~2 minutes max build time

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function triggerBlobDownload(blob, fileName, mime) {
  const url = URL.createObjectURL(new Blob([blob], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function directDownload(urlPath, fileName, mime) {
  const resp = await api.get(urlPath, { responseType: "blob" });
  triggerBlobDownload(resp.data, fileName, mime);
}

/**
 * Run an export via the async jobs API with sync fallback.
 * kind: "SESSION" | "ASYNC". identifiers: { sessionId } or { classId, quizId }.
 * onStatus("preparing" | "building") lets buttons show progress text.
 */
export async function downloadExportJob({ kind, format, sessionId, classId, quizId, fileName, onStatus }) {
  const mime = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const assigned = kind === "ASYNC";
  const fallbackPath = assigned
    ? `/classes/${classId}/async-results/${quizId}/export/${format}`
    : `/analytics/sessions/${sessionId}/export/${format}`;

  let jobId = null;
  try {
    const body = assigned
      ? { kind, format, classId: Number(classId), quizId: Number(quizId) }
      : { kind, format, sessionId: Number(sessionId) };
    const { data } = await api.post("/exports", body);
    jobId = Number(data?.jobId || 0);
    if (!jobId) throw new Error("no job id");
  } catch (err) {
    // Jobs endpoint missing/forbidden (guest, old server) — old direct path.
    if (err?.response?.status === 404 || err?.response?.status === 403) {
      await directDownload(fallbackPath, fileName, mime);
      return { via: "direct" };
    }
    throw err;
  }

  onStatus?.("preparing");
  for (let i = 0; i < MAX_POLLS; i += 1) {
    await sleep(i === 0 ? 1500 : POLL_MS);
    const { data } = await api.get(`/exports/${jobId}`);
    if (data?.status === "DONE" && data?.downloadUrl) {
      onStatus?.("building");
      // downloadUrl from server is /api/exports/:id/download but api already prefixes /api.
      const path = String(data.downloadUrl || "").replace(/^\/api/, "") || `/exports/${jobId}/download`;
      const resp = await api.get(path, { responseType: "blob" });
      triggerBlobDownload(resp.data, data.fileName || fileName, mime);
      return { via: "async" };
    }
    if (data?.status === "FAILED") {
      throw new Error(data?.error || "Export failed. Please try again.");
    }
    onStatus?.("preparing");
  }
  throw new Error("Export is taking too long. Please try again shortly.");
}
