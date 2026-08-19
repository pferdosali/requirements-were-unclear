import { useMemo, useState } from "react";
import {
  ChevronRight,
  Folder,
  FolderTree,
  Layers,
  Search,
  Users,
} from "lucide-react";
import type { DestinationNode, Region } from "../../lib/types";
import { DESTINATIONS } from "../../lib/mock";
import { cn } from "../ui/utils";
import { Input } from "../ui/input";

function nodeIcon(type: DestinationNode["type"]) {
  switch (type) {
    case "region":
      return <FolderTree className="size-4 text-primary" />;
    case "team":
      return <Users className="size-4 text-primary" />;
    case "binder":
      return <Layers className="size-4 text-amber-500" />;
    default:
      return <Folder className="size-4 text-blue-500" />;
  }
}

function matchesFilter(node: DestinationNode, q: string): boolean {
  if (!q) return true;
  if (node.name.toLowerCase().includes(q)) return true;
  return (node.children ?? []).some((c) => matchesFilter(c, q));
}

function collectIds(node: DestinationNode, acc: Set<string>) {
  acc.add(node.id);
  node.children?.forEach((c) => collectIds(c, acc));
}

interface TreeProps {
  region: Region;
  selectedId?: string | null;
  onSelect?: (node: DestinationNode) => void;
  /** When set, clicking any node (not just folders) selects it. */
  selectableTypes?: DestinationNode["type"][];
  showCounts?: boolean;
  /** Override the default static tree with API-fetched data */
  rootOverride?: DestinationNode;
}

export function DestinationTree({
  region,
  selectedId,
  onSelect,
  selectableTypes = ["folder"],
  showCounts = false,
  rootOverride,
}: TreeProps) {
  const root = rootOverride ?? DESTINATIONS[region];
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    collectIds(root, s); // expand all by default
    return s;
  });

  const q = query.trim().toLowerCase();

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function renderNode(node: DestinationNode, depth: number): React.ReactNode {
    if (!matchesFilter(node, q)) return null;
    const hasChildren = !!node.children?.length;
    const isOpen = expanded.has(node.id) || (!!q && matchesFilter(node, q));
    const isSelectable = selectableTypes.includes(node.type);
    const isSelected = selectedId === node.id;

    const counts = showCounts && hasChildren ? childCounts(node) : null;

    return (
      <div key={node.id}>
        <div
          className={cn(
            "group flex items-center gap-1 rounded-md py-1.5 pr-2 text-sm transition",
            isSelected
              ? "bg-secondary text-secondary-foreground ring-1 ring-primary/40"
              : "hover:bg-muted",
          )}
          style={{ paddingLeft: depth * 16 + 4 }}
        >
          <button
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded transition",
              !hasChildren && "invisible",
            )}
            onClick={() => toggle(node.id)}
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            <ChevronRight
              className={cn("size-4 text-muted-foreground transition", isOpen && "rotate-90")}
            />
          </button>
          <button
            className="flex flex-1 items-center gap-2 truncate text-left"
            onClick={() => (isSelectable ? onSelect?.(node) : toggle(node.id))}
          >
            {nodeIcon(node.type)}
            <span className="truncate">{node.name}</span>
            {counts && (
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {counts}
              </span>
            )}
          </button>
        </div>
        {hasChildren && isOpen && (
          <div>{node.children!.map((c) => renderNode(c, depth + 1))}</div>
        )}
      </div>
    );
  }

  const tree = useMemo(() => renderNode(root, 0), [root, expanded, q, selectedId]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter destinations…"
          className="pl-8"
        />
      </div>
      <div className="max-h-[420px] overflow-auto pr-1">{tree}</div>
    </div>
  );
}

function childCounts(node: DestinationNode): string {
  let binders = 0;
  let folders = 0;
  function walk(n: DestinationNode) {
    if (n.type === "binder") binders++;
    if (n.type === "folder") folders++;
    n.children?.forEach(walk);
  }
  node.children?.forEach(walk);
  const parts: string[] = [];
  if (binders) parts.push(`${binders} binder${binders > 1 ? "s" : ""}`);
  if (folders) parts.push(`${folders} folder${folders > 1 ? "s" : ""}`);
  return parts.join(" · ");
}
