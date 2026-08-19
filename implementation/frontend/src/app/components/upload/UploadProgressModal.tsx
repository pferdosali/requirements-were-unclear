import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import type { StagedFile } from "../../lib/types";
import { formatBytes } from "../../lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";

export type UploadStatus = "idle" | "uploading" | "submitting" | "done" | "error";

export interface FileProgress {
  id: string;
  name: string;
  size: number;
  percent: number; // 0–100
  done: boolean;
}

interface Props {
  open: boolean;
  status: UploadStatus;
  fileProgress: FileProgress[];
  error?: string;
  onCancel: () => void;
}

export function UploadProgressModal({ open, status, fileProgress, error, onCancel }: Props) {
  const allFilesDone = fileProgress.length > 0 && fileProgress.every((f) => f.done);
  const isDone = status === "done";
  const isError = status === "error";

  const overall = fileProgress.length
    ? Math.round(fileProgress.reduce((s, f) => s + f.percent, 0) / fileProgress.length)
    : 0;

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-lg [&>button:last-of-type]:hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isDone ? (
              <CheckCircle2 className="size-5 text-emerald-500" />
            ) : isError ? (
              <AlertCircle className="size-5 text-destructive" />
            ) : (
              <Loader2 className="size-5 animate-spin text-primary" />
            )}
            {isDone
              ? "Upload complete"
              : isError
              ? "Upload failed"
              : status === "submitting"
              ? "Submitting job..."
              : "Uploading files to secure storage"}
          </DialogTitle>
          <DialogDescription>
            {isDone
              ? "All files uploaded. Job submitted for processing."
              : isError
              ? error || "An error occurred during upload."
              : "Files are transferred directly to encrypted S3 storage via presigned URLs."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Overall progress</span>
            <span className="font-mono">{overall}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                isDone ? "bg-emerald-500" : isError ? "bg-destructive" : "bg-primary",
              )}
              style={{ width: `${overall}%` }}
            />
          </div>
        </div>

        <div className="max-h-64 space-y-3 overflow-auto pr-1">
          {fileProgress.map((f) => (
            <div key={f.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium">{f.name}</span>
                <span className="shrink-0 font-mono text-muted-foreground">
                  {f.done ? formatBytes(f.size) : `${f.percent}%`}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-200",
                    f.done ? "bg-emerald-500" : "bg-blue-500",
                  )}
                  style={{ width: `${f.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {!isDone && !isError && (
          <div className="flex justify-end">
            <Button variant="outline" onClick={onCancel}>
              Cancel remaining
            </Button>
          </div>
        )}
        {isError && (
          <div className="flex justify-end">
            <Button variant="outline" onClick={onCancel}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
