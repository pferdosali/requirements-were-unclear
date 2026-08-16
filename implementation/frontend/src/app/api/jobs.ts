/**
 * Jobs API: create, list, get, submit, retry
 */
import { api } from './client';

// --- Backend response types (matching actual API shapes) ---

export interface BackendJob {
  job_id: string;
  user_id: string;
  status: 'pending' | 'processing' | 'completed' | 'partial_success' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface BackendTask {
  task_id: string;
  job_id: string;
  file_id: string;
  destination_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retry_count: number;
  checksum: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateJobResponse {
  job: BackendJob;
  tasks: BackendTask[];
}

interface SubmitJobResponse {
  job: BackendJob;
  submitted: {
    taskCount: number;
    submittedAt: string;
  };
}

// --- API calls ---

export async function listJobs(): Promise<{ jobs: BackendJob[] }> {
  return api.get<{ jobs: BackendJob[] }>('/jobs');
}

export async function getJob(jobId: string): Promise<{ job: BackendJob }> {
  return api.get<{ job: BackendJob }>(`/jobs/${jobId}`);
}

export async function getJobTasks(jobId: string): Promise<{ tasks: BackendTask[] }> {
  return api.get<{ tasks: BackendTask[] }>(`/jobs/${jobId}/tasks`);
}

export async function createJob(
  tasks: Array<{ fileId: string; destinationId: string; checksum?: string }>,
): Promise<CreateJobResponse> {
  return api.post<CreateJobResponse>('/jobs', { tasks });
}

export async function submitJob(jobId: string): Promise<SubmitJobResponse> {
  return api.post<SubmitJobResponse>(`/jobs/${jobId}/submit`);
}

export async function retryTask(taskId: string): Promise<void> {
  await api.post(`/tasks/${taskId}/retry`);
}

// --- User info ---

export interface UserInfo {
  user: {
    userId: string;
    email: string;
  };
  team: {
    teamId: string;
    name: string;
    region: string;
  };
}

export async function getMe(): Promise<UserInfo> {
  return api.get<UserInfo>('/me');
}
