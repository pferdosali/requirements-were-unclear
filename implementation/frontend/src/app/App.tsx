import React, { useState, useCallback } from "react";
import { FolderTree, FolderNode } from "./components/FolderTree";
import { StagingZone } from "./components/StagingZone";
import { JobsPanel } from "./components/JobsPanel";
import { ReceiptModal } from "./components/ReceiptModal";
import { PrintableReport } from "./components/PrintableReport";
import { Job, UploadTask } from "./types";
import { FlaskConical, ShieldCheck, Activity, LogOut, User } from "lucide-react";
import { uploadFile } from "./api/upload";
import { createJob as apiCreateJob, submitJob as apiSubmitJob } from "./api/jobs";
import { getActivePersonaId } from "./api/client";

// --- Personas for mock login ---
interface Persona {
  id: string;
  name: string;
  email: string;
  role: string;
  team: string;
  region: string;
  avatar: string;
}

const PERSONAS: Persona[] = [
  { id: "user-1", name: "Dr. Sarah Chen", email: "sarah.chen@clinvault.health", role: "Principal Investigator", team: "Team Alpha", region: "US-East", avatar: "SC" },
  { id: "user-2", name: "Dr. Marcus Weber", email: "marcus.weber@clinvault.health", role: "Clinical Director", team: "Team Beta", region: "EU-West", avatar: "MW" },
  { id: "user-3", name: "Dr. Aiko Tanaka", email: "aiko.tanaka@clinvault.health", role: "Data Reviewer", team: "Team Alpha", region: "US-East", avatar: "AT" },
  { id: "user-4", name: "Dr. Kwame Osei", email: "kwame.osei@clinvault.health", role: "Site Coordinator", team: "Team Gamma", region: "AP-Southeast", avatar: "KO" },
  { id: "user-5", name: "Dr. Emma Lindström", email: "emma.lindstrom@clinvault.health", role: "Compliance Officer", team: "Team Beta", region: "EU-West", avatar: "EL" },
];

const STORAGE_KEY = "docbridge.personaId";

const FOLDERS: FolderNode[] = [
  {
    id: "1", name: "Clinical Trials",
    children: [
      {
        id: "1-1", name: "Phase I Studies",
        children: [
          { id: "1-1-1", name: "Protocol CL-2024-01" },
          { id: "1-1-2", name: "Adverse Events" },
          { id: "1-1-3", name: "Informed Consent Forms" },
        ],
      },
      {
        id: "1-2", name: "Phase III Studies",
        children: [
          { id: "1-2-1", name: "Site Reports" },
          { id: "1-2-2", name: "Lab Results" },
        ],
      },
    ],
  },
  {
    id: "2", name: "Patient Data",
    children: [
      {
        id: "2-1", name: "Anonymised Records",
        children: [
          { id: "2-1-1", name: "Cohort A" },
          { id: "2-1-2", name: "Cohort B" },
          { id: "2-1-3", name: "Cohort C" },
        ],
      },
      { id: "2-2", name: "Imaging & Scans" },
      { id: "2-3", name: "Biomarker Data" },
    ],
  },
  {
    id: "3", name: "Research Publications",
    children: [
      { id: "3-1", name: "Peer-Reviewed Papers" },
      { id: "3-2", name: "Conference Posters" },
      {
        id: "3-3", name: "Internal Reports",
        children: [
          { id: "3-3-1", name: "Q1 2024" },
          { id: "3-3-2", name: "Q2 2024" },
          { id: "3-3-3", name: "Q3 2024" },
        ],
      },
    ],
  },
  {
    id: "4", name: "Regulatory Documents",
    children: [
      { id: "4-1", name: "FDA Submissions" },
      { id: "4-2", name: "EMA Filings" },
      { id: "4-3", name: "IRB Approvals" },
    ],
  },
  {
    id: "5", name: "Lab & Genomics",
    children: [
      { id: "5-1", name: "Sequencing Data" },
      { id: "5-2", name: "Assay Protocols" },
      { id: "5-3", name: "QC Reports" },
    ],
  },
];

function findFolder(nodes: FolderNode[], id: string): FolderNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findFolder(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function genTxnId() {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

function genChecksum() {
  return Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

/**
 * Real upload: presign → S3 PUT (with progress) → confirm → create job → submit.
 * Updates job state in real-time as each file uploads.
 */
async function realJobUpload(
  jobId: string,
  jobs: Job[],
  setJobs: React.Dispatch<React.SetStateAction<Job[]>>
) {
  console.log("[realJobUpload] Starting upload for job:", jobId);
  const startedAt = new Date();
  const txnId = genTxnId();

  const job = jobs.find((j) => j.id === jobId);
  if (!job || job.tasks.length === 0) {
    console.error("[realJobUpload] Job not found or no tasks!", { jobId, jobCount: jobs.length });
    return;
  }
  console.log("[realJobUpload] Found job with", job.tasks.length, "tasks");

  // Mark job as uploading
  setJobs((prev) =>
    prev.map((j) =>
      j.id !== jobId
        ? j
        : {
            ...j,
            status: "uploading" as const,
            startedAt,
            transactionId: txnId,
            tasks: j.tasks.map((t) => ({ ...t, checksumStatus: "pending" as const })),
          }
    )
  );

  const uploadResults: Array<{ objectKey: string; taskId: string }> = [];

  // Upload each file with real progress
  for (const task of job.tasks) {
    try {
      console.log("[realJobUpload] Uploading:", task.file.name, task.file.size, "bytes");
      const result = await uploadFile(task.file, (percent) => {
        setJobs((cur) =>
          cur.map((j) =>
            j.id !== jobId
              ? j
              : {
                  ...j,
                  tasks: j.tasks.map((t) =>
                    t.id !== task.id ? t : { ...t, progress: percent }
                  ),
                }
          )
        );
      });

      // Mark file as done + computing checksum
      setJobs((cur) =>
        cur.map((j) =>
          j.id !== jobId
            ? j
            : {
                ...j,
                tasks: j.tasks.map((t) =>
                  t.id !== task.id
                    ? t
                    : { ...t, progress: 100, done: true, uploadedAt: new Date(), checksumStatus: "computing" as const }
                ),
              }
        )
      );

      uploadResults.push({ objectKey: result.objectKey, taskId: task.id });
      console.log("[realJobUpload] Upload success:", result.objectKey);

      // Mark checksum as verified after a brief delay
      setTimeout(() => {
        setJobs((cur) =>
          cur.map((j) =>
            j.id !== jobId
              ? j
              : {
                  ...j,
                  tasks: j.tasks.map((t) =>
                    t.id !== task.id
                      ? t
                      : { ...t, checksumStatus: "verified" as const, checksum: genChecksum() }
                  ),
                }
          )
        );
      }, 300);
    } catch (err) {
      console.error(`Upload failed for ${task.file.name}:`, err);
      setJobs((cur) =>
        cur.map((j) =>
          j.id !== jobId
            ? j
            : {
                ...j,
                tasks: j.tasks.map((t) =>
                  t.id !== task.id ? t : { ...t, progress: 0, done: true, checksumStatus: null }
                ),
              }
        )
      );
    }
  }

  // Create backend job with all uploaded files
  if (uploadResults.length > 0) {
    try {
      const destinationId = job.tasks[0]?.folderId || "region-a";
      const response = await apiCreateJob(
        uploadResults.map((r) => ({
          fileId: r.objectKey,
          destinationId,
        })),
      );
      await apiSubmitJob(response.job.job_id);
      setJobs((cur) =>
        cur.map((j) =>
          j.id !== jobId ? j : { ...j, transactionId: response.job.job_id }
        )
      );
    } catch (err) {
      console.error("Failed to create/submit backend job:", err);
    }
  }

  // Mark job as complete
  setJobs((cur) =>
    cur.map((j) =>
      j.id !== jobId
        ? j
        : { ...j, status: "complete" as const, completedAt: new Date() }
    )
  );
}

let jobCounter = 1;
function makeJobName() {
  const n = jobCounter++;
  return `Job ${String(n).padStart(2, "0")}`;
}

function simulateJobUpload(
  jobId: string,
  setJobs: React.Dispatch<React.SetStateAction<Job[]>>
) {
  const startedAt = new Date();
  const txnId = genTxnId();

  setJobs((prev) =>
    prev.map((j) =>
      j.id !== jobId
        ? j
        : {
            ...j,
            status: "uploading" as const,
            startedAt,
            transactionId: txnId,
            tasks: j.tasks.map((t) => ({ ...t, checksumStatus: "pending" as const })),
          }
    )
  );

  // Read tasks once and kick off per-task intervals
  setJobs((prev) => {
    const job = prev.find((j) => j.id === jobId);
    if (!job) return prev;

    job.tasks.forEach((task) => {
      let progress = 0;
      const speed = Math.random() * 9 + 5;

      const interval = setInterval(() => {
        progress = Math.min(progress + speed + Math.random() * 4, 100);
        const justDone = progress >= 100;

        setJobs((cur) =>
          cur.map((j) => {
            if (j.id !== jobId) return j;
            const updatedTasks = j.tasks.map((t) => {
              if (t.id !== task.id) return t;
              if (justDone && !t.done) {
                return { ...t, progress: 100, done: true, uploadedAt: new Date(), checksumStatus: "computing" as const };
              }
              return justDone ? t : { ...t, progress };
            });
            const allDone = updatedTasks.every((t) => t.done);
            return {
              ...j,
              tasks: updatedTasks,
              status: allDone ? ("complete" as const) : j.status,
              completedAt: allDone ? new Date() : j.completedAt,
            };
          })
        );

        if (justDone) {
          clearInterval(interval);
          setTimeout(() => {
            setJobs((cur) =>
              cur.map((j) =>
                j.id !== jobId
                  ? j
                  : {
                      ...j,
                      tasks: j.tasks.map((t) =>
                        t.id !== task.id
                          ? t
                          : { ...t, checksumStatus: "verified" as const, checksum: genChecksum() }
                      ),
                    }
              )
            );
          }, 400 + Math.random() * 900);
        }
      }, 100);
    });

    return prev;
  });
}

export default function App() {
  // --- Login state ---
  const [persona, setPersona] = useState<Persona | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return PERSONAS.find(p => p.id === saved) ?? null;
  });

  function handleLogin(p: Persona) {
    localStorage.setItem(STORAGE_KEY, p.id);
    setPersona(p);
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    setPersona(null);
  }

  if (!persona) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return <MainApp persona={persona} onLogout={handleLogout} />;
}

// --- Login Screen ---
function LoginScreen({ onLogin }: { onLogin: (p: Persona) => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a1929" }}>
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg" style={{ background: "rgba(13,110,170,0.35)" }}>
              <FlaskConical size={24} style={{ color: "#5dade2" }} />
            </div>
            <span className="text-2xl font-semibold text-white">ClinVault</span>
          </div>
          <p className="text-sm" style={{ color: "#5a7490" }}>
            Select a persona to continue (mock authentication)
          </p>
        </div>

        <div className="space-y-3">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              onClick={() => onLogin(p)}
              className="w-full flex items-center gap-4 p-4 rounded-lg text-left transition-all"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(13,110,170,0.15)"; e.currentTarget.style.borderColor = "rgba(13,110,170,0.4)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium"
                style={{ background: "rgba(13,110,170,0.3)", color: "#5dade2" }}
              >
                {p.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{p.name}</p>
                <p className="text-xs truncate" style={{ color: "#5a7490" }}>
                  {p.role} · {p.team} · {p.region}
                </p>
              </div>
              <div className="text-xs px-2 py-1 rounded" style={{ background: "rgba(14,165,160,0.15)", color: "#4dd0cb" }}>
                {p.region}
              </div>
            </button>
          ))}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "#3d5a72" }}>
          This is a mock login for testing. Cognito integration coming soon.
        </p>
      </div>
    </div>
  );
}

// --- Main App (after login) ---
function MainApp({ persona, onLogout }: { persona: Persona; onLogout: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>("1-1-1");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [receiptJobId, setReceiptJobId] = useState<string | null>(null);
  const [showPrintReport, setShowPrintReport] = useState(false);

  const selectedFolder = selectedId ? findFolder(FOLDERS, selectedId) : null;
  // StagingZone only links to staging jobs; uploading/complete ones are view-only
  const activeJob = jobs.find((j) => j.id === activeJobId && j.status === "staging") ?? null;
  const receiptJob = receiptJobId ? (jobs.find((j) => j.id === receiptJobId) ?? null) : null;

  const createJob = useCallback((): Job => {
    const job: Job = {
      id: `job-${Date.now()}`,
      name: makeJobName(),
      status: "staging",
      tasks: [],
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      transactionId: null,
    };
    setJobs((prev) => [...prev, job]);
    setActiveJobId(job.id);
    return job;
  }, []);

  const stageFiles = useCallback(
    (files: FileList, jobId: string, folderId: string, folderName: string) => {
      const newTasks: UploadTask[] = Array.from(files).map((file) => ({
        id: `task-${Date.now()}-${Math.random()}`,
        file,
        folderId,
        folderName,
        progress: 0,
        done: false,
        checksum: null,
        checksumAlgo: "SHA-256" as const,
        checksumStatus: null,
        uploadedAt: null,
        byteCount: file.size,
      }));
      setJobs((prev) =>
        prev.map((j) => (j.id !== jobId ? j : { ...j, tasks: [...j.tasks, ...newTasks] }))
      );
    },
    []
  );

  const handleStageFiles = useCallback(
    (files: FileList) => {
      if (!selectedFolder || !activeJob) return;
      stageFiles(files, activeJob.id, selectedFolder.id, selectedFolder.name);
    },
    [activeJob, selectedFolder, stageFiles]
  );

  const handleCreateAndStage = useCallback(
    (files: FileList) => {
      if (!selectedFolder) return;
      const job = createJob();
      stageFiles(files, job.id, selectedFolder.id, selectedFolder.name);
    },
    [selectedFolder, createJob, stageFiles]
  );

  const handleUploadJob = useCallback((jobId: string) => {
    realJobUpload(jobId, jobs, setJobs);
    // Don't deactivate — keep it expanded to show progress
  }, [jobs]);

  const handleDeleteJob = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    setActiveJobId((cur) => (cur === jobId ? null : cur));
  }, []);

  const handleRemoveTask = useCallback((jobId: string, taskId: string) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id !== jobId ? j : { ...j, tasks: j.tasks.filter((t) => t.id !== taskId) }
      )
    );
  }, []);

  return (
    <div
      className="size-full flex flex-col"
      style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "var(--background)" }}
    >
      {/* Top bar */}
      <header
        className="h-13 flex items-center gap-3 px-5 shrink-0 border-b"
        style={{ background: "var(--sidebar)", borderColor: "rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-md" style={{ background: "rgba(13,110,170,0.35)" }}>
            <FlaskConical size={17} style={{ color: "#5dade2" }} />
          </div>
          <span
            className="text-white"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: "0.95rem", letterSpacing: "-0.01em" }}
          >
            ClinVault
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{ background: "rgba(14,165,160,0.2)", color: "#4dd0cb", fontFamily: "'JetBrains Mono', monospace" }}
          >
            v2.4.1
          </span>
        </div>

        <div className="flex items-center gap-4 ml-6">
          {[
            { label: "Research Portal", active: true },
            { label: "Analytics" },
            { label: "Compliance" },
          ].map(({ label, active }) => (
            <button
              key={label}
              className="text-sm transition-colors"
              style={{
                color: active ? "#ffffff" : "#5a7490",
                fontWeight: active ? 500 : 400,
                borderBottom: active ? "2px solid #0d6eaa" : "2px solid transparent",
                paddingBottom: "2px",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs" style={{ color: "#4dd0cb" }}>
            <ShieldCheck size={13} />
            <span>HIPAA Compliant</span>
          </div>
          <div
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded"
            style={{ background: "rgba(255,255,255,0.06)", color: "#8ab0cc" }}
          >
            <Activity size={12} />
            <span>{persona.name}</span>
            <span className="text-xs" style={{ color: "#4dd0cb" }}>({persona.region})</span>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
            style={{ color: "#5a7490" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#ffffff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#5a7490"; }}
            title="Switch persona"
          >
            <LogOut size={12} />
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside
          className="w-60 shrink-0 border-r flex flex-col overflow-hidden"
          style={{ background: "var(--sidebar)", borderColor: "rgba(255,255,255,0.07)" }}
        >
          <div className="px-4 pt-4 pb-1.5">
            <p className="text-xs uppercase tracking-widest" style={{ color: "#3d5a72", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem" }}>
              Repository
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            <FolderTree folders={FOLDERS} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
          <div className="px-4 py-3 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <p className="text-xs" style={{ color: "#2a4a62", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem" }}>
              Select a leaf folder to upload
            </p>
          </div>
        </aside>

        {/* Right column */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <main className="flex-1 overflow-y-auto p-6 min-h-0">
            {selectedFolder ? (
              <StagingZone
                folderId={selectedFolder.id}
                folderName={selectedFolder.name}
                activeJob={activeJob}
                onStageFiles={handleStageFiles}
                onCreateAndStage={handleCreateAndStage}
                dragging={dragging}
                setDragging={setDragging}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3" style={{ color: "var(--muted-foreground)" }}>
                <FlaskConical size={32} style={{ color: "#0d6eaa", opacity: 0.4 }} />
                <p className="text-sm">Select a folder to start staging files</p>
              </div>
            )}
          </main>

          <JobsPanel
            jobs={jobs}
            activeJobId={activeJobId}
            selectedFolderName={selectedFolder?.name ?? null}
            onSetActive={(id) => setActiveJobId((cur) => cur === id ? null : id)}
            onCreateJob={createJob}
            onUploadJob={handleUploadJob}
            onDeleteJob={handleDeleteJob}
            onRemoveTask={handleRemoveTask}
            onViewReceipt={(id) => setReceiptJobId(id)}
            onPrintAll={() => setShowPrintReport(true)}
            onAddFilesToJob={(jobId, files) => {
              if (!selectedFolder) return;
              stageFiles(files, jobId, selectedFolder.id, selectedFolder.name);
            }}
          />
        </div>
      </div>

      {/* Receipt modal */}
      {receiptJob && (
        <ReceiptModal
          job={receiptJob}
          onClose={() => setReceiptJobId(null)}
          onPrint={() => { setReceiptJobId(null); setShowPrintReport(true); }}
        />
      )}

      {/* Printable report */}
      {showPrintReport && (
        <PrintableReport
          jobs={jobs}
          onClose={() => setShowPrintReport(false)}
        />
      )}
    </div>
  );
}
