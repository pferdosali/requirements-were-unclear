import type { Persona, Region } from "../../lib/types";
import { cn } from "../ui/utils";

const RING: Record<Region, string> = {
  "us-east": "ring-emerald-400 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300",
  "eu-west": "ring-blue-400 text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300",
  "ap-southeast": "ring-orange-400 text-orange-700 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-300",
};

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function PersonaAvatar({
  persona,
  size = "md",
  className,
}: {
  persona: Persona;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeCls =
    size === "sm" ? "size-8 text-xs" : size === "lg" ? "size-14 text-lg" : "size-10 text-sm";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold ring-2",
        sizeCls,
        RING[persona.region],
        className,
      )}
      aria-hidden
    >
      {initials(persona.name)}
    </span>
  );
}
