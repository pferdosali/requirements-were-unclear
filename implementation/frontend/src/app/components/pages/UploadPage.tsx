import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowRight, FolderCheck, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { DestinationNode, StagedFile } from "../../lib/types";
import { useApp } from "../../lib/store";
import { REGIONS } from "../../lib/mock";
import { uploadFile } from "../../api/upload";
import { createJob as apiCreateJob, submitJob as apiSubmitJob } from "../../api/jobs";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
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
import { FileDropZone } from "../upload/FileDropZone";
import { FileList } from "../upload/FileList";
import { DestinationTree } from "../upload/DestinationTree";
import {
  UploadProgressModal,
  type FileProgress,
  type UploadStatus,
} from "../upload/UploadProgressModal";
import { RegionBadge } from "../shared/RegionBadge";
import { cn } from "../ui/utils";

export function UploadPage() {
  const { persona, destinationTree, refreshJobs } = useApp();
  const navigate = useNavigate();

  const [files, setFiles] = useState<StagedFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [destination, setDestination] = useState<DestinationNode | null>(null);
  const [showDestError, setShowDestError] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Upload state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [fileProgress, setFileProgress] = useState<FileProgress[]>([]);
  const [uploadError, setUploadError] = useState<string>();
  const cancelledRef = useRef(false);

  function addFiles(newFiles: StagedFile[]) {
    setFiles((prev) => [...newFiles, ...prev]);
  }
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(files.map((f) => f.id)) : new Set());
  }
  function remove(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }
  function clearAll() {
    setFiles([]);
    setSelected(new Set());
    setConfirmClear(false);
  }

  const canSubmit = files.length > 0 && !!destination;

  const handleSubmit = useCallback(async () => {
    if (!destination) {
      setShowDestError(true);
      toast.error("Please select a destination folder.");
      return;
    }
    if (files.length === 0) return;

    // Reset state
    cancelledRef.current = false;
    setUploadError(undefined);
    setUploadStatus("uploading");
    setFileProgress(files.map((f) => ({ id: f.id, name: f.name, size: f.size, percent: 0, done: false })));
    setUploadOpen(true);

    try {
      // Phase 1: Upload all files to S3 with real progress
      const uploadResults: Array<{ fileId: string; objectKey: string }> = [];

      for (let i = 0; i < files.length; i++) {
        if (cancelledRef.current) break;

        const staged = files[i];
        if (staged.file) {
          const result = await uploadFile(staged.file, (percent) => {
            setFileProgress((prev) =>
              prev.map((fp, idx) => idx === i ? { ...fp, percent } : fp),
            );
          });
          uploadResults.push(result);
        } else {
          uploadResults.push({ fileId: staged.id, objectKey: staged.id });
        }

        // Mark this file as done
        setFileProgress((prev) =>
          prev.map((fp, idx) => idx === i ? { ...fp, percent: 100, done: true } : fp),
        );
      }

      if (cancelledRef.current) {
        setUploadStatus("idle");
        setUploadOpen(false);
        return;
      }

      // Phase 2: Create job and submit
      setUploadStatus("submitting");

      const response = await apiCreateJob(
        uploadResults.map((r) => ({
          fileId: r.objectKey,
          destinationId: destination.id,
        })),
      );

      await apiSubmitJob(response.job.job_id);

      // Done!
      setUploadStatus("done");
      await refreshJobs();

      // Auto-navigate after brief delay
      setTimeout(() => {
        setUploadOpen(false);
        setFiles([]);
        setSelected(new Set());
        toast.success("Job submitted", {
          description: `${files.length} file${files.length > 1 ? "s" : ""} → ${destination.name}`,
        });
        navigate(`/jobs/${response.job.job_id}`);
      }, 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setUploadStatus("error");
      setUploadError(msg);
      toast.error("Upload failed", { description: msg });
    }
  }, [files, destination, navigate, refreshJobs]);

  return (
    <div className="space-y-6 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Upload Workspace</h1>
          <p className="text-sm text-muted-foreground">
            Stage documents and submit them to a secure clinical trial destination.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Region</span>
          <RegionBadge region={persona.region} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        {/* Left: drop zone + file list */}
        <div className="space-y-6">
          <FileDropZone onAdd={addFiles} />
          <div>
            <h3 className="mb-2">Selected files</h3>
            <FileList
              files={files}
              selected={selected}
              onToggle={toggle}
              onToggleAll={toggleAll}
              onRemove={remove}
              onClearAll={() => (files.length ? setConfirmClear(true) : null)}
            />
          </div>
        </div>

        {/* Right: destination selector */}
        <Card className="h-fit lg:sticky lg:top-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderCheck className="size-4 text-primary" />
              Destination
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Destinations are filtered to your region:{" "}
              <span className="font-medium">{REGIONS[persona.region].label}</span>. Only one
              folder per job.
            </p>
            <DestinationTree
              region={persona.region}
              selectedId={destination?.id}
              onSelect={(node) => {
                setDestination(node);
                setShowDestError(false);
              }}
              showCounts
              rootOverride={destinationTree ?? undefined}
            />
            <Separator />
            {destination ? (
              <div className="rounded-md bg-secondary px-3 py-2 text-sm">
                <span className="text-xs text-muted-foreground">Selected</span>
                <p className="font-medium">
                  {REGIONS[persona.region].label} →{" "}
                  {destination.name}
                </p>
              </div>
            ) : (
              <p
                className={cn(
                  "text-sm",
                  showDestError ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {showDestError ? (
                  <span className="inline-flex items-center gap-1">
                    <TriangleAlert className="size-4" /> Please select a destination
                  </span>
                ) : (
                  "No destination selected."
                )}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sticky submit bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <p className="text-sm text-muted-foreground">
            {files.length > 0 ? (
              <>
                <span className="font-medium text-foreground">
                  {files.length} file{files.length > 1 ? "s" : ""}
                </span>{" "}
                → {destination ? destination.name : "no destination"}
              </>
            ) : (
              "Add files to get started."
            )}
          </p>
          <Button size="lg" disabled={!canSubmit || uploadOpen} onClick={handleSubmit}>
            {uploadOpen ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Submitting…
              </>
            ) : (
              <>
                Submit Upload Job <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </div>
      </div>

      <UploadProgressModal
        open={uploadOpen}
        status={uploadStatus}
        fileProgress={fileProgress}
        error={uploadError}
        onCancel={() => {
          cancelledRef.current = true;
          setUploadOpen(false);
          setUploadStatus("idle");
          toast.info("Upload cancelled.");
        }}
      />

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all files?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all {files.length} staged files. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={clearAll}>Clear All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
