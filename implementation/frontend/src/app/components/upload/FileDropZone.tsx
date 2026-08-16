import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import type { StagedFile } from "../../lib/types";
import { formatBytes } from "../../lib/format";
import { uuid } from "../../lib/mock";
import { cn } from "../ui/utils";

const MAX_SIZE = 100 * 1024 * 1024; // 100MB

export function FileDropZone({ onAdd }: { onAdd: (files: StagedFile[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function ingest(fileList: FileList | null) {
    if (!fileList) return;
    const staged: StagedFile[] = [];
    let rejected = 0;
    Array.from(fileList).forEach((f) => {
      if (f.size > MAX_SIZE) {
        rejected++;
        return;
      }
      staged.push({
        id: uuid(),
        name: f.name,
        size: f.size,
        type: f.type || f.name.split(".").pop() || "unknown",
      });
    });
    if (rejected > 0) {
      toast.error(
        `${rejected} file${rejected > 1 ? "s" : ""} exceeded the ${formatBytes(MAX_SIZE)} limit and ${rejected > 1 ? "were" : "was"} skipped.`,
      );
    }
    if (staged.length) onAdd(staged);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        ingest(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="File drop zone. Press Enter to browse files."
      className={cn(
        "flex min-h-[300px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dragging
          ? "border-primary bg-secondary"
          : "border-border bg-card hover:border-primary/60 hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "mb-4 flex size-16 items-center justify-center rounded-full transition",
          dragging ? "bg-primary text-primary-foreground" : "bg-secondary text-primary",
        )}
      >
        <UploadCloud className="size-8" />
      </span>
      <p className="text-base font-medium">Drag and drop files here</p>
      <p className="mt-1 text-sm text-muted-foreground">or click to browse</p>
      <p className="mt-4 text-xs text-muted-foreground">
        Any file type · Max {formatBytes(MAX_SIZE)} per file · Encrypted in transit (HIPAA)
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          ingest(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
