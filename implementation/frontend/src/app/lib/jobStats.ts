import type { Job } from "./types";

export interface JobStats {
  total: number;
  completed: number;
  failed: number;
  processing: number;
  pending: number;
  percent: number; // completed / total
}

export function jobStats(job: Job): JobStats {
  const total = job.tasks.length;
  const completed = job.tasks.filter((t) => t.status === "completed").length;
  const failed = job.tasks.filter((t) => t.status === "failed").length;
  const processing = job.tasks.filter((t) => t.status === "processing").length;
  const pending = job.tasks.filter((t) => t.status === "pending").length;
  return {
    total,
    completed,
    failed,
    processing,
    pending,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

export function taskSummary(job: Job): string {
  const s = jobStats(job);
  const parts = [`${s.completed}/${s.total} tasks completed`];
  if (s.failed) parts.push(`${s.failed} failed`);
  if (s.processing) parts.push(`${s.processing} processing`);
  if (s.pending) parts.push(`${s.pending} pending`);
  return parts.join(" · ");
}
