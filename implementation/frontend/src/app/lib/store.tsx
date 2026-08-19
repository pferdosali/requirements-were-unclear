import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DestinationNode, Job, Persona, StagedFile, UploadTask } from "./types";
import { PERSONAS, findDestinationPath } from "./mock";
import {
  listJobs,
  getJobTasks,
  createJob as apiCreateJob,
  submitJob as apiSubmitJob,
  retryTask as apiRetryTask,
  uploadFile,
  getDestinations,
  type BackendJob,
  type BackendTask,
} from "../api";
import { toast } from "sonner";

export type WsStatus = "connected" | "reconnecting" | "disconnected";

interface ApiLogEntry {
  method: string;
  path: string;
  status: number;
  ms: number;
}

interface AppContextValue {
  personas: Persona[];
  persona: Persona;
  setPersona: (id: string) => void;
  jobs: Job[];
  jobsLoading: boolean;
  getJob: (id: string) => Job | undefined;
  createJob: (files: StagedFile[], destinationId: string) => Promise<string>;
  retryTask: (jobId: string, taskId: string) => void;
  retryAllFailed: (jobId: string) => void;
  wsStatus: WsStatus;
  apiOnline: boolean;
  lastApiCall: ApiLogEntry | null;
  refreshJobs: () => void;
  destinationTree: DestinationNode | null;
}

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEY = "docbridge.personaId";

// --- Adapters: Convert backend snake_case to frontend types ---

function adaptJob(backend: BackendJob, tasks: UploadTask[] = []): Job {
  // Derive status from tasks if we have them, otherwise trust backend
  let status = backend.status === "partial_success" ? "partial" : backend.status;
  if (tasks.length > 0) {
    const completed = tasks.filter(t => t.status === "completed").length;
    const failed = tasks.filter(t => t.status === "failed").length;
    const processing = tasks.filter(t => t.status === "processing").length;
    if (completed === tasks.length) status = "completed";
    else if (failed === tasks.length) status = "failed";
    else if (failed > 0 && completed > 0 && processing === 0) status = "partial";
    else if (processing > 0) status = "processing";
  }

  return {
    id: backend.job_id,
    ownerId: backend.user_id,
    region: "us-east",
    destinationId: tasks.length > 0 ? tasks[0].id : "",
    destinationPath: "",
    status: status as Job["status"],
    tasks,
    createdAt: new Date(backend.created_at).getTime(),
    updatedAt: new Date(backend.updated_at).getTime(),
  };
}

function adaptTask(backend: BackendTask): UploadTask {
  // Extract filename from file_id path (uploads/user-1/uuid/filename.pdf)
  const parts = backend.file_id.split("/");
  const fileName = parts.length > 0 ? parts[parts.length - 1] : backend.file_id;

  return {
    id: backend.task_id,
    fileName,
    fileSize: 0, // Will be populated from upload metadata when available
    fileType: guessFileType(fileName),
    status: backend.status,
    retryCount: backend.retry_count,
    maxRetries: 3,
    error: backend.status === "failed"
      ? `Delivery failed after ${backend.retry_count} retries. Check worker logs for details.`
      : undefined,
    startedAt: new Date(backend.created_at).getTime(),
    completedAt: (backend.status === "completed" || backend.status === "failed")
      ? new Date(backend.updated_at).getTime()
      : undefined,
  };
}

function guessFileType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    txt: "text/plain",
  };
  return types[ext ?? ""] ?? "application/octet-stream";
}

// --- File size cache: populated during upload, persisted in sessionStorage ---
const FILE_SIZE_CACHE_KEY = "docbridge.fileSizes";

function getFileSizeCache(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(FILE_SIZE_CACHE_KEY) || "{}");
  } catch { return {}; }
}

function cacheFileSize(objectKey: string, size: number) {
  try {
    const cache = getFileSizeCache();
    cache[objectKey] = size;
    sessionStorage.setItem(FILE_SIZE_CACHE_KEY, JSON.stringify(cache));
  } catch { /* ignore */ }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [personaId, setPersonaId] = useState<string>(() => {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && PERSONAS.some((p) => p.id === saved)) return saved;
    }
    return PERSONAS[0].id;
  });

  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [destinationTree, setDestinationTree] = useState<DestinationNode | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>("connected");
  const [apiOnline, setApiOnline] = useState(true);
  const [lastApiCall, setLastApiCall] = useState<ApiLogEntry | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const persona = useMemo(
    () => PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[0],
    [personaId],
  );

  const logApi = useCallback((method: string, path: string, status = 200) => {
    setLastApiCall({ method, path, status, ms: 20 + Math.floor(Math.random() * 90) });
  }, []);

  // --- Fetch jobs from backend ---
  const fetchJobs = useCallback(async () => {
    try {
      const { jobs: backendJobs } = await listJobs();
      const sizeCache = getFileSizeCache();

      // For each job, fetch its tasks
      const fullJobs = await Promise.all(
        backendJobs.map(async (bj) => {
          try {
            const { tasks } = await getJobTasks(bj.job_id);
            const adaptedTasks = tasks.map((t) => {
              const task = adaptTask(t);
              // Enrich file size from cache
              const cachedSize = sizeCache[t.file_id];
              if (cachedSize) task.fileSize = cachedSize;
              return task;
            });
            return adaptJob(bj, adaptedTasks);
          } catch {
            return adaptJob(bj);
          }
        }),
      );
      setJobs(fullJobs.sort((a, b) => b.createdAt - a.createdAt));
      setApiOnline(true);
      setJobsLoading(false);
      logApi("GET", "/api/jobs");
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
      setApiOnline(false);
      setJobsLoading(false);
    }
  }, [logApi]);

  // Fetch jobs on mount and when persona changes
  useEffect(() => {
    setJobsLoading(true);
    setJobs([]); // Clear immediately on persona switch (fixes flash)
    fetchJobs();
    // Fetch destinations for this persona's region
    getDestinations()
      .then((res) => {
        setDestinationTree(res.destinations);
      })
      .catch(() => {
        setDestinationTree(null);
      });
  }, [personaId, fetchJobs]);

  // ALWAYS poll every 5 seconds for updates (WebSocket is unreliable in this setup)
  useEffect(() => {
    pollRef.current = setInterval(fetchJobs, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchJobs]);

  // --- Actions ---

  const setPersona = useCallback(
    (id: string) => {
      setPersonaId(id);
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch { /* ignore */ }
      const p = PERSONAS.find((pp) => pp.id === id);
      if (p) toast.success(`Switched to ${p.name} (${p.team} · ${p.region})`);
      logApi("GET", "/api/me");
    },
    [logApi],
  );

  const createJobAction = useCallback(
    async (files: StagedFile[], destinationId: string): Promise<string> => {
      // Upload all files to S3
      const uploadResults: Array<{ fileId: string; objectKey: string }> = [];

      for (const staged of files) {
        if (staged.file) {
          const result = await uploadFile(staged.file, () => {});
          uploadResults.push(result);
          // Cache file size for later display
          cacheFileSize(result.objectKey, staged.size);
        } else {
          uploadResults.push({ fileId: staged.id, objectKey: staged.id });
        }
      }

      // Create job with tasks
      const response = await apiCreateJob(
        uploadResults.map((r) => ({
          fileId: r.objectKey,
          destinationId,
        })),
      );

      logApi("POST", "/api/jobs");

      // Submit job
      await apiSubmitJob(response.job.job_id);
      logApi("POST", `/api/jobs/${response.job.job_id}/submit`);

      toast.success("Upload job submitted for processing");

      // Refresh jobs list
      await fetchJobs();

      return response.job.job_id;
    },
    [logApi, fetchJobs],
  );

  const retryTaskAction = useCallback(
    async (jobId: string, taskId: string) => {
      try {
        await apiRetryTask(taskId);
        logApi("POST", `/api/tasks/${taskId}/retry`);
        toast.success("Task queued for retry");
        await fetchJobs();
      } catch (err) {
        toast.error("Failed to retry task");
        console.error(err);
      }
    },
    [logApi, fetchJobs],
  );

  const retryAllFailed = useCallback(
    async (jobId: string) => {
      const job = jobs.find((j) => j.id === jobId);
      if (!job) return;
      const failedTasks = job.tasks.filter((t) => t.status === "failed");
      for (const task of failedTasks) {
        await retryTaskAction(jobId, task.id);
      }
    },
    [jobs, retryTaskAction],
  );

  const getJobFn = useCallback(
    (id: string) => jobs.find((j) => j.id === id),
    [jobs],
  );

  const value: AppContextValue = {
    personas: PERSONAS,
    persona,
    setPersona,
    jobs,
    jobsLoading,
    getJob: getJobFn,
    createJob: createJobAction,
    retryTask: retryTaskAction,
    retryAllFailed,
    wsStatus,
    apiOnline,
    lastApiCall,
    refreshJobs: fetchJobs,
    destinationTree,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
