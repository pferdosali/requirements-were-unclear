import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
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

interface Props {
  open: boolean;
  files: StagedFile[];
  onCancel: () => void;
  onComplete: () => void;
}

export function UploadProgressModal({ open, files, onCancel, onComplete }: Props) {
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [done, setDone] = useState(false);
  const interval = useRef<number | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setProgress({});
      setDone(false);
      completedRef.current = false;
      return;
    }
    setProgress(Object.fromEntries(files.map((f) => [f.id, 0])));

    interval.current = window.setInterval(() => {
      setProgress((prev) => {
        const next = { ...prev };
        let allDone = true;
        for (const f of files) {
          const cur = next[f.id] ?? 0;
          if (cur < 100) {
            // larger files climb slower
            const step = 6 + Math.random() * 14 * (5_000_000 / (f.size + 1_000_000));
            next[f.id] = Math.min(100, cur + step);
          }
          if ((next[f.id] ?? 0) < 100) allDone = false;
        }
        if (allDone && !completedRef.current) {
          completedRef.current = true;
          setDone(true);
          window.setTimeout(onComplete, 900);
        }
        return next;
      });
    }, 220);

    return () => {
      if (interval.current) window.clearInterval(interval.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const overall = files.length
    ? Math.round(
        files.reduce((s, f) => s + (progress[f.id] ?? 0), 0) / files.length,
      )
    : 0;

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-lg [&>button:last-of-type]:hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {done ? (
              <CheckCircle2 className="size-5 text-emerald-500" />
            ) : (
              <Loader2 className="size-5 animate-spin text-primary" />
            )}
            {done ? "Upload complete" : "Uploading files to secure storage"}
          </DialogTitle>
          <DialogDescription>
            {done
              ? "All files uploaded. Job submitted for processing."
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
                done ? "bg-emerald-500" : "bg-primary",
              )}
              style={{ width: `${overall}%` }}
            />
          </div>
        </div>

        <div className="max-h-64 space-y-3 overflow-auto pr-1">
          {files.map((f) => {
            const pct = Math.round(progress[f.id] ?? 0);
            const speed = (2 + Math.random() * 6).toFixed(1);
            return (
              <div key={f.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium">{f.name}</span>
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {pct < 100 ? `${speed} MB/s` : formatBytes(f.size)}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-200",
                      pct >= 100 ? "bg-emerald-500" : "bg-blue-500",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {!done && (
          <div className="flex justify-end">
            <Button variant="outline" onClick={onCancel}>
              Cancel remaining
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
