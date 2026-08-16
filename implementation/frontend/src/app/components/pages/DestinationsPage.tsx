import { useMemo, useState } from "react";
import { Link } from "react-router";
import { FolderTree, Info } from "lucide-react";
import type { DestinationNode } from "../../lib/types";
import { useApp } from "../../lib/store";
import { REGIONS, countChildren, findDestinationPath } from "../../lib/mock";
import { DestinationTree } from "../upload/DestinationTree";
import { RegionBadge } from "../shared/RegionBadge";
import { JobStatusBadge } from "../shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { relativeTime, shortId } from "../../lib/format";

export function DestinationsPage() {
  const { persona, jobs } = useApp();
  const region = persona.region;
  const [selected, setSelected] = useState<DestinationNode | null>(null);
  const meta = REGIONS[region];

  const path = selected ? findDestinationPath(region, selected.id) : null;
  const counts = selected ? countChildren(selected) : null;
  const childCount = selected?.children?.length ?? 0;

  const recentJobs = useMemo(
    () =>
      selected
        ? jobs
            .filter((j) => j.destinationId === selected.id)
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 5)
        : [],
    [selected, jobs],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1>Destinations Browser</h1>
        <p className="text-sm text-muted-foreground">
          Read-only view of the destination hierarchy for your region. Selection for uploads
          happens on the Upload page.
        </p>
      </div>

      {/* Region banner */}
      <Card className="border-l-4 border-l-primary p-4">
        <div className="flex flex-wrap items-center gap-3">
          <FolderTree className="size-5 text-primary" />
          <div>
            <p className="text-sm font-medium">
              Showing destinations for {meta.emoji} {meta.label} ({persona.team})
            </p>
            <p className="text-xs text-muted-foreground">
              Switch persona to view other regions.
            </p>
          </div>
          <RegionBadge region={region} clickable className="ml-auto" />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{meta.label} Tree</CardTitle>
          </CardHeader>
          <CardContent>
            <DestinationTree
              region={region}
              selectedId={selected?.id}
              onSelect={setSelected}
              selectableTypes={["region", "team", "binder", "folder"]}
              showCounts
            />
          </CardContent>
        </Card>

        {/* Detail panel */}
        <Card className="h-fit lg:sticky lg:top-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="size-4 text-primary" /> Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <p className="text-sm text-muted-foreground">
                Select a node in the tree to view its metadata.
              </p>
            ) : (
              <div className="space-y-3 text-sm">
                <Field label="Name" value={selected.name} />
                <Field label="Full path" value={path ?? "—"} />
                <Field label="Region" value={meta.fullName} />
                <Field label="Type" value={selected.type} mono />
                <Field
                  label="Child items"
                  value={
                    selected.type === "folder"
                      ? "0 (leaf)"
                      : `${childCount} direct · ${counts?.binders ?? 0} binders, ${counts?.folders ?? 0} folders`
                  }
                />
                <Field label="Destination ID" value={selected.id} mono />

                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Recent jobs here
                  </p>
                  {recentJobs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No recent jobs target this destination.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {recentJobs.map((j) => (
                        <li key={j.id} className="flex items-center justify-between gap-2">
                          <Link
                            to={`/jobs/${j.id}`}
                            className="font-mono text-xs text-primary hover:underline"
                          >
                            {shortId(j.id, 8)}
                          </Link>
                          <JobStatusBadge status={j.status} />
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {relativeTime(j.createdAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={mono ? "font-mono text-xs" : "font-medium"}>{value}</p>
    </div>
  );
}
