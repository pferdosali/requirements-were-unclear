import { CheckCircle2, FileText, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { StagedFile } from "../../lib/types";
import { fileExtension, formatBytes } from "../../lib/format";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";

interface Props {
  files: StagedFile[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
}

export function FileList({
  files,
  selected,
  onToggle,
  onToggleAll,
  onRemove,
  onClearAll,
}: Props) {
  const total = files.reduce((s, f) => s + f.size, 0);
  const allChecked = files.length > 0 && selected.size === files.length;

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 py-12 text-center">
        <FileText className="mb-2 size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No files selected. Drag files above or browse.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="w-10 px-3 py-2.5 text-left">
              <Checkbox
                checked={allChecked}
                onCheckedChange={(c) => onToggleAll(!!c)}
                aria-label="Select all files"
              />
            </th>
            <th className="px-3 py-2.5 text-left font-medium">File name</th>
            <th className="px-3 py-2.5 text-left font-medium">Size</th>
            <th className="px-3 py-2.5 text-left font-medium">Type</th>
            <th className="px-3 py-2.5 text-left font-medium">Status</th>
            <th className="w-10 px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {files.map((f) => (
              <motion.tr
                key={f.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="border-t border-border"
              >
                <td className="px-3 py-2.5">
                  <Checkbox
                    checked={selected.has(f.id)}
                    onCheckedChange={() => onToggle(f.id)}
                    aria-label={`Select ${f.name}`}
                  />
                </td>
                <td className="max-w-[280px] px-3 py-2.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="block truncate font-medium">{f.name}</span>
                    </TooltipTrigger>
                    <TooltipContent>{f.name}</TooltipContent>
                  </Tooltip>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {formatBytes(f.size)}
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                    {fileExtension(f.name)}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3.5" /> Ready
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemove(f.id)}
                    aria-label={`Remove ${f.name}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
      <div className="flex items-center justify-between border-t border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <span>
          {selected.size > 0 ? `${selected.size} of ` : ""}
          {files.length} file{files.length > 1 ? "s" : ""} · {formatBytes(total)}
        </span>
        <button
          onClick={onClearAll}
          className="font-medium text-destructive hover:underline"
        >
          Clear All
        </button>
      </div>
    </div>
  );
}
