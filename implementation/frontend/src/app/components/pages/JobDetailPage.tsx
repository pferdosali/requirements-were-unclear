import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Check, Copy, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../../lib/store";
import { jobStats } from "../../lib/jobStats";
import { absoluteTime, formatDuration, relativeTime } from "../../lib/format";
import { REGIONS } from "../../lib/mock";
import { JobStatusBadge, progressColor } from "../shared/StatusBadge";
import { RegionBadge } from "../shared/RegionBadge";
import { TaskTable } from "../tasks/TaskTable";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { cn } from "../ui/utils";

export function JobDetailPage() {
  const { jobId } = useParams();
  const { getJob, retryAllFailed } = useApp();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const job = jobId ? getJob(jobId) : undefined;

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="font-medium">Job not found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          It may belong to a different persona, or has been removed.
        </p>
        <Button className="mt-4" onClick={() => navigate("/jobs")}>
          Back to Jobs
        </Button>
      </div>
    );
  }

  const stats = jobStats(job);
  const failedCount = stats.failed;
  const durationMs = job.updatedAt - job.createdAt;
  const avgMs = stats.total ? durationMs / stats.total : 0;

  function copyId() {
    navigator.clipboard?.writeText(job!.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <Link
        to="/jobs"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All Jobs
      </Link>

      {/* Header */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 font-mono text-sm text-muted-foreground">
                {job.id}
              </code>
              <button
                onClick={copyId}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Copy job ID"
              >
                {copied ? (
                  <Check className="size-4 text-emerald-500" />
                ) : (
                  <Copy className="size-4" />
                )}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <RegionBadge region={job.region} />
              <span>{job.destinationPath}</span>
            </div>
          </div>
          <JobStatusBadge status={job.status} size="lg" />
        </div>

        <div className="mt-4 space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{stats.completed}/{stats.total} tasks completed</span>
            <span className="font-mono">{stats.percent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all duration-300", progressColor(job.status))}
              style={{ width: `${stats.percent}%` }}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span>Created: {absoluteTime(job.createdAt)} ({relativeTime(job.createdAt)})</span>
          <span>Updated: {relativeTime(job.updatedAt)}</span>
          <span>Storage: <code className="font-mono">{REGIONS[job.region].storage}</code></span>
        </div>
      </Card>

      {/* Tasks */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3>Tasks ({stats.total})</h3>
          {failedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                retryAllFailed(job.id);
                toast.success(`Retrying ${failedCount} failed task${failedCount > 1 ? "s" : ""}…`);
              }}
            >
              <RotateCw className="size-4" /> Retry All Failed ({failedCount})
            </Button>
          )}
        </div>
        <TaskTable job={job} />
      </div>

      {/* Summary footer */}
      <Card className="p-5">
        <h4 className="mb-3">Job Summary</h4>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Stat label="Total" value={stats.total} />
          <Stat label="Completed" value={stats.completed} tone="text-emerald-600 dark:text-emerald-400" />
          <Stat label="Failed" value={stats.failed} tone="text-red-600 dark:text-red-400" />
          <Stat label="Processing" value={stats.processing} tone="text-blue-600 dark:text-blue-400" />
          <Stat label="Pending" value={stats.pending} tone="text-muted-foreground" />
        </div>
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
          <span>Total duration: <span className="font-medium text-foreground">{formatDuration(durationMs)}</span></span>
          <span>Avg task duration: <span className="font-medium text-foreground">{formatDuration(avgMs)}</span></span>
        </div>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
      <p className={cn("text-2xl font-semibold", tone)}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
