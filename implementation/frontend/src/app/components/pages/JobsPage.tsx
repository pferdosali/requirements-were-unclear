import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Inbox, RefreshCw, Search, UploadCloud } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { toast } from "sonner";
import type { JobStatus } from "../../lib/types";
import { useApp } from "../../lib/store";
import { JobCard } from "../jobs/JobCard";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { cn } from "../ui/utils";

type Filter = "all" | "active" | "completed" | "failed";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "failed", label: "Failed" },
];

function matchesFilter(status: JobStatus, filter: Filter): boolean {
  switch (filter) {
    case "active":
      return status === "pending" || status === "processing";
    case "completed":
      return status === "completed";
    case "failed":
      return status === "failed" || status === "partial";
    default:
      return true;
  }
}

export function JobsPage() {
  const { jobs, persona } = useApp();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [query, setQuery] = useState("");
  const [spin, setSpin] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs
      .filter((j) => matchesFilter(j.status, filter))
      .filter(
        (j) =>
          !q ||
          j.id.toLowerCase().includes(q) ||
          j.tasks.some((t) => t.fileName.toLowerCase().includes(q)),
      )
      .sort((a, b) =>
        sort === "newest" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt,
      );
  }, [jobs, filter, sort, query]);

  function refresh() {
    setSpin(true);
    setTimeout(() => setSpin(false), 700);
    toast.success("Jobs refreshed", { description: "GET /api/jobs — 200 OK" });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1>Jobs Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Upload jobs owned by {persona.name}. Statuses update live via WebSocket.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-border bg-card p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium transition",
                filter === f.id
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by job ID or file name…"
            className="pl-8"
          />
        </div>

        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="icon" onClick={refresh} aria-label="Refresh jobs">
          <RefreshCw className={cn("size-4", spin && "animate-spin")} />
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          isFiltered={jobs.length > 0}
          filter={filter}
          onUpload={() => navigate("/upload")}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {filtered.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function EmptyState({
  isFiltered,
  filter,
  onUpload,
}: {
  isFiltered: boolean;
  filter: Filter;
  onUpload: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 py-20 text-center">
      <span className="mb-4 flex size-16 items-center justify-center rounded-full bg-secondary text-primary">
        <Inbox className="size-8" />
      </span>
      {isFiltered ? (
        <p className="text-sm text-muted-foreground">No {filter} jobs found.</p>
      ) : (
        <>
          <p className="font-medium">No upload jobs yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start by uploading files to a destination.
          </p>
          <Button className="mt-4" onClick={onUpload}>
            <UploadCloud className="size-4" /> Go to Upload
          </Button>
        </>
      )}
    </div>
  );
}
