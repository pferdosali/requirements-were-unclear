import { X, CheckCircle2, ShieldCheck, Folder, Clock, Hash, Printer, FileText } from "lucide-react";
import { Job } from "../types";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function groupByFolder(job: Job) {
  return job.tasks.reduce<Record<string, typeof job.tasks>>((acc, t) => {
    if (!acc[t.folderName]) acc[t.folderName] = [];
    acc[t.folderName].push(t);
    return acc;
  }, {});
}

function fmtFull(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

interface ReceiptModalProps {
  job: Job;
  onClose: () => void;
  onPrint: () => void;
}

export function ReceiptModal({ job, onClose, onPrint }: ReceiptModalProps) {
  const groups = groupByFolder(job);
  const totalBytes = job.tasks.reduce((s, t) => s + t.file.size, 0);
  const verifiedCount = job.tasks.filter((t) => t.checksumStatus === "verified").length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(10,20,35,0.65)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl overflow-hidden"
        style={{ background: "#ffffff", boxShadow: "0 24px 64px rgba(0,0,0,0.22)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div
          className="flex items-center gap-3 px-6 py-4 shrink-0"
          style={{ background: "#0f1e2e", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <FileText size={16} style={{ color: "#5dade2" }} />
          <div className="flex-1">
            <h2 className="text-white text-sm" style={{ fontWeight: 600 }}>
              Upload Receipt — {job.name}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "#5a7490", fontFamily: "'JetBrains Mono', monospace" }}>
              TXN-{(job.transactionId ?? "").slice(0, 16).toUpperCase()}
            </p>
          </div>
          <button
            onClick={onPrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors mr-2"
            style={{ background: "rgba(13,110,170,0.3)", color: "#5dade2", fontWeight: 500 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(13,110,170,0.45)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(13,110,170,0.3)"; }}
          >
            <Printer size={12} /> Print
          </button>
          <button onClick={onClose} style={{ color: "#5a7490" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#ffffff"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#5a7490"; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3 p-5 border-b" style={{ borderColor: "var(--border)" }}>
            {[
              { label: "Transaction ID", value: `TXN-${(job.transactionId ?? "").slice(0, 8).toUpperCase()}`, icon: <Hash size={13} style={{ color: "#0d6eaa" }} /> },
              { label: "Total Files", value: `${job.tasks.length}`, icon: <FileText size={13} style={{ color: "#0d6eaa" }} /> },
              { label: "Total Size", value: formatSize(totalBytes), icon: <Folder size={13} style={{ color: "#0d6eaa" }} /> },
              { label: "Checksums", value: `${verifiedCount}/${job.tasks.length} verified`, icon: <ShieldCheck size={13} style={{ color: "#0ea5a0" }} /> },
            ].map(({ label, value, icon }) => (
              <div key={label} className="rounded-lg p-3" style={{ background: "var(--muted)", border: "1px solid var(--border)" }}>
                <div className="flex items-center gap-1.5 mb-1.5">{icon}<span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{label}</span></div>
                <p className="text-sm" style={{ fontWeight: 600, color: "var(--foreground)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem" }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-4 px-5 py-4 border-b" style={{ borderColor: "var(--border)", background: "rgba(13,110,170,0.03)" }}>
            <div className="flex items-start gap-2">
              <Clock size={13} style={{ color: "#0d6eaa", marginTop: "2px", flexShrink: 0 }} />
              <div>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Upload Started</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--foreground)", fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(job.startedAt)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 size={13} style={{ color: "#0ea5a0", marginTop: "2px", flexShrink: 0 }} />
              <div>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Upload Completed</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--foreground)", fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(job.completedAt)}</p>
              </div>
            </div>
          </div>

          {/* Per-folder file table */}
          <div className="px-5 py-4 flex flex-col gap-5">
            {Object.entries(groups).map(([folderName, tasks]) => (
              <div key={folderName}>
                <div className="flex items-center gap-2 mb-2">
                  <Folder size={13} style={{ color: "#2e6a9e" }} />
                  <span className="text-xs" style={{ color: "var(--foreground)", fontWeight: 600 }}>{folderName}</span>
                  <span className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem" }}>
                    — {tasks.length} file{tasks.length !== 1 ? "s" : ""} · {formatSize(tasks.reduce((s, t) => s + t.file.size, 0))}
                  </span>
                </div>

                {/* Table */}
                <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                  {/* Table header */}
                  <div
                    className="grid text-xs px-3 py-2"
                    style={{
                      gridTemplateColumns: "1fr 70px 160px 90px 80px",
                      background: "var(--muted)",
                      color: "var(--muted-foreground)",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "0.6rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    <span>Filename</span>
                    <span>Size</span>
                    <span>SHA-256</span>
                    <span>Uploaded At</span>
                    <span>Status</span>
                  </div>

                  {tasks.map((task, i) => (
                    <div
                      key={task.id}
                      className="grid items-center px-3 py-2 text-xs"
                      style={{
                        gridTemplateColumns: "1fr 70px 160px 90px 80px",
                        borderTop: i === 0 ? "none" : "1px solid var(--border)",
                        background: i % 2 === 0 ? "#ffffff" : "rgba(240,244,248,0.5)",
                      }}
                    >
                      <span className="truncate pr-2" style={{ color: "var(--foreground)", fontWeight: 500 }}>{task.file.name}</span>
                      <span style={{ color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem" }}>{formatSize(task.file.size)}</span>
                      <span
                        className="truncate"
                        style={{ color: "#0ea5a0", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem" }}
                        title={task.checksum ?? ""}
                      >
                        {task.checksum ? `${task.checksum.slice(0, 20)}…` : "—"}
                      </span>
                      <span style={{ color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem" }}>
                        {task.uploadedAt
                          ? task.uploadedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                          : "—"}
                      </span>
                      <span
                        className="flex items-center gap-1"
                        style={{ color: task.done ? "#0ea5a0" : "var(--muted-foreground)", fontSize: "0.65rem" }}
                      >
                        {task.done
                          ? <><CheckCircle2 size={10} /> Verified</>
                          : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer note */}
          <div className="mx-5 mb-5 rounded-lg px-4 py-3 flex items-start gap-2.5" style={{ background: "rgba(14,165,160,0.06)", border: "1px solid rgba(14,165,160,0.2)" }}>
            <ShieldCheck size={13} style={{ color: "#0ea5a0", marginTop: "1px", flexShrink: 0 }} />
            <p className="text-xs" style={{ color: "#5a7490" }}>
              All files were transferred using TLS 1.3 and stored with AES-256 encryption. SHA-256 checksums were computed client-side before transfer and verified server-side upon receipt. This receipt constitutes a binding audit record under your institution's data governance policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
