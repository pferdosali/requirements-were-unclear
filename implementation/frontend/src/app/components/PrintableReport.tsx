import { useEffect } from "react";
import { Job } from "../types";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtFull(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function groupByFolder(job: Job) {
  return job.tasks.reduce<Record<string, typeof job.tasks>>((acc, t) => {
    if (!acc[t.folderName]) acc[t.folderName] = [];
    acc[t.folderName].push(t);
    return acc;
  }, {});
}

interface PrintableReportProps {
  jobs: Job[];
  onClose: () => void;
}

export function PrintableReport({ jobs, onClose }: PrintableReportProps) {
  const completedJobs = jobs.filter((j) => j.status === "complete");
  const reportDate = new Date();

  useEffect(() => {
    // Short delay to allow render before print dialog
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      {/* Print styles injected via style tag */}
      <style>{`
        @media print {
          body > *:not(#clinvault-print-root) { display: none !important; }
          #clinvault-print-root { display: block !important; position: static !important; }
          .no-print { display: none !important; }
          @page { margin: 18mm 16mm; size: A4; }
        }
        @media screen {
          #clinvault-print-root {
            position: fixed; inset: 0; z-index: 9999;
            background: rgba(10,20,35,0.7);
            display: flex; align-items: flex-start; justify-content: center;
            overflow-y: auto; padding: 32px 16px;
          }
        }
      `}</style>

      <div id="clinvault-print-root">
        {/* Screen overlay close button */}
        <div
          className="no-print fixed inset-0 z-[-1]"
          onClick={onClose}
        />

        <div
          style={{
            background: "#ffffff",
            width: "100%",
            maxWidth: "800px",
            padding: "40px 48px",
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: "12px",
            color: "#0f1e2e",
            position: "relative",
          }}
        >
          {/* Close button (screen only) */}
          <button
            className="no-print"
            onClick={onClose}
            style={{
              position: "absolute", top: "16px", right: "16px",
              background: "#0d6eaa", color: "#fff", border: "none",
              borderRadius: "4px", padding: "6px 14px", cursor: "pointer",
              fontWeight: 600, fontSize: "12px",
            }}
          >
            ✕ Close
          </button>

          {/* Report header */}
          <div style={{ borderBottom: "2px solid #0d6eaa", paddingBottom: "16px", marginBottom: "24px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f1e2e", letterSpacing: "-0.01em" }}>
                  ClinVault
                </div>
                <div style={{ fontSize: "11px", color: "#5a7490", marginTop: "2px" }}>
                  Clinical Research Data Repository
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f1e2e" }}>
                  Upload Confirmation Report
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "#5a7490", marginTop: "3px" }}>
                  Generated: {fmtFull(reportDate)}
                </div>
              </div>
            </div>
          </div>

          {/* Summary row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: "12px",
              marginBottom: "28px",
            }}
          >
            {[
              { label: "Total Jobs", value: String(completedJobs.length) },
              { label: "Total Files", value: String(completedJobs.reduce((s, j) => s + j.tasks.length, 0)) },
              {
                label: "Total Volume",
                value: formatSize(completedJobs.reduce((s, j) => s + j.tasks.reduce((ss, t) => ss + t.file.size, 0), 0)),
              },
              {
                label: "Checksums Verified",
                value: `${completedJobs.reduce((s, j) => s + j.tasks.filter((t) => t.checksumStatus === "verified").length, 0)} / ${completedJobs.reduce((s, j) => s + j.tasks.length, 0)}`,
              },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{ background: "#f0f4f8", border: "1px solid #d8e4ef", borderRadius: "6px", padding: "10px 12px" }}
              >
                <div style={{ fontSize: "9px", color: "#5a7490", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
                  {label}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", fontWeight: 700, color: "#0f1e2e" }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Jobs */}
          {completedJobs.map((job, jobIdx) => {
            const groups = groupByFolder(job);
            const totalBytes = job.tasks.reduce((s, t) => s + t.file.size, 0);
            return (
              <div
                key={job.id}
                style={{
                  marginBottom: "28px",
                  pageBreakInside: "avoid",
                  border: "1px solid #d8e4ef",
                  borderRadius: "8px",
                  overflow: "hidden",
                }}
              >
                {/* Job header */}
                <div
                  style={{
                    background: "#0f1e2e",
                    color: "#ffffff",
                    padding: "10px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, fontSize: "13px" }}>{job.name}</span>
                    <span
                      style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", color: "#5dade2", marginLeft: "12px" }}
                    >
                      TXN-{(job.transactionId ?? "").slice(0, 16).toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", color: "#8ab0cc", textAlign: "right" }}>
                    <div>Started: {fmtFull(job.startedAt)}</div>
                    <div>Completed: {fmtFull(job.completedAt)}</div>
                  </div>
                </div>

                {/* Job summary bar */}
                <div
                  style={{
                    background: "#e8f0f8",
                    padding: "6px 16px",
                    display: "flex",
                    gap: "24px",
                    fontSize: "10px",
                    color: "#3d5a72",
                    fontFamily: "'JetBrains Mono', monospace",
                    borderBottom: "1px solid #d8e4ef",
                  }}
                >
                  <span>{Object.keys(groups).length} destination folder{Object.keys(groups).length !== 1 ? "s" : ""}</span>
                  <span>{job.tasks.length} file{job.tasks.length !== 1 ? "s" : ""}</span>
                  <span>{formatSize(totalBytes)}</span>
                  <span>{job.tasks.filter((t) => t.checksumStatus === "verified").length}/{job.tasks.length} checksums verified</span>
                </div>

                {/* Folder groups */}
                {Object.entries(groups).map(([folderName, tasks], fi) => (
                  <div key={folderName} style={{ borderTop: fi === 0 ? "none" : "1px solid #e8edf2" }}>
                    {/* Folder label */}
                    <div
                      style={{
                        background: "#f7fafd",
                        padding: "6px 16px",
                        fontSize: "10px",
                        fontWeight: 600,
                        color: "#0d6eaa",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        borderBottom: "1px solid #e8edf2",
                      }}
                    >
                      📁 {folderName}
                      <span style={{ fontWeight: 400, color: "#5a7490" }}>
                        — {tasks.length} file{tasks.length !== 1 ? "s" : ""} · {formatSize(tasks.reduce((s, t) => s + t.file.size, 0))}
                      </span>
                    </div>

                    {/* File table */}
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                      <thead>
                        <tr style={{ background: "#f0f4f8" }}>
                          {["#", "Filename", "Size", "SHA-256 Checksum", "Uploaded At", "Status"].map((h) => (
                            <th
                              key={h}
                              style={{
                                padding: "5px 10px",
                                textAlign: "left",
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: "8px",
                                color: "#5a7490",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                fontWeight: 600,
                                borderBottom: "1px solid #d8e4ef",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.map((task, ti) => (
                          <tr
                            key={task.id}
                            style={{ background: ti % 2 === 0 ? "#ffffff" : "#f7fafd" }}
                          >
                            <td style={{ padding: "5px 10px", color: "#5a7490", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>
                              {ti + 1}
                            </td>
                            <td style={{ padding: "5px 10px", fontWeight: 500, color: "#0f1e2e", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {task.file.name}
                            </td>
                            <td style={{ padding: "5px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", color: "#3d5a72", whiteSpace: "nowrap" }}>
                              {formatSize(task.file.size)}
                            </td>
                            <td style={{ padding: "5px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: "8px", color: "#0ea5a0", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {task.checksum ?? "—"}
                            </td>
                            <td style={{ padding: "5px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", color: "#3d5a72", whiteSpace: "nowrap" }}>
                              {task.uploadedAt
                                ? task.uploadedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                                : "—"}
                            </td>
                            <td style={{ padding: "5px 10px", color: task.checksumStatus === "verified" ? "#0ea5a0" : "#c0392b", fontWeight: 600, fontSize: "9px" }}>
                              {task.checksumStatus === "verified" ? "✓ Verified" : "Pending"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            );
          })}

          {/* Report footer */}
          <div
            style={{
              borderTop: "1px solid #d8e4ef",
              paddingTop: "16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              fontSize: "9px",
              color: "#5a7490",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, marginBottom: "2px" }}>ClinVault v2.4.1 — Secure Clinical Data Repository</div>
              <div>AES-256 encryption at rest · TLS 1.3 in transit · SHA-256 checksum validation · HIPAA compliant</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div>Report generated: {fmtFull(reportDate)}</div>
              <div style={{ marginTop: "2px" }}>This document constitutes an official upload audit record.</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
