"use client";

import { useState } from "react";
import { readApiResponse } from "@/lib/api-response";

export function ProjectOwnerActions({
  projectId,
  initialStatus,
}: {
  projectId: number;
  initialStatus: "draft" | "published";
}) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function changeStatus(nextStatus: "draft" | "published") {
    const label = nextStatus === "draft" ? "下架" : "重新展示";
    if (!window.confirm(`确定${label}这个作品吗？`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/visibility`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const result = await readApiResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error ?? "操作失败");
      setStatus(nextStatus);
      if (nextStatus === "draft") window.location.href = "/work";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return <div className="project-owner-actions">
    {status === "published"
      ? <button type="button" className="danger" disabled={busy} onClick={() => changeStatus("draft")}>{busy ? "处理中…" : "下架作品"}</button>
      : <button type="button" disabled={busy} onClick={() => changeStatus("published")}>{busy ? "处理中…" : "重新展示作品"}</button>}
    {error ? <small role="alert">{error}</small> : null}
  </div>;
}
