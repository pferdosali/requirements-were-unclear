import { useState, useRef } from "react";
import {
  ChevronDown, ChevronRight, Upload, CheckCircle2, Loader2,
  Folder, X, Layers, Trash2, Receipt, ShieldCheck,
  FileText, Printer, Clock, Plus, BadgeCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Job, UploadTask } from "../types";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function totalSize(tasks: UploadTask[]) {
  return tasks.reduce((s, t) => s + t.file.size, 0);
}

function groupByFolder(tasks: UploadTask[]): Record<string, UploadTask[]> {
  return tasks.reduce<Record<string, UploadTask[]>>((acc, task) => {
    if (!acc[task.folderName]) acc[task.folderName] = [];
    acc[task.folderName].push(task);
    return acc;
  }, {});
}

function fmtTime(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ─── TaskRow ────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: UploadTask;
  jobStatus: Job["status"];
  onRemove?: () => void;
}

function TaskRow({ task, jobStatus, onRemove }: TaskRowProps) {
  return (
    <div
      className="rounded px-2.5 py-2 flex flex-col gap-1.5"
      style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
    >
      {/* Top row: name · size · timestamp · progress/done · remove */}
      <div className="flex items-center gap-2 min-w-0">
        <FileText size={12} style={{ color: "#0d6eaa", flexShrink: 0 }} />
        <span className="flex-1 truncate text-xs" style={{ color: "var(--foreground)", fontWeight: 500 }}>
          {task.file.name}
        </span>
        <span className="text-xs shrink-0" style={{ color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem" }}>
          {formatSize(task.file.size)}
        </span>
        {task.uploadedAt && (
          <span className="text-xs shrink-0" style={{ color: "#3d5a72", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem" }}>
            {fmtTime(task.uploadedAt)}
          </span>
        )}
        {task.done ? (
          <CheckCircle2 size={12} style={{ color: "#0ea5a0", flexShrink: 0 }} />
        ) : jobStatus === "uploading" ? (
          <div className="flex items-center gap-1 shrink-0" style={{ width: "72px" }}>
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.08)" }}>
              <div
                className="h-full rounded-full transition-all duration-100"
                style={{ width: `${task.progress}%`, background: "linear-gradient(90deg,#0d6eaa,#0ea5a0)" }}
              />
            </div>
            <span style={{ color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", width: "24px", textAlign: "right" }}>
              {Math.round(task.progress)}%
            </span>
          </div>
        ) : (
          onRemove ? (
            <button
              onClick={onRemove}
              style={{ color: "var(--muted-foreground)", flexShrink: 0 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#c0392b"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)"; }}
            >
              <X size={11} />
            </button>
          ) : null
        )}
      </div>

      {/* Integrity tag row */}
      {task.checksumStatus === "computing" && (
        <div className="flex items-center gap-1 pl-5">
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(93,173,226,0.12)", color: "#5dade2", fontSize: "0.6rem" }}>
            Validating integrity…
          </span>
        </div>
      )}
      {task.checksumStatus === "verified" && (
        <div className="flex items-center gap-2 pl-5 flex-wrap">
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(14,165,160,0.1)", color: "#0ea5a0", fontSize: "0.6rem", fontWeight: 500 }}>
            <BadgeCheck size={9} />
            File Integrity Verified
          </span>
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(13,110,170,0.08)", color: "#0d6eaa", fontSize: "0.6rem" }}>
            <ShieldCheck size={9} />
            Upload Validation Passed
          </span>
        </div>
      )}
    </div>
  );
}

// ─── JobCard ─────────────────────────────────────────────────────────────────

interface JobCardProps {
  job: Job;
  isActive: boolean;
  selectedFolderName: string | null;
  onSetActive: () => void;
  onUpload: () => void;
  onDelete: () => void;
  onRemoveTask: (taskId: string) => void;
  onViewReceipt: () => void;
  onAddFiles: (files: FileList) => void;
}

function JobCard({ job, isActive, selectedFolderName, onSetActive, onUpload, onDelete, onRemoveTask, onViewReceipt, onAddFiles }: JobCardProps) {
  // Accordion: expanded iff this is the selected job
  const expanded = isActive;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const groups = groupByFolder(job.tasks);
  const folderCount = Object.keys(groups).length;
  const completedCount = job.tasks.filter((t) => t.done).length;
  const overallProgress = job.tasks.length
    ? job.tasks.reduce((s, t) => s + t.progress, 0) / job.tasks.length
    : 0;

  const isStaging = job.status === "staging";
  const isUploading = job.status === "uploading";
  const isComplete = job.status === "complete";
  const accentColor = isComplete ? "#0ea5a0" : isUploading ? "#5dade2" : isActive ? "#0d6eaa" : "#3d5a72";

  return (
    <div
      className="rounded-lg overflow-hidden shrink-0"
      style={{
        border: isActive ? `1.5px solid ${accentColor}` : "1px solid var(--border)",
        background: "#ffffff",
        boxShadow: isActive ? `0 0 0 3px ${isComplete ? "rgba(14,165,160,0.07)" : "rgba(13,110,170,0.07)"}` : "none",
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files) { onAddFiles(e.target.files); } e.target.value = ""; }}
      />

      {/* ── Header: clicking makes this the active job ── */}
      <div
        className="flex items-center px-3 py-2 gap-2 cursor-pointer select-none"
        style={{ background: isActive ? "rgba(13,110,170,0.03)" : "transparent" }}
        onClick={onSetActive}
      >
        <span className="shrink-0">
          {expanded
            ? <ChevronDown size={12} style={{ color: "#5a7490" }} />
            : <ChevronRight size={12} style={{ color: "#5a7490" }} />}
        </span>

        <Layers size={12} style={{ color: accentColor, flexShrink: 0 }} />

        <span className="shrink-0 text-sm" style={{ color: "var(--foreground)", fontWeight: 600, minWidth: "52px" }}>
          {job.name}
        </span>

        {job.transactionId && (
          <span className="shrink-0 px-1.5 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem" }}>
            TXN-{job.transactionId.slice(0, 8).toUpperCase()}
          </span>
        )}

        {isUploading && (
          <div className="flex items-center gap-1.5 flex-1 min-w-0 mx-1">
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
              <div className="h-full rounded-full transition-all duration-200" style={{ width: `${overallProgress}%`, background: "linear-gradient(90deg,#0d6eaa,#0ea5a0)" }} />
            </div>
            <span className="shrink-0 text-xs" style={{ color: "#5dade2", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", width: "30px" }}>
              {Math.round(overallProgress)}%
            </span>
          </div>
        )}
        {!isUploading && <div className="flex-1" />}

        <span className="shrink-0 text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem" }}>
          {folderCount} dir · {job.tasks.length} file{job.tasks.length !== 1 ? "s" : ""} · {formatSize(totalSize(job.tasks))}
        </span>

        <span className="shrink-0 text-xs px-2 py-0.5 rounded" style={{ background: isComplete ? "rgba(14,165,160,0.1)" : isUploading ? "rgba(13,110,170,0.1)" : "var(--muted)", color: accentColor, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem" }}>
          {isComplete ? `${completedCount}/${job.tasks.length} done` : isUploading ? "uploading" : `${job.tasks.length} staged`}
        </span>

        {/* Action buttons — stop propagation so they don't toggle the accordion */}
        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {isStaging && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!selectedFolderName}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors"
                style={{ background: selectedFolderName ? "rgba(13,110,170,0.08)" : "var(--muted)", color: selectedFolderName ? "#0d6eaa" : "var(--muted-foreground)", fontWeight: 500, cursor: selectedFolderName ? "pointer" : "not-allowed", border: "1px solid", borderColor: selectedFolderName ? "rgba(13,110,170,0.2)" : "transparent" }}
                title={selectedFolderName ? `Add files → ${selectedFolderName}` : "Select a destination folder first"}
                onMouseEnter={(e) => { if (selectedFolderName) (e.currentTarget as HTMLElement).style.background = "rgba(13,110,170,0.15)"; }}
                onMouseLeave={(e) => { if (selectedFolderName) (e.currentTarget as HTMLElement).style.background = "rgba(13,110,170,0.08)"; }}
              >
                <Upload size={10} /> Upload Files
              </button>
              <button
                disabled={job.tasks.length === 0}
                onClick={onUpload}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors"
                style={{ background: job.tasks.length === 0 ? "var(--muted)" : "#0d6eaa", color: job.tasks.length === 0 ? "var(--muted-foreground)" : "#ffffff", fontWeight: 500, cursor: job.tasks.length === 0 ? "not-allowed" : "pointer" }}
                onMouseEnter={(e) => { if (job.tasks.length > 0) (e.currentTarget as HTMLElement).style.background = "#0b5f94"; }}
                onMouseLeave={(e) => { if (job.tasks.length > 0) (e.currentTarget as HTMLElement).style.background = "#0d6eaa"; }}
              >
                Start Upload
              </button>
              <button
                onClick={onDelete}
                className="p-1 rounded transition-colors"
                style={{ color: "var(--muted-foreground)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#c0392b"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)"; }}
              >
                <Trash2 size={11} />
              </button>
            </>
          )}
          {isUploading && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded text-xs" style={{ background: "var(--muted)", color: "var(--muted-foreground)", cursor: "not-allowed" }}>
              <Loader2 size={10} className="animate-spin" /> Uploading…
            </span>
          )}
          {isComplete && (
            <button
              onClick={onViewReceipt}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors"
              style={{ background: "rgba(14,165,160,0.1)", color: "#0ea5a0", fontWeight: 500 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(14,165,160,0.2)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(14,165,160,0.1)"; }}
            >
              <Receipt size={10} /> Receipt
            </button>
          )}
        </div>
      </div>

      {/* ── Expanded body ── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: "hidden" }}
          >
            <div className="px-3 pb-3 flex flex-col gap-2.5" style={{ borderTop: "1px solid var(--border)" }}>
              {job.tasks.length === 0 ? (
                <p className="text-xs py-3 text-center" style={{ color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace" }}>
                  No files staged — select a destination folder and click "Upload Files"
                </p>
              ) : (
                Object.entries(groups).map(([folderName, tasks]) => (
                  <div key={folderName} className="mt-2">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Folder size={11} style={{ color: "#2e6a9e", flexShrink: 0 }} />
                      <span className="text-xs" style={{ color: "#5a7490", fontWeight: 600 }}>{folderName}</span>
                      <span className="text-xs" style={{ color: "#3d5a72", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem" }}>
                        — {tasks.length} file{tasks.length !== 1 ? "s" : ""} · {formatSize(tasks.reduce((s, t) => s + t.file.size, 0))}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 pl-3">
                      {tasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          jobStatus={job.status}
                          onRemove={isStaging ? () => onRemoveTask(task.id) : undefined}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
              {(job.startedAt || job.completedAt) && (
                <div className="flex flex-wrap items-center gap-4 pt-2 mt-1" style={{ borderTop: "1px solid var(--border)", color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem" }}>
                  {job.startedAt && <span>Started: {fmtTime(job.startedAt)}</span>}
                  {job.completedAt && <span>Completed: {fmtTime(job.completedAt)}</span>}
                  {job.transactionId && <span>TXN: {job.transactionId.toUpperCase()}</span>}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── JobsPanel ────────────────────────────────────────────────────────────────

interface JobsPanelProps {
  jobs: Job[];
  activeJobId: string | null;
  selectedFolderName: string | null;
  onSetActive: (id: string) => void;
  onCreateJob: () => void;
  onUploadJob: (id: string) => void;
  onDeleteJob: (id: string) => void;
  onRemoveTask: (jobId: string, taskId: string) => void;
  onViewReceipt: (jobId: string) => void;
  onPrintAll: () => void;
  onAddFilesToJob: (jobId: string, files: FileList) => void;
}

export function JobsPanel({ jobs, activeJobId, selectedFolderName, onSetActive, onCreateJob, onUploadJob, onDeleteJob, onRemoveTask, onViewReceipt, onPrintAll, onAddFilesToJob }: JobsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [historyMode, setHistoryMode] = useState(false);

  const stagingCount = jobs.filter((j) => j.status === "staging").length;
  const uploadingCount = jobs.filter((j) => j.status === "uploading").length;
  const completeCount = jobs.filter((j) => j.status === "complete").length;
  const visibleJobs = historyMode ? jobs.filter((j) => j.status === "complete") : jobs;

  return (
    <div
      className="flex-none flex flex-col"
      style={{ borderTop: "1.5px solid var(--border)", background: "#f7fafd", height: collapsed ? "44px" : "clamp(180px, 45vh, 520px)", transition: "height 0.2s ease", overflow: "hidden" }}
    >
      {/* Panel header */}
      <div
        className="flex items-center gap-2.5 px-4 h-11 cursor-pointer select-none shrink-0"
        style={{ borderBottom: collapsed ? "none" : "1px solid var(--border)" }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <Layers size={14} style={{ color: "#0d6eaa", flexShrink: 0 }} />
        <span className="text-sm shrink-0" style={{ color: "var(--foreground)", fontWeight: 600 }}>Upload Jobs</span>

        <div className="flex items-center gap-1.5 ml-1">
          {!historyMode && stagingCount > 0 && (
            <span className="shrink-0 text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(13,110,170,0.1)", color: "#0d6eaa", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem" }}>
              {stagingCount} staging
            </span>
          )}
          {!historyMode && uploadingCount > 0 && (
            <span className="shrink-0 flex items-center gap-1 text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(93,173,226,0.12)", color: "#5dade2", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
              {uploadingCount} uploading
            </span>
          )}
          {completeCount > 0 && (
            <span className="shrink-0 text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(14,165,160,0.1)", color: "#0ea5a0", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem" }}>
              {completeCount} complete
            </span>
          )}
          {historyMode && (
            <span className="shrink-0 text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(14,165,160,0.15)", color: "#0ea5a0", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem" }}>
              History view
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setHistoryMode((h) => !h)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors"
            style={{ background: historyMode ? "rgba(14,165,160,0.15)" : "rgba(13,110,170,0.08)", color: historyMode ? "#0ea5a0" : "#0d6eaa", fontWeight: 500 }}
          >
            <Clock size={11} />
            {historyMode ? "Active Jobs" : "History"}
          </button>
          {completeCount > 0 && (
            <button
              onClick={onPrintAll}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors"
              style={{ background: "rgba(13,110,170,0.08)", color: "#0d6eaa", fontWeight: 500 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(13,110,170,0.16)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(13,110,170,0.08)"; }}
            >
              <Printer size={11} /> Print Report
            </button>
          )}
          {collapsed ? <ChevronRight size={12} style={{ color: "#5a7490" }} /> : <ChevronDown size={12} style={{ color: "#5a7490" }} />}
        </div>
      </div>

      {/* Jobs list */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 min-h-0">
          {visibleJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2" style={{ color: "var(--muted-foreground)" }}>
              <Layers size={22} style={{ opacity: 0.25 }} />
              <p className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {historyMode ? "No completed jobs yet" : "No jobs yet"}
              </p>
            </div>
          ) : (
            visibleJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                isActive={job.id === activeJobId}
                selectedFolderName={selectedFolderName}
                onSetActive={() => onSetActive(job.id)}
                onUpload={() => onUploadJob(job.id)}
                onDelete={() => onDeleteJob(job.id)}
                onRemoveTask={(taskId) => onRemoveTask(job.id, taskId)}
                onViewReceipt={() => onViewReceipt(job.id)}
                onAddFiles={(files) => onAddFilesToJob(job.id, files)}
              />
            ))
          )}

          {!historyMode && (
            <button
              onClick={onCreateJob}
              className="shrink-0 flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-xs transition-colors"
              style={{ border: "1.5px dashed rgba(13,110,170,0.3)", color: "#0d6eaa", background: "transparent", fontWeight: 500 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(13,110,170,0.05)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(13,110,170,0.5)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(13,110,170,0.3)"; }}
            >
              <Plus size={13} /> New Upload Job
            </button>
          )}
        </div>
      )}
    </div>
  );
}
