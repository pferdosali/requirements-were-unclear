import React, { useCallback, useRef } from "react";
import { Upload, FolderOpen, AlertCircle, Layers } from "lucide-react";
import { Job } from "../types";

interface StagingZoneProps {
  folderId: string;
  folderName: string;
  activeJob: Job | null;
  onStageFiles: (files: FileList) => void;
  onCreateAndStage: (files: FileList) => void;
  dragging: boolean;
  setDragging: (v: boolean) => void;
}

export function StagingZone({
  folderId,
  folderName,
  activeJob,
  onStageFiles,
  onCreateAndStage,
  dragging,
  setDragging,
}: StagingZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (!e.dataTransfer.files.length) return;
      if (activeJob) {
        onStageFiles(e.dataTransfer.files);
      } else {
        onCreateAndStage(e.dataTransfer.files);
      }
    },
    [activeJob, onStageFiles, onCreateAndStage, setDragging]
  );

  const stagedHere = activeJob?.tasks.filter((t) => t.folderId === folderId) ?? [];

  return (
    <div className="flex flex-col h-full gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <FolderOpen size={15} style={{ color: "#0d6eaa" }} />
            <h2 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: "1rem", letterSpacing: "-0.01em", color: "var(--foreground)" }}>
              {folderName}
            </h2>
          </div>
          <p className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace" }}>
            /repository/{folderName.toLowerCase().replace(/\s+/g, "-")}
          </p>
        </div>

        {activeJob && (
          <div
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded"
            style={{ background: "rgba(13,110,170,0.08)", border: "1px solid rgba(13,110,170,0.2)", color: "#0d6eaa" }}
          >
            <Layers size={11} />
            <span style={{ fontWeight: 500 }}>Active: {activeJob.name}</span>
          </div>
        )}
      </div>

      {/* Security notice */}
      <div
        className="flex items-start gap-2.5 rounded-md px-3.5 py-2.5 text-xs"
        style={{ background: "rgba(13,110,170,0.07)", border: "1px solid rgba(13,110,170,0.18)", color: "#5a7490" }}
      >
        <AlertCircle size={13} style={{ color: "#0d6eaa", marginTop: "1px", flexShrink: 0 }} />
        <span>
          Files are staged locally until you click <strong>Start Upload</strong> on a job. All transfers use AES-256 encryption at rest and TLS 1.3 in transit.
        </span>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="relative cursor-pointer flex flex-col items-center justify-center gap-3 py-10 px-6 rounded-lg transition-all duration-150"
        style={{
          border: dragging ? "2px dashed #0d6eaa" : "2px dashed rgba(13,58,92,0.22)",
          background: dragging ? "rgba(13,110,170,0.06)" : "rgba(255,255,255,0.7)",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (!e.target.files) return;
            if (activeJob) onStageFiles(e.target.files);
            else onCreateAndStage(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="p-3.5 rounded-lg" style={{ background: dragging ? "rgba(13,110,170,0.15)" : "rgba(13,110,170,0.08)" }}>
          <Upload size={22} style={{ color: "#0d6eaa" }} />
        </div>

        <div className="text-center">
          <p className="text-sm" style={{ color: "var(--foreground)", fontWeight: 500 }}>
            {dragging
              ? "Release to stage files"
              : activeJob
              ? `Add files to "${activeJob.name}" → ${folderName}`
              : "Drag & drop files here"}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
            Supports DICOM, CSV, XLSX, PDF, FASTQ, BAM, and all common formats
          </p>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
          className="px-4 py-1.5 rounded text-xs transition-colors"
          style={{ background: "#0d6eaa", color: "#ffffff", fontWeight: 500 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#0b5f94"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#0d6eaa"; }}
        >
          {activeJob ? `Add to "${activeJob.name}"` : "Browse Files"}
        </button>
      </div>

      {/* Files staged to this folder in the active job */}
      {activeJob && stagedHere.length > 0 && (
        <div>
          <p className="text-xs mb-2" style={{ color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "0.6rem" }}>
            Staged here in "{activeJob.name}" — {stagedHere.length} file{stagedHere.length !== 1 ? "s" : ""}
          </p>
          <div className="flex flex-col gap-1">
            {stagedHere.map((task) => (
              <div key={task.id} className="flex items-center gap-2 rounded px-3 py-2 text-xs" style={{ background: "#ffffff", border: "1px solid var(--border)" }}>
                <span className="flex-1 truncate" style={{ color: "var(--foreground)", fontWeight: 500 }}>{task.file.name}</span>
                <span style={{ color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem" }}>
                  {(task.file.size / 1024).toFixed(1)} KB
                </span>
                <span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(13,110,170,0.1)", color: "#0d6eaa", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem" }}>
                  staged
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
