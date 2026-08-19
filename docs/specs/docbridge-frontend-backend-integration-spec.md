# DocBridge — Frontend-to-Backend Integration Spec

## Overview

This spec defines the work required to integrate a Figma Make-generated React frontend with the existing DocBridge Express/TypeScript backend. The frontend is a Vite + React + Tailwind + shadcn/ui app. The backend runs on port 3000 with mock auth (`x-user-id` header).

**Goal:** Turn the static Figma-generated UI into a fully functional app connected to the real backend API, with working file uploads, job tracking, real-time updates, persona switching, and multi-region destination browsing.

**Prerequisites:**
- Figma Make has generated the React component shell (pages, components, layout)
- Backend is running locally (`npm run dev` in `implementation/api/`)
- S3 bucket `docbridge-blob-local` exists with CORS configured
- SQS queues running (LocalStack or real AWS)

---

## Task 1: Project Setup & Vite Proxy Configuration

### Description
Configure the Vite dev server to proxy API requests to the backend and set up the project structure for integration.

### Acceptance Criteria
- `vite.config.ts` proxies `/api/*` and `/health` to `http://localhost:3000`
- Environment variables defined in `.env.development`
- Project builds and runs with `npm run dev` on port 5173
- Navigating to `http://localhost:5173/api/health` returns the backend health response

### Implementation Details

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

```bash
# .env.development
VITE_API_BASE_URL=/api
VITE_WS_URL=ws://localhost:3000/ws
VITE_DEFAULT_PERSONA=user-1
```

---

## Task 2: TypeScript Types (Backend Response Contracts)

### Description
Define TypeScript interfaces matching the backend's actual API response shapes. These are the contracts between frontend and backend.

### Acceptance Criteria
- All types defined in `src/types/`
- Types match backend responses exactly (verified by running API and comparing)
- No `any` types in API integration code

### Implementation Details

```typescript
// src/types/user.ts
export interface UserInfo {
  userId: string;
  displayName: string;
  email: string;
  team: {
    teamId: string;
    teamName: string;
    region: string;
    regionDisplayName: string;
  };
  role: 'coordinator' | 'reviewer' | 'admin';
}

// src/types/job.ts
export type JobStatus = 'pending' | 'processing' | 'completed' | 'partial_success' | 'failed';

export interface Job {
  jobId: string;
  userId: string;
  status: JobStatus;
  region: string;
  destinationId: string;
  taskCount: number;
  completedCount: number;
  failedCount: number;
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
}

// src/types/task.ts
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Task {
  taskId: string;
  jobId: string;
  fileId: string;
  fileName: string;
  fileSizeBytes: number;
  destinationId: string;
  destinationRegion: string;
  status: TaskStatus;
  retryCount: number;
  maxRetries: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

// src/types/file.ts
export interface PresignResponse {
  fileId: string;
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
}

export interface ConfirmResponse {
  fileId: string;
  objectKey: string;
  confirmed: boolean;
}

// src/types/destination.ts
export interface Destination {
  id: string;
  region: string;
  team: string;
  binder: string;
  folder: string;
  path: string[];  // ["Team Alpha", "Regulatory", "FDA Submissions"]
}

export interface DestinationsResponse {
  region: string;
  regionDisplayName: string;
  destinations: Destination[];
}

// src/types/persona.ts
export interface Persona {
  userId: string;
  displayName: string;
  email: string;
  teamId: string;
  teamName: string;
  region: string;
  role: 'coordinator' | 'reviewer' | 'admin';
  avatar: string;
}
```

---

## Task 3: API Client Module

### Description
Create a centralized API client that handles all HTTP communication with the backend, including auth header injection, error handling, and response parsing.

### Acceptance Criteria
- Single `api.ts` module used by all components
- `x-user-id` header injected on every request from active persona
- Typed responses (no raw `fetch` calls in components)
- Error handling: network errors, 4xx, 5xx all handled gracefully
- Request/response logging in dev mode (console)

### Implementation Details

```typescript
// src/app/api.ts
import { getActivePersonaId } from './persona-store';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown,
  ) {
    super(`API Error ${status}: ${statusText}`);
  }
}

async function request<T>(
  method: string,
  path: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const personaId = getActivePersonaId();

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': personaId,
      ...options?.headers,
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, res.statusText, body);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export { ApiError };
```

---

## Task 4: Persona State Management

### Description
Implement persona switching — a React context that holds the active persona, persists to localStorage, and triggers data refresh on switch.

### Acceptance Criteria
- Active persona stored in React context + localStorage
- Switching persona updates `x-user-id` for all subsequent API calls
- Switching triggers re-fetch of user info, jobs, destinations
- Default persona loaded from localStorage on app start (fallback: `user-1`)
- `usePersona()` hook exposes: `activePersona`, `allPersonas`, `switchPersona()`

### Implementation Details

```typescript
// src/hooks/usePersona.ts
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { PERSONAS } from '@/config/personas';
import type { Persona } from '@/types/persona';

interface PersonaContextValue {
  activePersona: Persona;
  allPersonas: Persona[];
  switchPersona: (userId: string) => void;
}

const PersonaContext = createContext<PersonaContextValue | null>(null);

const STORAGE_KEY = 'docbridge-active-persona';

function getInitialPersona(): Persona {
  const stored = localStorage.getItem(STORAGE_KEY);
  const found = PERSONAS.find((p) => p.userId === stored);
  return found ?? PERSONAS[0];
}

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [activePersona, setActivePersona] = useState<Persona>(getInitialPersona);

  const switchPersona = useCallback((userId: string) => {
    const persona = PERSONAS.find((p) => p.userId === userId);
    if (!persona) return;
    localStorage.setItem(STORAGE_KEY, userId);
    setActivePersona(persona);
  }, []);

  return (
    <PersonaContext.Provider value={{ activePersona, allPersonas: PERSONAS, switchPersona }}>
      {children}
    </PersonaContext.Provider>
  );
}

export function usePersona() {
  const ctx = useContext(PersonaContext);
  if (!ctx) throw new Error('usePersona must be used within PersonaProvider');
  return ctx;
}
```

```typescript
// src/app/persona-store.ts
// Lightweight accessor for api.ts (avoids circular deps with React context)
const STORAGE_KEY = 'docbridge-active-persona';

export function getActivePersonaId(): string {
  return localStorage.getItem(STORAGE_KEY) || 'user-1';
}
```

```typescript
// src/config/personas.ts
import type { Persona } from '@/types/persona';

export const PERSONAS: Persona[] = [
  {
    userId: 'user-1',
    displayName: 'Alice Chen',
    email: 'alice.chen@docbridge.dev',
    teamId: 'team-a',
    teamName: 'Team Alpha',
    region: 'us-east-1',
    role: 'coordinator',
    avatar: 'AC',
  },
  {
    userId: 'user-2',
    displayName: 'Bob Mueller',
    email: 'bob.mueller@docbridge.dev',
    teamId: 'team-b',
    teamName: 'Team Beta',
    region: 'eu-west-1',
    role: 'coordinator',
    avatar: 'BM',
  },
  {
    userId: 'user-3',
    displayName: 'Carol Tanaka',
    email: 'carol.tanaka@docbridge.dev',
    teamId: 'team-a',
    teamName: 'Team Alpha',
    region: 'us-east-1',
    role: 'reviewer',
    avatar: 'CT',
  },
  {
    userId: 'user-4',
    displayName: 'David Okafor',
    email: 'david.okafor@docbridge.dev',
    teamId: 'team-c',
    teamName: 'Team Gamma',
    region: 'ap-southeast-1',
    role: 'coordinator',
    avatar: 'DO',
  },
  {
    userId: 'user-5',
    displayName: 'Emma Johansson',
    email: 'emma.johansson@docbridge.dev',
    teamId: 'team-b',
    teamName: 'Team Beta',
    region: 'eu-west-1',
    role: 'admin',
    avatar: 'EJ',
  },
];
```

---

## Task 5: Upload Flow Integration

### Description
Wire the file upload workflow to the real backend: presign → S3 PUT (with progress) → confirm → create job → submit.

### Acceptance Criteria
- Dropping files triggers presign requests (one per file)
- Files upload directly to S3 via presigned URL with XHR (for progress tracking)
- Upload progress shown per-file (0–100%)
- After all files uploaded, `POST /api/upload/confirm` called per file
- Job created with `POST /api/jobs` including all task references
- Job submitted with `POST /api/jobs/:jobId/submit`
- User redirected to job detail page on success
- Errors shown as toasts (presign failure, S3 upload failure, confirm failure)

### Implementation Details

```typescript
// src/hooks/useUpload.ts
import { useState, useCallback } from 'react';
import { api } from '@/app/api';
import type { PresignResponse, ConfirmResponse } from '@/types/file';
import type { Job } from '@/types/job';

interface FileUploadState {
  file: File;
  fileId: string | null;
  objectKey: string | null;
  progress: number;      // 0–100
  status: 'pending' | 'uploading' | 'confirming' | 'done' | 'error';
  error: string | null;
}

export function useUpload() {
  const [files, setFiles] = useState<FileUploadState[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addFiles = useCallback((newFiles: File[]) => {
    const states: FileUploadState[] = newFiles.map((file) => ({
      file,
      fileId: null,
      objectKey: null,
      progress: 0,
      status: 'pending',
      error: null,
    }));
    setFiles((prev) => [...prev, ...states]);
  }, []);

  const uploadFile = async (
    fileState: FileUploadState,
    onProgress: (progress: number) => void,
  ): Promise<{ fileId: string; objectKey: string }> => {
    // Step 1: Get presigned URL
    const presign = await api.post<PresignResponse>('/upload/presign', {
      fileName: fileState.file.name,
      contentType: fileState.file.type || 'application/octet-stream',
      fileSizeBytes: fileState.file.size,
    });

    // Step 2: Upload to S3 via XHR (for progress tracking)
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', presign.uploadUrl);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`S3 upload failed: ${xhr.status}`));
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(fileState.file);
    });

    // Step 3: Confirm upload
    await api.post<ConfirmResponse>('/upload/confirm', {
      objectKey: presign.objectKey,
    });

    return { fileId: presign.fileId, objectKey: presign.objectKey };
  };

  const submitJob = async (destinationId: string): Promise<Job> => {
    setIsSubmitting(true);

    try {
      // Upload all files
      const uploadResults: { fileId: string; objectKey: string }[] = [];

      for (let i = 0; i < files.length; i++) {
        setFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: 'uploading' } : f)),
        );

        const result = await uploadFile(files[i], (progress) => {
          setFiles((prev) =>
            prev.map((f, idx) => (idx === i ? { ...f, progress } : f)),
          );
        });

        uploadResults.push(result);
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: 'done', fileId: result.fileId, objectKey: result.objectKey } : f,
          ),
        );
      }

      // Create job with tasks
      const job = await api.post<Job>('/jobs', {
        destinationId,
        tasks: uploadResults.map((r) => ({
          fileId: r.fileId,
          destinationId,
        })),
      });

      // Submit job for processing
      await api.post(`/jobs/${job.jobId}/submit`);

      return job;
    } finally {
      setIsSubmitting(false);
    }
  };

  return { files, addFiles, submitJob, isSubmitting, setFiles };
}
```

### Key Notes
- Use `XMLHttpRequest` (not `fetch`) for upload progress events
- Do NOT set `Content-Type` header on S3 PUT — the presigned URL includes it
- Files over 100MB should be rejected client-side before presigning
- If any file upload fails, stop the batch and show error (don't create partial job)

---

## Task 6: Jobs List & Polling

### Description
Fetch the user's jobs and display them on the Jobs Dashboard. Support both polling and WebSocket updates.

### Acceptance Criteria
- Jobs fetched on page mount via `GET /api/jobs`
- Jobs re-fetched when persona changes
- Polling fallback: refetch every 5s when WebSocket is disconnected
- WebSocket updates patch individual jobs in-place (no full refetch)
- Loading skeleton shown during initial fetch
- Empty state shown when user has no jobs

### Implementation Details

```typescript
// src/hooks/useJobs.ts
import { useState, useEffect, useCallback } from 'react';
import { api } from '@/app/api';
import { usePersona } from './usePersona';
import { useWebSocket } from './useWebSocket';
import type { Job } from '@/types/job';

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { activePersona } = usePersona();
  const { lastMessage } = useWebSocket();

  const fetchJobs = useCallback(async () => {
    try {
      const data = await api.get<Job[]>('/jobs');
      setJobs(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch when persona changes
  useEffect(() => {
    setLoading(true);
    fetchJobs();
  }, [activePersona.userId, fetchJobs]);

  // Handle WebSocket job updates
  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === 'JOB_STATUS_UPDATE') {
      setJobs((prev) =>
        prev.map((job) =>
          job.jobId === lastMessage.payload.jobId
            ? { ...job, ...lastMessage.payload }
            : job,
        ),
      );
    }
  }, [lastMessage]);

  return { jobs, loading, error, refetch: fetchJobs };
}
```

---

## Task 7: Job Detail & Task List

### Description
Wire the Job Detail page to fetch job info and its tasks, with real-time task status updates and retry functionality.

### Acceptance Criteria
- `GET /api/jobs/:jobId` fetches job details
- `GET /api/jobs/:jobId/tasks` fetches task list
- Tasks update in real-time via WebSocket (`TASK_STATUS_UPDATE`)
- Retry button calls `POST /api/tasks/:taskId/retry`
- "Retry All Failed" button retries all failed tasks in sequence
- 403/404 redirects to jobs list with error toast

### Implementation Details

```typescript
// src/hooks/useJobDetail.ts
import { useState, useEffect, useCallback } from 'react';
import { api } from '@/app/api';
import { useWebSocket } from './useWebSocket';
import type { Job } from '@/types/job';
import type { Task } from '@/types/task';

export function useJobDetail(jobId: string) {
  const [job, setJob] = useState<Job | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { lastMessage } = useWebSocket();

  const fetchJob = useCallback(async () => {
    const [jobData, taskData] = await Promise.all([
      api.get<Job>(`/jobs/${jobId}`),
      api.get<Task[]>(`/jobs/${jobId}/tasks`),
    ]);
    setJob(jobData);
    setTasks(taskData);
    setLoading(false);
  }, [jobId]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  // Real-time task updates
  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === 'TASK_STATUS_UPDATE' && lastMessage.payload.jobId === jobId) {
      setTasks((prev) =>
        prev.map((t) =>
          t.taskId === lastMessage.payload.taskId
            ? { ...t, ...lastMessage.payload }
            : t,
        ),
      );
    }
    if (lastMessage.type === 'JOB_STATUS_UPDATE' && lastMessage.payload.jobId === jobId) {
      setJob((prev) => prev ? { ...prev, ...lastMessage.payload } : prev);
    }
  }, [lastMessage, jobId]);

  const retryTask = async (taskId: string) => {
    await api.post(`/tasks/${taskId}/retry`);
    // Task will transition back to 'pending' via WebSocket update
  };

  const retryAllFailed = async () => {
    const failedTasks = tasks.filter((t) => t.status === 'failed');
    for (const task of failedTasks) {
      await retryTask(task.taskId);
    }
  };

  return { job, tasks, loading, retryTask, retryAllFailed, refetch: fetchJob };
}
```

---

## Task 8: Destinations Fetching & Tree Rendering

### Description
Fetch destinations from `GET /api/destinations` (filtered by user's region) and render as a hierarchical tree for the Upload page destination selector and Destinations browse page.

### Acceptance Criteria
- Destinations fetched from backend (not hardcoded in frontend)
- Tree grouped by: Team → Binder → Folder
- Only shows destinations for the active persona's region
- Re-fetches when persona switches
- Selected destination stored in upload form state
- Search/filter works on folder names

### Implementation Details

```typescript
// src/hooks/useDestinations.ts
import { useState, useEffect, useMemo } from 'react';
import { api } from '@/app/api';
import { usePersona } from './usePersona';
import type { Destination, DestinationsResponse } from '@/types/destination';

export interface TreeNode {
  id: string;
  label: string;
  type: 'team' | 'binder' | 'folder';
  children: TreeNode[];
  destination?: Destination;  // Only on leaf nodes
}

export function useDestinations() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [region, setRegion] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const { activePersona } = usePersona();

  useEffect(() => {
    setLoading(true);
    api.get<DestinationsResponse>('/destinations').then((res) => {
      setDestinations(res.destinations);
      setRegion(res.region);
      setLoading(false);
    });
  }, [activePersona.userId]);

  // Build tree structure from flat list
  const tree = useMemo((): TreeNode[] => {
    const teamMap = new Map<string, Map<string, Destination[]>>();

    for (const dest of destinations) {
      if (!teamMap.has(dest.team)) teamMap.set(dest.team, new Map());
      const binderMap = teamMap.get(dest.team)!;
      if (!binderMap.has(dest.binder)) binderMap.set(dest.binder, []);
      binderMap.get(dest.binder)!.push(dest);
    }

    return Array.from(teamMap.entries()).map(([team, binderMap]) => ({
      id: `team-${team}`,
      label: team,
      type: 'team' as const,
      children: Array.from(binderMap.entries()).map(([binder, dests]) => ({
        id: `binder-${binder}`,
        label: binder,
        type: 'binder' as const,
        children: dests.map((dest) => ({
          id: dest.id,
          label: dest.folder,
          type: 'folder' as const,
          children: [],
          destination: dest,
        })),
      })),
    }));
  }, [destinations]);

  return { tree, destinations, region, loading };
}
```

---

## Task 9: WebSocket Integration

### Description
Establish a WebSocket connection for real-time job/task status updates. Handle reconnection, message parsing, and dispatching updates to React state.

### Acceptance Criteria
- WebSocket connects on app mount
- Reconnects with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- Connection status exposed to UI (connected/reconnecting/disconnected)
- Messages parsed and dispatched to subscribers (hooks)
- Falls back to polling if WebSocket unavailable

### Implementation Details

```typescript
// src/hooks/useWebSocket.ts
import { useState, useEffect, useRef, useCallback } from 'react';

export type WSStatus = 'connected' | 'reconnecting' | 'disconnected';

interface WSMessage {
  type: string;
  payload: Record<string, unknown>;
}

let globalWs: WebSocket | null = null;
let listeners: Set<(msg: WSMessage) => void> = new Set();

export function useWebSocket() {
  const [status, setStatus] = useState<WSStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);

  useEffect(() => {
    const listener = (msg: WSMessage) => setLastMessage(msg);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  useEffect(() => {
    if (globalWs && globalWs.readyState === WebSocket.OPEN) {
      setStatus('connected');
      return;
    }

    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws';
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setStatus('connected');
        retryCount = 0;
        globalWs = ws;
      };

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          listeners.forEach((fn) => fn(msg));
        } catch { /* ignore malformed messages */ }
      };

      ws.onclose = () => {
        globalWs = null;
        setStatus('reconnecting');
        const delay = Math.min(1000 * 2 ** retryCount, 30000);
        retryCount++;
        retryTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      clearTimeout(retryTimer);
      globalWs?.close();
      globalWs = null;
    };
  }, []);

  return { status, lastMessage };
}
```

### Note on Backend WebSocket Support
The current backend may not have WebSocket implemented yet (it's planned for Epic #7). If WebSocket is not available:
- The hook should detect connection failure and fall back to polling mode
- Polling: refetch active jobs/tasks every 5 seconds
- When WebSocket becomes available, the same hook interface works without component changes

---

## Task 10: Routing Setup

### Description
Configure React Router with routes matching the page structure.

### Acceptance Criteria
- Routes: `/upload`, `/jobs`, `/jobs/:jobId`, `/destinations`, `/settings`
- Default redirect: `/` → `/upload`
- 404 page for unknown routes
- Active nav tab highlights based on current route
- Browser back/forward works correctly

### Implementation Details

```typescript
// src/app/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PersonaProvider } from '@/hooks/usePersona';
import { AppShell } from '@/components/layout/AppShell';
import { UploadPage } from '@/pages/UploadPage';
import { JobsPage } from '@/pages/JobsPage';
import { JobDetailPage } from '@/pages/JobDetailPage';
import { DestinationsPage } from '@/pages/DestinationsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { Toaster } from '@/components/ui/toaster';

export function App() {
  return (
    <PersonaProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<Navigate to="/upload" replace />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/jobs/:jobId" element={<JobDetailPage />} />
            <Route path="/destinations" element={<DestinationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AppShell>
        <Toaster />
      </BrowserRouter>
    </PersonaProvider>
  );
}
```

---

## Task 11: Error Handling & Toast Notifications

### Description
Implement global error handling and a toast notification system for user feedback.

### Acceptance Criteria
- API errors show toast with error message
- Network errors show persistent banner
- 401 errors trigger persona selector prompt
- Success actions show brief green toast (upload submitted, retry triggered)
- Toasts auto-dismiss (5s for success/info, persistent for errors)
- No duplicate toasts for the same error

### Implementation Details

```typescript
// src/hooks/useToast.ts
// Use shadcn/ui toast or sonner library
// Wrap API calls with error-to-toast translation:

import { toast } from 'sonner'; // or shadcn toast
import { ApiError } from '@/app/api';

export function handleApiError(err: unknown, context?: string) {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      toast.error('Authentication required. Please select a persona.');
    } else if (err.status === 403) {
      toast.error('Access denied. You don\'t have permission for this action.');
    } else if (err.status === 404) {
      toast.error('Resource not found.');
    } else {
      toast.error(`${context || 'Request'} failed: ${err.statusText}`);
    }
  } else {
    toast.error('Network error. Please check your connection.');
  }
}
```

---

## Task 12: End-to-End Integration Test

### Description
Verify the complete flow works end-to-end: persona switch → upload files → submit → job appears → tasks process → status updates.

### Acceptance Criteria
- Can switch persona in UI and see region badge change
- Can drop files, see them in file list, select destination from tree
- Submit triggers upload progress → job creation → redirect to detail
- Job detail page shows tasks updating (via polling or WebSocket)
- Switching to different persona shows different jobs/destinations
- Retry button on failed tasks re-queues them

### Manual Test Checklist

```
[ ] Start backend: cd implementation/api && npm run dev
[ ] Start frontend: cd frontend && npm run dev
[ ] Open http://localhost:5173
[ ] Default persona is Alice Chen (user-1)
[ ] Region badge shows "🟢 US-East"
[ ] Navigate to Upload page
[ ] Drag 2–3 files into drop zone
[ ] Files appear in list with size and type
[ ] Destination tree shows Team Alpha folders (US-East)
[ ] Select "Regulatory → FDA Submissions"
[ ] Click "Submit Upload Job"
[ ] Progress modal shows per-file upload progress
[ ] After upload: redirected to Job Detail page
[ ] Job status shows "processing"
[ ] Tasks show "pending" → "processing" → "completed"
[ ] Navigate to Jobs page → job appears in list
[ ] Switch persona to Bob Mueller (user-2) via nav dropdown
[ ] Region badge changes to "🔵 EU-West"
[ ] Toast: "Switched to Bob Mueller (Team Beta · EU-West)"
[ ] Jobs page now empty (Bob has no jobs)
[ ] Upload page destination tree shows EU-West folders
[ ] Navigate to Settings → see all persona cards
[ ] Switch to David Okafor
[ ] Region badge changes to "🟠 AP-Southeast"
```

---

## Dependencies & Packages to Install

```bash
npm install react-router-dom sonner
npm install -D @types/react-router-dom
```

shadcn/ui components needed (if not already added by Figma Make):
```bash
npx shadcn-ui add button dialog dropdown-menu toast badge progress table card tabs input
```

---

## Running the Full Stack Locally

```bash
# Terminal 1: Backend API
cd implementation/api
npm run dev          # Starts Express on :3000

# Terminal 2: Backend Worker (optional, for processing tasks)
cd implementation/api
npm run dev:worker   # Starts SQS consumer

# Terminal 3: Frontend
cd frontend          # or wherever Figma Make outputs the React app
npm install
npm run dev          # Starts Vite on :5173

# Terminal 4: LocalStack (optional, for SQS/S3 local)
docker run -p 4566:4566 localstack/localstack
```

Open `http://localhost:5173` — the full app should work with the Vite proxy forwarding API calls to the backend.

---

## Sequence of Implementation

Recommended order (each task builds on the previous):

1. **Task 1** — Project setup + proxy (foundation)
2. **Task 2** — Types (contracts needed by everything else)
3. **Task 3** — API client (all hooks depend on this)
4. **Task 4** — Persona state (auth needed before data fetching)
5. **Task 10** — Routing (page structure)
6. **Task 6** — Jobs list (simplest data fetch, validates API works)
7. **Task 8** — Destinations (needed before upload flow)
8. **Task 5** — Upload flow (most complex, needs destinations working)
9. **Task 7** — Job detail + retry (builds on jobs list)
10. **Task 9** — WebSocket (enhancement over polling)
11. **Task 11** — Error handling (polish)
12. **Task 12** — End-to-end test (validation)
