import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Job, Persona, StagedFile, UploadTask } from "./types";
import { PERSONAS, DESTINATIONS, findDestinationPath, deriveJobStatus } from "./mock";
import {
  listJobs,
  getJob as apiGetJob,
  getJobTasks,
  createJob as apiCreateJob,
  submitJob as apiSubmitJob,
  retryTask as apiRetryTask,
  uploadFile,
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
  getJob: (id: string) => Job | undefined;
  createJob: (files: StagedFile[], destinationId: string) => Promise<string>;
  retryTask: (jobId: string, taskId: string) => void;
  retryAllFailed: (jobId: string) => void;
  wsStatus: WsStatus;
  apiOnline: boolean;
  lastApiCall: ApiLogEntry | null;
  refreshJobs: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEY = "docbridge.personaId";

// --- Adapters: Convert backend snake_case to frontend types ---

function adaptJob(backend: BackendJob, tasks: UploadTask[] = []): Job {
  return {
    id: backend.job_id,
    ownerId: backend.user_id,
    region: "us-east", // Will be enhanced with multi-region later
    destinationId: tasks[0]?.id ?? "",
    destinationPath: "",
    status: backend.status === "partial_success" ? "partial" : backend.status,
    tasks,
    createdAt: new Date(backend.created_at).getTime(),
    updatedAt: new Date(backend.updated_at).getTime(),
  };
}

function adaptTask(backend: BackendTask): UploadTask {
  return {
    id: backend.task_id,
    fileName: backend.file_id.split("/").pop() ?? backend.file_id,
    fileSize: 0, // Not tracked in current backend
    fileType: "application/octet-stream",
    status: backend.status,
    retryCount: backend.retry_count,
    maxRetries: 3,
    error: backend.status === "failed" ? "Delivery failed" : undefined,
    startedAt: new Date(backend.created_at).getTime(),
    completedAt: backend.status === "completed" ? new Date(backend.updated_at).getTime() : undefined,
  };
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
  const [wsStatus, setWsStatus] = useState<WsStatus>("disconnected");
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
      // For each job, fetch its tasks
      const fullJobs = await Promise.all(
        backendJobs.map(async (bj) => {
          try {
            const { tasks } = await getJobTasks(bj.job_id);
            return adaptJob(bj, tasks.map(adaptTask));
          } catch {
            return adaptJob(bj);
          }
        }),
      );
      setJobs(fullJobs.sort((a, b) => b.createdAt - a.createdAt));
      setApiOnline(true);
      logApi("GET", "/api/jobs");
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
      setApiOnline(false);
    }
  }, [logApi]);

  // Fetch jobs on mount and when persona changes
  useEffect(() => {
    fetchJobs();
  }, [personaId, fetchJobs]);

  // Poll every 5 seconds when WebSocket is not connected
  useEffect(() => {
    if (wsStatus !== "connected") {
      pollRef.current = setInterval(fetchJobs, 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [wsStatus, fetchJobs]);

  // --- WebSocket connection ---
  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:3000/ws";
    let ws: WebSocket | null = null;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      try {
        ws = new WebSocket(`${wsUrl}?userId=${personaId}`);

        ws.onopen = () => {
          setWsStatus("connected");
          retryCount = 0;
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            // On any status update, refresh jobs
            if (msg.type === "TASK_STATUS_UPDATE" || msg.type === "JOB_STATUS_UPDATE") {
              fetchJobs();
            }
          } catch { /* ignore */ }
        };

        ws.onclose = () => {
          ws = null;
          setWsStatus("reconnecting");
          const delay = Math.min(1000 * 2 ** retryCount, 30000);
          retryCount++;
          retryTimer = setTimeout(connect, delay);
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch {
        setWsStatus("disconnected");
      }
    }

    connect();

    return () => {
      clearTimeout(retryTimer);
      ws?.close();
      ws = null;
    };
  }, [personaId, fetchJobs]);

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
          // Real file upload via presign → S3 → confirm
          const result = await uploadFile(staged.file, () => {
            // Progress tracked by UploadProgressModal via its own mechanism
          });
          uploadResults.push(result);
        } else {
          // Fallback: use the staged ID as file reference (for testing)
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
    getJob: getJobFn,
    createJob: createJobAction,
    retryTask: retryTaskAction,
    retryAllFailed,
    wsStatus,
    apiOnline,
    lastApiCall,
    refreshJobs: fetchJobs,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
