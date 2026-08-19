import type {
  DestinationNode,
  Job,
  Persona,
  Region,
  RegionMeta,
  UploadTask,
} from "./types";

export const REGIONS: Record<Region, RegionMeta> = {
  "us-east": {
    id: "us-east",
    label: "US-East",
    fullName: "United States (East)",
    storage: "regions/us-east-1/",
    dot: "bg-emerald-500",
    emoji: "🟢",
  },
  "eu-west": {
    id: "eu-west",
    label: "EU-West",
    fullName: "European Union (West)",
    storage: "regions/eu-west-1/",
    dot: "bg-blue-500",
    emoji: "🔵",
  },
  "ap-southeast": {
    id: "ap-southeast",
    label: "AP-Southeast",
    fullName: "Asia Pacific (Southeast)",
    storage: "regions/ap-southeast-1/",
    dot: "bg-orange-500",
    emoji: "🟠",
  },
};

export const PERSONAS: Persona[] = [
  {
    id: "user-1",
    name: "Alice Chen",
    email: "alice.chen@docbridge.health",
    team: "Team Alpha",
    teamId: "team-alpha",
    region: "us-east",
    role: "coordinator",
  },
  {
    id: "user-2",
    name: "Bob Mueller",
    email: "bob.mueller@docbridge.health",
    team: "Team Beta",
    teamId: "team-beta",
    region: "eu-west",
    role: "coordinator",
  },
  {
    id: "user-3",
    name: "Carol Tanaka",
    email: "carol.tanaka@docbridge.health",
    team: "Team Alpha",
    teamId: "team-alpha",
    region: "us-east",
    role: "reviewer",
  },
  {
    id: "user-4",
    name: "David Okafor",
    email: "david.okafor@docbridge.health",
    team: "Team Gamma",
    teamId: "team-gamma",
    region: "ap-southeast",
    role: "coordinator",
  },
  {
    id: "user-5",
    name: "Emma Johansson",
    email: "emma.johansson@docbridge.health",
    team: "Team Beta",
    teamId: "team-beta",
    region: "eu-west",
    role: "admin",
  },
];

export const DESTINATIONS: Record<Region, DestinationNode> = {
  "us-east": {
    id: "reg-us-east",
    name: "US-East",
    type: "region",
    region: "us-east",
    children: [
      {
        id: "team-alpha",
        name: "Team Alpha",
        type: "team",
        region: "us-east",
        children: [
          {
            id: "bind-regulatory",
            name: "Regulatory",
            type: "binder",
            region: "us-east",
            children: [
              { id: "fold-fda", name: "FDA Submissions", type: "folder", region: "us-east" },
              { id: "fold-irb", name: "IRB Approvals", type: "folder", region: "us-east" },
            ],
          },
          {
            id: "bind-clinical",
            name: "Clinical",
            type: "binder",
            region: "us-east",
            children: [
              { id: "fold-consent", name: "Patient Consent Forms", type: "folder", region: "us-east" },
              { id: "fold-adverse", name: "Adverse Event Reports", type: "folder", region: "us-east" },
            ],
          },
        ],
      },
    ],
  },
  "eu-west": {
    id: "reg-eu-west",
    name: "EU-West",
    type: "region",
    region: "eu-west",
    children: [
      {
        id: "team-beta",
        name: "Team Beta",
        type: "team",
        region: "eu-west",
        children: [
          {
            id: "bind-ema",
            name: "EMA Submissions",
            type: "binder",
            region: "eu-west",
            children: [
              { id: "fold-cta", name: "Clinical Trial Applications", type: "folder", region: "eu-west" },
              { id: "fold-safety", name: "Safety Reports", type: "folder", region: "eu-west" },
            ],
          },
          {
            id: "bind-site-docs",
            name: "Site Documents",
            type: "binder",
            region: "eu-west",
            children: [
              { id: "fold-ethics", name: "Ethics Committee", type: "folder", region: "eu-west" },
            ],
          },
        ],
      },
    ],
  },
  "ap-southeast": {
    id: "reg-ap-southeast",
    name: "AP-Southeast",
    type: "region",
    region: "ap-southeast",
    children: [
      {
        id: "team-gamma",
        name: "Team Gamma",
        type: "team",
        region: "ap-southeast",
        children: [
          {
            id: "bind-tga",
            name: "TGA Regulatory",
            type: "binder",
            region: "ap-southeast",
            children: [
              { id: "fold-ctn", name: "CTN Applications", type: "folder", region: "ap-southeast" },
              { id: "fold-safety-notif", name: "Safety Notifications", type: "folder", region: "ap-southeast" },
            ],
          },
          {
            id: "bind-site-files",
            name: "Site Files",
            type: "binder",
            region: "ap-southeast",
            children: [
              { id: "fold-brochures", name: "Investigator Brochures", type: "folder", region: "ap-southeast" },
            ],
          },
        ],
      },
    ],
  },
};

/** Find a folder node by id within a region tree, returning its breadcrumb path. */
export function findDestinationPath(region: Region, id: string): string | null {
  const root = DESTINATIONS[region];
  const trail: string[] = [];
  function walk(node: DestinationNode): boolean {
    trail.push(node.name);
    if (node.id === id) return true;
    if (node.children) {
      for (const child of node.children) {
        if (walk(child)) return true;
      }
    }
    trail.pop();
    return false;
  }
  return walk(root) ? trail.join(" → ") : null;
}

export function countChildren(node: DestinationNode): { binders: number; folders: number } {
  let binders = 0;
  let folders = 0;
  function walk(n: DestinationNode) {
    if (n.type === "binder") binders++;
    if (n.type === "folder") folders++;
    n.children?.forEach(walk);
  }
  node.children?.forEach(walk);
  return { binders, folders };
}

export function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const SAMPLE_FILES: Array<[string, number, string]> = [
  ["protocol-amendment-v3.pdf", 2_400_000, "application/pdf"],
  ["informed-consent-site-042.docx", 840_000, "application/vnd.openxmlformats"],
  ["adverse-event-log-Q3.xlsx", 1_120_000, "application/vnd.ms-excel"],
  ["lab-results-batch-118.csv", 320_000, "text/csv"],
  ["site-monitoring-report.pdf", 4_900_000, "application/pdf"],
  ["patient-crf-scan-0091.pdf", 12_500_000, "application/pdf"],
  ["irb-approval-letter.pdf", 680_000, "application/pdf"],
  ["safety-narrative-014.docx", 540_000, "application/vnd.openxmlformats"],
];

function makeTask(status: UploadTask["status"], i: number): UploadTask {
  const [name, size, type] = SAMPLE_FILES[i % SAMPLE_FILES.length];
  const failed = status === "failed";
  return {
    id: uuid(),
    fileName: name,
    fileSize: size,
    fileType: type,
    status,
    retryCount: failed ? 1 : 0,
    maxRetries: 3,
    error: failed ? "S3 upload timed out (504). Object not confirmed." : undefined,
    startedAt: Date.now() - 1000 * 60 * 5,
    completedAt: status === "completed" ? Date.now() - 1000 * 60 * 2 : undefined,
  };
}

function deriveJobStatus(tasks: UploadTask[]): Job["status"] {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const failed = tasks.filter((t) => t.status === "failed").length;
  const processing = tasks.filter((t) => t.status === "processing").length;
  if (completed === total) return "completed";
  if (failed === total) return "failed";
  if (processing > 0 || completed + failed < total) return "processing";
  if (failed > 0 && completed > 0) return "partial";
  return "pending";
}

interface JobSeed {
  region: Region;
  destinationId: string;
  statuses: UploadTask["status"][];
  ageMin: number;
}

const JOB_SEEDS: Record<string, JobSeed[]> = {
  "user-1": [
    { region: "us-east", destinationId: "fold-fda", statuses: ["completed", "completed", "completed"], ageMin: 180 },
    { region: "us-east", destinationId: "fold-adverse", statuses: ["completed", "failed", "completed", "processing"], ageMin: 12 },
    { region: "us-east", destinationId: "fold-consent", statuses: ["completed", "completed", "failed", "failed"], ageMin: 3 },
  ],
  "user-2": [
    { region: "eu-west", destinationId: "fold-cta", statuses: ["completed", "completed"], ageMin: 90 },
    { region: "eu-west", destinationId: "fold-safety", statuses: ["processing", "pending", "completed"], ageMin: 5 },
  ],
  "user-3": [
    { region: "us-east", destinationId: "fold-irb", statuses: ["completed", "completed", "completed", "completed"], ageMin: 240 },
  ],
  "user-4": [
    { region: "ap-southeast", destinationId: "fold-ctn", statuses: ["failed", "failed"], ageMin: 20 },
    { region: "ap-southeast", destinationId: "fold-brochures", statuses: ["completed", "processing"], ageMin: 2 },
  ],
  "user-5": [
    { region: "eu-west", destinationId: "fold-ethics", statuses: ["completed", "completed", "processing"], ageMin: 45 },
  ],
};

export function seedJobsForUser(userId: string): Job[] {
  const seeds = JOB_SEEDS[userId] ?? [];
  return seeds.map((seed) => {
    const tasks = seed.statuses.map((s, i) => makeTask(s, i));
    const created = Date.now() - seed.ageMin * 60 * 1000;
    return {
      id: uuid(),
      ownerId: userId,
      region: seed.region,
      destinationId: seed.destinationId,
      destinationPath: findDestinationPath(seed.region, seed.destinationId) ?? seed.destinationId,
      status: deriveJobStatus(tasks),
      tasks,
      createdAt: created,
      updatedAt: created,
    };
  });
}

export { deriveJobStatus };
