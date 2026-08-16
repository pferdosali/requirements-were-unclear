import { Activity, MapPin, Radio, Server, Wifi } from "lucide-react";
import { toast } from "sonner";
import type { Persona } from "../../lib/types";
import { useApp } from "../../lib/store";
import { DESTINATIONS, REGIONS, countChildren } from "../../lib/mock";
import { PersonaAvatar } from "../shared/PersonaAvatar";
import { RegionBadge } from "../shared/RegionBadge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../ui/utils";

export function SettingsPage() {
  const { personas, persona, setPersona, wsStatus, apiOnline, lastApiCall } = useApp();

  function switchTo(p: Persona) {
    if (p.id === persona.id) return;
    setPersona(p.id);
    toast.success(`Switched to ${p.name}`, {
      description: `${p.team} · ${REGIONS[p.region].label}`,
    });
  }

  const meta = REGIONS[persona.region];
  const destCounts = countChildren(DESTINATIONS[persona.region]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1>Settings</h1>
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            dev only
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Persona switching, region context, and connection diagnostics. This page does not
          ship to production.
        </p>
      </div>

      {/* Persona cards */}
      <div>
        <h3 className="mb-3">Persona Switcher</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {personas.map((p) => {
            const active = p.id === persona.id;
            const pm = REGIONS[p.region];
            return (
              <button
                key={p.id}
                onClick={() => switchTo(p)}
                className={cn(
                  "flex items-start gap-4 rounded-xl border p-4 text-left transition",
                  active
                    ? "border-primary bg-secondary/60 ring-1 ring-primary/40"
                    : "border-border bg-card hover:border-primary/50 hover:bg-muted/40",
                )}
              >
                <PersonaAvatar persona={p} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{p.name}</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {p.role}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {p.id} · {p.team}
                  </p>
                  <div className="mt-2">
                    <RegionBadge region={p.region} />
                  </div>
                </div>
                <span
                  className={cn(
                    "mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition",
                    active ? "border-primary" : "border-muted-foreground/40",
                  )}
                  aria-hidden
                >
                  {active && <span className="size-2.5 rounded-full bg-primary" />}
                </span>
                <span className="sr-only">{pm.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Region context card */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="size-4 text-primary" /> Your Current Region
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
            <Row label="Region" value={meta.fullName} />
            <Row label="Team" value={persona.team} />
            <Row label="Storage" value={meta.storage} mono />
            <Row
              label="Destinations"
              value={`${destCounts.folders} available (${destCounts.binders} binders)`}
            />
          </div>
          <p className="mt-2 flex items-start gap-1.5 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <Activity className="mt-0.5 size-3.5 shrink-0" />
            Region is determined by your team assignment. Switch persona above to access a
            different region.
          </p>
        </CardContent>
      </Card>

      {/* Connection status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="size-4 text-primary" /> Connection Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <StatusLine
            icon={<Server className="size-4" />}
            label="API Status"
            ok={apiOnline}
            okText="Connected to localhost:3000"
            badText="Disconnected"
          />
          <StatusLine
            icon={<Wifi className="size-4" />}
            label="WebSocket"
            state={wsStatus}
          />
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-muted-foreground">Last API Call</span>
            <code className="font-mono text-xs">
              {lastApiCall
                ? `${lastApiCall.method} ${lastApiCall.path} — ${lastApiCall.status} OK — ${lastApiCall.ms}ms`
                : "—"}
            </code>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Active Persona Header</span>
            <code className="font-mono text-xs">x-user-id: {persona.id}</code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : "font-medium"}>{value}</span>
    </div>
  );
}

function StatusLine({
  icon,
  label,
  ok,
  okText,
  badText,
  state,
}: {
  icon: React.ReactNode;
  label: string;
  ok?: boolean;
  okText?: string;
  badText?: string;
  state?: "connected" | "reconnecting" | "disconnected";
}) {
  let dot = "bg-emerald-500";
  let text = okText ?? "Connected";
  if (state) {
    if (state === "connected") {
      dot = "bg-emerald-500";
      text = "Live updates active";
    } else if (state === "reconnecting") {
      dot = "bg-amber-500 animate-pulse";
      text = "Reconnecting…";
    } else {
      dot = "bg-red-500";
      text = "Disconnected";
    }
  } else if (ok === false) {
    dot = "bg-red-500";
    text = badText ?? "Disconnected";
  }
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon} {label}
      </span>
      <span className="flex items-center gap-2">
        <span className={cn("size-2 rounded-full", dot)} />
        {text}
      </span>
    </div>
  );
}
