import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import type { JobStatus, TaskStatus } from "../../lib/types";
import { cn } from "../ui/utils";

const JOB_CONFIG: Record<
  JobStatus,
  { label: string; className: string; icon: React.ReactNode; animate?: boolean }
> = {
  pending: {
    label: "Pending",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
    icon: <CircleDashed className="size-3.5" />,
  },
  processing: {
    label: "Processing",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
    icon: <Loader2 className="size-3.5 animate-spin" />,
    animate: true,
  },
  completed: {
    label: "Completed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    icon: <CheckCircle2 className="size-3.5" />,
  },
  partial: {
    label: "Partial Success",
    className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    icon: <TriangleAlert className="size-3.5" />,
  },
  failed: {
    label: "Failed",
    className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
    icon: <XCircle className="size-3.5" />,
  },
};

const TASK_CONFIG: Record<
  TaskStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  pending: {
    label: "Pending",
    className: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    icon: <CircleDashed className="size-3.5" />,
  },
  processing: {
    label: "Processing",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
    icon: <Loader2 className="size-3.5 animate-spin" />,
  },
  completed: {
    label: "Completed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    icon: <CheckCircle2 className="size-3.5" />,
  },
  failed: {
    label: "Failed",
    className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
    icon: <XCircle className="size-3.5" />,
  },
};

export function JobStatusBadge({
  status,
  size = "sm",
}: {
  status: JobStatus;
  size?: "sm" | "lg";
}) {
  const cfg = JOB_CONFIG[status];
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "lg" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs",
        cfg.className,
      )}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const cfg = TASK_CONFIG[status];
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        cfg.className,
      )}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

/** Tailwind color used for progress bars per job status. */
export function progressColor(status: JobStatus): string {
  switch (status) {
    case "completed":
      return "bg-emerald-500";
    case "failed":
      return "bg-red-500";
    case "partial":
      return "bg-amber-500";
    default:
      return "bg-blue-500";
  }
}
