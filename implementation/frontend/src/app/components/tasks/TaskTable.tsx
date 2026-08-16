import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, RotateCw } from "lucide-react";
import type { Job, UploadTask } from "../../lib/types";
import { fileExtension, formatBytes, shortId } from "../../lib/format";
import { useApp } from "../../lib/store";
import { TaskStatusBadge } from "../shared/StatusBadge";
import { Button } from "../ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../ui/utils";

export function TaskTable({ job }: { job: Job }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5 text-left font-medium">Task ID</th>
            <th className="px-3 py-2.5 text-left font-medium">File Name</th>
            <th className="px-3 py-2.5 text-left font-medium">Size</th>
            <th className="px-3 py-2.5 text-left font-medium">Status</th>
            <th className="px-3 py-2.5 text-left font-medium">Retries</th>
            <th className="px-3 py-2.5 text-left font-medium">Error</th>
            <th className="px-3 py-2.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {job.tasks.map((task) => (
            <TaskRow key={task.id} jobId={job.id} task={task} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TaskRow({ jobId, task }: { jobId: string; task: UploadTask }) {
  const { retryTask } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [flash, setFlash] = useState<"" | "ok" | "err">("");
  const prev = useRef(task.status);

  useEffect(() => {
    if (prev.current !== task.status) {
      if (task.status === "completed") setFlash("ok");
      else if (task.status === "failed") setFlash("err");
      prev.current = task.status;
      const t = setTimeout(() => setFlash(""), 800);
      return () => clearTimeout(t);
    }
  }, [task.status]);

  const busy = task.status === "processing" || task.status === "pending";

  return (
    <>
      <tr
        className={cn(
          "border-t border-border transition-colors",
          flash === "ok" && "bg-emerald-50 dark:bg-emerald-950/30",
          flash === "err" && "bg-red-50 dark:bg-red-950/30",
        )}
      >
        <td className="px-3 py-2.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <code className="font-mono text-xs text-muted-foreground">
                {shortId(task.id, 8)}
              </code>
            </TooltipTrigger>
            <TooltipContent>{task.id}</TooltipContent>
          </Tooltip>
        </td>
        <td className="max-w-[220px] px-3 py-2.5">
          <span className="block truncate font-medium">{task.fileName}</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {fileExtension(task.fileName)}
          </span>
        </td>
        <td className="px-3 py-2.5 text-muted-foreground">{formatBytes(task.fileSize)}</td>
        <td className="px-3 py-2.5">
          <TaskStatusBadge status={task.status} />
        </td>
        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
          {task.retryCount}/{task.maxRetries}
        </td>
        <td className="max-w-[220px] px-3 py-2.5">
          {task.error ? (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
            >
              <ChevronDown className={cn("size-3.5 transition", expanded && "rotate-180")} />
              {expanded ? "Hide error" : "Show error"}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right">
          {task.status === "failed" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={task.retryCount >= task.maxRetries}
              onClick={() => setConfirm(true)}
            >
              <RotateCw className="size-3.5" /> Retry
            </Button>
          ) : busy ? (
            <Loader2 className="ml-auto size-4 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      </tr>
      {expanded && task.error && (
        <tr className="border-t border-border bg-red-50/50 dark:bg-red-950/20">
          <td colSpan={7} className="px-3 py-2 font-mono text-xs text-destructive">
            {task.error}
          </td>
        </tr>
      )}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retry this task?</AlertDialogTitle>
            <AlertDialogDescription>
              "{task.fileName}" will be requeued for processing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => retryTask(jobId, task.id)}>
              Retry Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
