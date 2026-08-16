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
import {
  PERSONAS,
  deriveJobStatus,
  findDestinationPath,
  seedJobsForUser,
  uuid,
} from "./mock";

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
  jobs: Job[]; // jobs for current persona
  getJob: (id: string) => Job | undefined;
  createJob: (files: StagedFile[], destinationId: string) => string;
  retryTask: (jobId: string, taskId: string) => void;
  retryAllFailed: (jobId: string) => void;
  wsStatus: WsStatus;
  apiOnline: boolean;
  lastApiCall: ApiLogEntry | null;
}

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEY = "docbridge.personaId";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [personaId, setPersonaId] = useState<string>(() => {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && PERSONAS.some((p) => p.id === saved)) return saved;
    }
    return PERSONAS[0].id;
  });

  // All jobs across all users, seeded once.
  const [allJobs, setAllJobs] = useState<Job[]>(() =>
    PERSONAS.flatMap((p) => seedJobsForUser(p.id)),
  );
  const [wsStatus, setWsStatus] = useState<WsStatus>("connected");
  const [lastApiCall, setLastApiCall] = useState<ApiLogEntry | null>({
    method: "GET",
    path: "/api/me",
    status: 200,
    ms: 42,
  });

  const timers = useRef<number[]>([]);

  const persona = useMemo(
    () => PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[0],
    [personaId],
  );

  const logApi = useCallback((method: string, path: string) => {
    setLastApiCall({
      method,
      path,
      status: 200,
      ms: 20 + Math.floor(Math.random() * 90),
    });
  }, []);

  const setPersona = useCallback(
    (id: string) => {
      setPersonaId(id);
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {
        /* ignore */
      }
      logApi("GET", "/api/me");
    },
    [logApi],
  );

  // Simulated processing for a single task within a job.
  const scheduleTask = useCallback(
    (jobId: string, taskId: string, delay: number) => {
      const startTimer = window.setTimeout(() => {
        setAllJobs((prev) =>
          updateTask(prev, jobId, taskId, () => ({ status: "processing", startedAt: Date.now() })),
        );
        const finishTimer = window.setTimeout(() => {
          const failed = Math.random() < 0.18;
          setAllJobs((prev) =>
            updateTask(prev, jobId, taskId, (t) =>
              failed
                ? {
                    status: "failed",
                    error: "S3 upload timed out (504). Object not confirmed.",
                    completedAt: Date.now(),
                  }
                : { status: "completed", completedAt: Date.now() },
            ),
          );
        }, 1600 + Math.random() * 2600);
        timers.current.push(finishTimer);
      }, delay);
      timers.current.push(startTimer);
    },
    [],
  );

  const createJob = useCallback(
    (files: StagedFile[], destinationId: string): string => {
      const jobId = uuid();
      const tasks: UploadTask[] = files.map((f) => ({
        id: uuid(),
        fileName: f.name,
        fileSize: f.size,
        fileType: f.type,
        status: "pending",
        retryCount: 0,
        maxRetries: 3,
      }));
      const path = findDestinationPath(persona.region, destinationId) ?? destinationId;
      const job: Job = {
        id: jobId,
        ownerId: persona.id,
        region: persona.region,
        destinationId,
        destinationPath: path,
        status: "pending",
        tasks,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setAllJobs((prev) => [job, ...prev]);
      logApi("POST", "/api/jobs");
      logApi("POST", `/api/jobs/${jobId.slice(0, 8)}/submit`);
      // kick off processing with staggered delays
      tasks.forEach((t, i) => scheduleTask(jobId, t.id, 600 + i * 700));
      return jobId;
    },
    [persona, logApi, scheduleTask],
  );

  const retryTask = useCallback(
    (jobId: string, taskId: string) => {
      logApi("POST", `/api/tasks/${taskId.slice(0, 8)}/retry`);
      setAllJobs((prev) =>
        updateTask(prev, jobId, taskId, (t) => ({
          status: "pending",
          error: undefined,
          retryCount: t.retryCount + 1,
        })),
      );
      scheduleTask(jobId, taskId, 500);
    },
    [logApi, scheduleTask],
  );

  const retryAllFailed = useCallback(
    (jobId: string) => {
      const job = allJobs.find((j) => j.id === jobId);
      if (!job) return;
      job.tasks
        .filter((t) => t.status === "failed")
        .forEach((t, i) => {
          window.setTimeout(() => retryTask(jobId, t.id), i * 200);
        });
    },
    [allJobs, retryTask],
  );

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const jobs = useMemo(
    () =>
      allJobs
        .filter((j) => j.ownerId === persona.id)
        .sort((a, b) => b.createdAt - a.createdAt),
    [allJobs, persona.id],
  );

  const getJob = useCallback(
    (id: string) => allJobs.find((j) => j.id === id),
    [allJobs],
  );

  const value: AppContextValue = {
    personas: PERSONAS,
    persona,
    setPersona,
    jobs,
    getJob,
    createJob,
    retryTask,
    retryAllFailed,
    wsStatus,
    apiOnline: true,
    lastApiCall,
  };

  // reference wsStatus setter to satisfy potential future use without lint noise
  void setWsStatus;

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function updateTask(
  jobs: Job[],
  jobId: string,
  taskId: string,
  patch: (t: UploadTask) => Partial<UploadTask>,
): Job[] {
  return jobs.map((job) => {
    if (job.id !== jobId) return job;
    const tasks = job.tasks.map((t) =>
      t.id === taskId ? { ...t, ...patch(t) } : t,
    );
    return { ...job, tasks, status: deriveJobStatus(tasks), updatedAt: Date.now() };
  });
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
