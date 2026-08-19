import { useNavigate } from "react-router";
import type { Region } from "../../lib/types";
import { REGIONS } from "../../lib/mock";
import { cn } from "../ui/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";

const STYLES: Record<Region, { wrap: string; dot: string }> = {
  "us-east": {
    wrap: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    dot: "bg-emerald-500",
  },
  "eu-west": {
    wrap: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
    dot: "bg-blue-500",
  },
  "ap-southeast": {
    wrap: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900",
    dot: "bg-orange-500",
  },
};

export function RegionBadge({
  region,
  clickable = false,
  pulse = false,
  className,
}: {
  region: Region;
  clickable?: boolean;
  pulse?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const meta = REGIONS[region];
  const style = STYLES[region];

  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
        style.wrap,
        clickable && "cursor-pointer hover:brightness-95",
        pulse && "animate-pulse",
        className,
      )}
      onClick={clickable ? () => navigate("/settings") : undefined}
      role={clickable ? "button" : undefined}
    >
      <span className={cn("size-2 rounded-full", style.dot)} />
      {meta.label}
    </span>
  );

  if (!clickable) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>
        Region: {meta.fullName} — determined by your team assignment
      </TooltipContent>
    </Tooltip>
  );
}
