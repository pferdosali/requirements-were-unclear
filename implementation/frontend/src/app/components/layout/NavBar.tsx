import { NavLink, useNavigate } from "react-router";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Activity,
  ChevronDown,
  LogOut,
  Monitor,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { useApp } from "../../lib/store";
import { REGIONS } from "../../lib/mock";
import { cn } from "../ui/utils";
import { RegionBadge } from "../shared/RegionBadge";
import { PersonaAvatar } from "../shared/PersonaAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";

const TABS = [
  { to: "/upload", label: "Upload" },
  { to: "/jobs", label: "Jobs" },
  { to: "/destinations", label: "Destinations" },
];

const WS_STYLE = {
  connected: { dot: "bg-emerald-500", label: "Live updates active" },
  reconnecting: { dot: "bg-amber-500 animate-pulse", label: "Reconnecting…" },
  disconnected: { dot: "bg-red-500", label: "Disconnected" },
};

export function NavBar() {
  const { persona, personas, setPersona, wsStatus } = useApp();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  function switchPersona(id: string) {
    if (id === persona.id) return;
    const p = personas.find((x) => x.id === id)!;
    setPersona(id);
    toast.success(`Switched to ${p.name}`, {
      description: `${p.team} · ${REGIONS[p.region].label}`,
    });
  }

  const ws = WS_STYLE[wsStatus];

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-border bg-card/80 backdrop-blur">
      <div className="mx-auto flex h-full max-w-7xl items-center gap-4 px-6">
        {/* Logo */}
        <button
          onClick={() => navigate("/upload")}
          className="flex items-center gap-2"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">DocBridge</span>
        </button>

        {/* Center tabs */}
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition",
                  isActive
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {/* WebSocket indicator */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("size-2 rounded-full", ws.dot)} />
                <span className="hidden lg:inline">{ws.label}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>WebSocket: {ws.label}</TooltipContent>
          </Tooltip>

          <RegionBadge region={persona.region} clickable />

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
              <PersonaAvatar persona={persona} size="sm" />
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-medium leading-tight">
                  {persona.name}
                </span>
                <span className="block text-xs leading-tight text-muted-foreground">
                  {persona.team}
                </span>
              </span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="flex flex-col">
                <span>{persona.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {persona.team} · {REGIONS[persona.region].label} · {persona.role}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Activity className="size-3.5" /> Switch Persona
                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal">
                  dev
                </span>
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup value={persona.id} onValueChange={switchPersona}>
                {personas.map((p) => (
                  <DropdownMenuRadioItem key={p.id} value={p.id} className="text-sm">
                    <span className="flex-1">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {REGIONS[p.region].label}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Appearance
              </DropdownMenuLabel>
              <div className="flex gap-1 px-2 pb-1">
                {(
                  [
                    ["system", Monitor],
                    ["light", Sun],
                    ["dark", Moon],
                  ] as const
                ).map(([mode, Icon]) => (
                  <button
                    key={mode}
                    onClick={() => setTheme(mode)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs capitalize transition",
                      theme === mode
                        ? "border-primary bg-secondary text-secondary-foreground"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {mode}
                  </button>
                ))}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                <Settings className="size-4" /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => toast.info("Sign out is disabled in the dev environment.")}
              >
                <LogOut className="size-4" /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mobile tabs */}
      <nav className="flex items-center gap-1 border-t border-border px-4 py-2 md:hidden">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                "flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium transition",
                isActive
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
