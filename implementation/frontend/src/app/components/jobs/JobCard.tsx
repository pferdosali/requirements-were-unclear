import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Check, Copy } from "lucide-react";
import { motion } from "motion/react";
import type { Job } from "../../lib/types";
import { jobStats, taskSummary } from "../../lib/jobStats";
import { absoluteTime, relativeTime, shortId } from "../../lib/format";
import { JobStatusBadge, progressColor } from "../shared/StatusBadge";
import { Card } from "../ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../ui/utils";

export function JobCard({ job }: { job: Job }) {
  const stats = jobStats(job);
  const [copied, setCopied] = useState(false);
  const [flash, setFlash] = useState(false);
  const prevStatus = useRef(job.status);

  // pulse on status change (simulated websocket update)
  useEffect(() => {
    if (prevStatus.current !== job.status) {
      prevStatus.current = job.status;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 700);
      return () => clearTimeout(t);
    }
  }, [job.status]);

  function copyId(e: React.MouseEvent) {
    e.preventDefault();
    navigator.clipboard?.writeText(job.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <motion.div layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
      <Card
        className={cn(
          "p-4 transition-shadow hover:shadow-md",
          flash && "ring-2 ring-primary/50",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {shortId(job.id, 13)}
            </code>
            <button
              onClick={copyId}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Copy job ID"
            >
              {copied ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </button>
          </div>
          <JobStatusBadge status={job.status} />
        </div>

        <div className="mt-3 space-y-1.5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all duration-300", progressColor(job.status))}
              style={{ width: `${stats.percent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{taskSummary(job)}</p>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">{job.destinationPath}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>{relativeTime(job.createdAt)}</span>
            </TooltipTrigger>
            <TooltipContent>{absoluteTime(job.createdAt)}</TooltipContent>
          </Tooltip>
        </div>

        <div className="mt-3 border-t border-border pt-3">
          <Link
            to={`/jobs/${job.id}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            View Details <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </Card>
    </motion.div>
  );
}
