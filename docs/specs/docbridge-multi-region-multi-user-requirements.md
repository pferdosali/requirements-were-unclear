# DocBridge — Multi-Region Simulation & Multi-User Testing Requirements

## Purpose

This document defines requirements for simulating multi-region support using S3 and implementing multi-user persona switching for testing upload workflows end-to-end. These capabilities enable development and demo scenarios without deploying real multi-region infrastructure.

---

## Part 1: Multi-Region Simulation in S3

### Current State
- Single S3 bucket: `docbridge-blob-local` in `us-east-1`
- All uploads land in: `uploads/{userId}/{fileId}/{fileName}`
- Team-to-region mapping exists in `team-service.ts` but routing is not reflected in storage
- No regional separation of uploaded files

### Goal
Simulate regional isolation using S3 prefixes (or separate buckets) so that:
- Files uploaded by users in different regions are stored in regionally-separated paths
- Destination routing writes to region-specific locations
- The system behaves as if multi-region infrastructure exists, using a single AWS account

---

### Option A: Region-Prefixed Paths (Recommended for Dev)

Use a single S3 bucket with region-based key prefixes to simulate regional separation.

#### S3 Key Structure
```
s3://docbridge-blob-local/
├── regions/
│   ├── us-east-1/
│   │   └── uploads/{userId}/{fileId}/{fileName}
│   ├── eu-west-1/
│   │   └── uploads/{userId}/{fileId}/{fileName}
│   └── ap-southeast-1/
│       └── uploads/{userId}/{fileId}/{fileName}
└── delivered/
    ├── us-east-1/
    │   └── {destinationId}/{jobId}/{taskId}/{fileName}
    ├── eu-west-1/
    │   └── {destinationId}/{jobId}/{taskId}/{fileName}
    └── ap-southeast-1/
        └── {destinationId}/{jobId}/{taskId}/{fileName}
```

**`regions/` prefix** — Raw uploads, partitioned by the user's team region  
**`delivered/` prefix** — Files "delivered" to destinations (simulates successful destination API delivery)

#### Implementation Changes

| Component | Change |
|-----------|--------|
| `upload-service.ts` | Resolve user's region via team-service, inject region prefix into `objectKey` |
| `POST /api/upload/presign` | Response `objectKey` becomes `regions/{region}/uploads/{userId}/{fileId}/{fileName}` |
| `POST /api/upload/confirm` | Validates file at region-prefixed path |
| `task-processor.ts` | On successful "delivery", copies/moves file to `delivered/{region}/{destinationId}/...` |
| `team-service.ts` | Already maps teams to regions — no change needed |

#### Presign Endpoint Change
```typescript
// Before
const objectKey = `uploads/${userId}/${fileId}/${fileName}`;

// After
const region = await teamService.getRegionForUser(userId);
const objectKey = `regions/${region}/uploads/${userId}/${fileId}/${fileName}`;
```

#### Task Processor — Simulated Delivery
Instead of calling a real external Destination API, the worker "delivers" by copying the file to the delivered path:

```typescript
async function simulateDelivery(task: Task): Promise<void> {
  const sourceKey = task.sourceObjectKey; // regions/us-east-1/uploads/...
  const deliveredKey = `delivered/${task.destinationRegion}/${task.destinationId}/${task.jobId}/${task.taskId}/${task.fileName}`;
  
  await s3.copyObject({
    Bucket: BUCKET_NAME,
    CopySource: `${BUCKET_NAME}/${sourceKey}`,
    Key: deliveredKey,
  });
}
```

---

### Option B: Separate Buckets per Region (Closer to Production)

Create multiple S3 buckets to simulate truly separate regional storage.

#### Bucket Layout
| Bucket | Region (simulated) | Purpose |
|--------|-------------------|---------|
| `docbridge-blob-us-east-1` | US-East | Uploads + delivery for Region A |
| `docbridge-blob-eu-west-1` | EU-West | Uploads + delivery for Region B |
| `docbridge-blob-ap-southeast-1` | AP-Southeast | Uploads + delivery for Region C |

#### Implementation
- `upload-service.ts` resolves bucket name from user's team region
- Presigned URLs point to the correct bucket
- Worker reads from source bucket, writes to destination bucket
- All buckets in same AWS account / same physical region (us-east-1) — only the naming simulates multi-region

#### When to Use This
- When preparing for actual multi-region deployment
- When testing cross-bucket IAM policies
- When validating bucket-level encryption key separation

**Recommendation:** Start with Option A (prefixed paths) for immediate dev. Graduate to Option B when closer to production deployment.

---

### Region Configuration

Add a region configuration module:

```typescript
// src/config/regions.ts
export interface RegionConfig {
  id: string;
  name: string;
  displayName: string;
  s3Prefix: string;        // Option A
  bucketName?: string;     // Option B
  destinationEndpoint: string; // Mock endpoint URL
}

export const REGIONS: RegionConfig[] = [
  {
    id: 'us-east-1',
    name: 'US-East',
    displayName: 'United States (East)',
    s3Prefix: 'regions/us-east-1',
    destinationEndpoint: 'http://localhost:3001/destinations/us-east',
  },
  {
    id: 'eu-west-1',
    name: 'EU-West',
    displayName: 'Europe (Ireland)',
    s3Prefix: 'regions/eu-west-1',
    destinationEndpoint: 'http://localhost:3001/destinations/eu-west',
  },
  {
    id: 'ap-southeast-1',
    name: 'AP-Southeast',
    displayName: 'Asia Pacific (Singapore)',
    s3Prefix: 'regions/ap-southeast-1',
    destinationEndpoint: 'http://localhost:3001/destinations/ap-southeast',
  },
];
```

---

### Destination Mock Service

Create a lightweight mock destination API that simulates what external document platforms would do:

```typescript
// src/mock/destination-mock-server.ts
// Runs on :3001 during development

// Endpoints:
// POST /destinations/:region/upload
//   - Accepts multipart file upload
//   - Simulates latency (configurable: 500ms–3000ms)
//   - Simulates failure rate (configurable: 0%–30%)
//   - Returns { success: true, deliveryId: uuid } or { error: "timeout" }

// GET /destinations/:region/health
//   - Returns region status

// Query params for testing:
//   ?delay=2000        → Add 2s artificial delay
//   ?fail_rate=0.2     → 20% random failure rate
//   ?simulate_failure=true → Always fail (for retry testing)
```

---

### Verification: How to Confirm Multi-Region Works

| Test | Expected Result |
|------|-----------------|
| User-1 (Team Alpha, US-East) uploads a file | File appears at `regions/us-east-1/uploads/user-1/...` |
| User-2 (Team Beta, EU-West) uploads a file | File appears at `regions/eu-west-1/uploads/user-2/...` |
| User-4 (Team Gamma, AP-Southeast) uploads a file | File appears at `regions/ap-southeast-1/uploads/user-4/...` |
| Task processor completes a US-East task | File copied to `delivered/us-east-1/{destId}/...` |
| Task processor completes an EU-West task | File copied to `delivered/eu-west-1/{destId}/...` |
| User-1 cannot see User-2's jobs | API returns only jobs for authenticated user |
| Destination tree for User-1 shows only US-East locations | Tree filtered by region |

---

## Part 2: Multi-User Persona Simulation

### Current State
- Auth uses `x-user-id` header (mock middleware)
- Single hardcoded user (`user-1`) in the frontend
- `team-service.ts` maps user IDs to teams
- Teams map to regions

### Goal
Support switching between multiple simulated user personas in the frontend and backend to test:
- Different users see different jobs (ownership isolation)
- Different teams see different destinations (region filtering)
- Upload routing varies by persona's region
- Concurrent user scenarios without real auth

---

### Persona Definitions

```typescript
// src/config/personas.ts
export interface Persona {
  userId: string;
  displayName: string;
  email: string;
  teamId: string;
  teamName: string;
  region: string;
  role: 'coordinator' | 'reviewer' | 'admin';
  avatar: string; // URL or initials
}

export const PERSONAS: Persona[] = [
  {
    userId: 'user-1',
    displayName: 'Alice Chen',
    email: 'alice.chen@docbridge.dev',
    teamId: 'team-a',
    teamName: 'Team Alpha',
    region: 'us-east-1',
    role: 'coordinator',
    avatar: 'AC',
  },
  {
    userId: 'user-2',
    displayName: 'Bob Mueller',
    email: 'bob.mueller@docbridge.dev',
    teamId: 'team-b',
    teamName: 'Team Beta',
    region: 'eu-west-1',
    role: 'coordinator',
    avatar: 'BM',
  },
  {
    userId: 'user-3',
    displayName: 'Carol Tanaka',
    email: 'carol.tanaka@docbridge.dev',
    teamId: 'team-a',
    teamName: 'Team Alpha',
    region: 'us-east-1',
    role: 'reviewer',
    avatar: 'CT',
  },
  {
    userId: 'user-4',
    displayName: 'David Okafor',
    email: 'david.okafor@docbridge.dev',
    teamId: 'team-c',
    teamName: 'Team Gamma',
    region: 'ap-southeast-1',
    role: 'coordinator',
    avatar: 'DO',
  },
  {
    userId: 'user-5',
    displayName: 'Emma Johansson',
    email: 'emma.johansson@docbridge.dev',
    teamId: 'team-b',
    teamName: 'Team Beta',
    region: 'eu-west-1',
    role: 'admin',
    avatar: 'EJ',
  },
];
```

---

### Backend Changes

#### Update `team-service.ts`

Expand the mock team service to support all personas and return richer data:

```typescript
// teams.ts — mock data
const TEAM_MEMBERS: Record<string, TeamMember> = {
  'user-1': { userId: 'user-1', teamId: 'team-a', role: 'coordinator' },
  'user-2': { userId: 'user-2', teamId: 'team-b', role: 'coordinator' },
  'user-3': { userId: 'user-3', teamId: 'team-a', role: 'reviewer' },
  'user-4': { userId: 'user-4', teamId: 'team-c', role: 'coordinator' },
  'user-5': { userId: 'user-5', teamId: 'team-b', role: 'admin' },
};

const TEAM_REGIONS: Record<string, string> = {
  'team-a': 'us-east-1',
  'team-b': 'eu-west-1',
  'team-c': 'ap-southeast-1',
};
```

#### Update `/api/me` Endpoint

Return full persona context:

```json
{
  "userId": "user-2",
  "displayName": "Bob Mueller",
  "email": "bob.mueller@docbridge.dev",
  "team": {
    "teamId": "team-b",
    "teamName": "Team Beta",
    "region": "eu-west-1",
    "regionDisplayName": "Europe (Ireland)"
  },
  "role": "coordinator"
}
```

#### Add Destinations per Region

```typescript
// src/services/destination-service.ts
const DESTINATIONS = [
  // US-East destinations
  { id: 'dest-us-1', region: 'us-east-1', team: 'Team Alpha', binder: 'Regulatory', folder: 'FDA Submissions' },
  { id: 'dest-us-2', region: 'us-east-1', team: 'Team Alpha', binder: 'Regulatory', folder: 'IRB Approvals' },
  { id: 'dest-us-3', region: 'us-east-1', team: 'Team Alpha', binder: 'Clinical', folder: 'Patient Consent Forms' },
  { id: 'dest-us-4', region: 'us-east-1', team: 'Team Alpha', binder: 'Clinical', folder: 'Adverse Event Reports' },
  
  // EU-West destinations
  { id: 'dest-eu-1', region: 'eu-west-1', team: 'Team Beta', binder: 'EMA Submissions', folder: 'Clinical Trial Applications' },
  { id: 'dest-eu-2', region: 'eu-west-1', team: 'Team Beta', binder: 'EMA Submissions', folder: 'Safety Reports' },
  { id: 'dest-eu-3', region: 'eu-west-1', team: 'Team Beta', binder: 'Site Documents', folder: 'Ethics Committee' },
  
  // AP-Southeast destinations
  { id: 'dest-ap-1', region: 'ap-southeast-1', team: 'Team Gamma', binder: 'TGA Regulatory', folder: 'CTN Applications' },
  { id: 'dest-ap-2', region: 'ap-southeast-1', team: 'Team Gamma', binder: 'TGA Regulatory', folder: 'Safety Notifications' },
  { id: 'dest-ap-3', region: 'ap-southeast-1', team: 'Team Gamma', binder: 'Site Files', folder: 'Investigator Brochures' },
];
```

#### New Endpoint: `GET /api/destinations`

Returns destinations filtered by the authenticated user's team/region:

```json
{
  "region": "eu-west-1",
  "regionDisplayName": "Europe (Ireland)",
  "destinations": [
    {
      "id": "dest-eu-1",
      "path": ["Team Beta", "EMA Submissions", "Clinical Trial Applications"],
      "team": "Team Beta",
      "binder": "EMA Submissions",
      "folder": "Clinical Trial Applications"
    }
  ]
}
```

---

### Frontend Changes

#### Persona Switcher Component

Located in the navigation bar (dev mode) or settings page:

```
┌─────────────────────────────────────────────┐
│  Switch Persona                              │
├─────────────────────────────────────────────┤
│  ● Alice Chen (Team Alpha · US-East)        │  ← active
│  ○ Bob Mueller (Team Beta · EU-West)        │
│  ○ Carol Tanaka (Team Alpha · US-East)      │
│  ○ David Okafor (Team Gamma · AP-Southeast) │
│  ○ Emma Johansson (Team Beta · EU-West)     │
└─────────────────────────────────────────────┘
```

#### On Persona Switch:
1. Update `x-user-id` header in API client
2. Store active persona in localStorage (persist across refreshes)
3. Re-fetch `/api/me` to confirm identity
4. Clear cached jobs, destinations, WebSocket subscriptions
5. Re-fetch all page data for new persona
6. Update UI: avatar, name, region badge, destination tree
7. Show toast: "Switched to Bob Mueller (Team Beta · EU-West)"

#### Region Badge in Nav
- Shows current region with colored dot:
  - 🟢 US-East (green)
  - 🔵 EU-West (blue)  
  - 🟠 AP-Southeast (orange)
- Clicking opens a tooltip explaining: "Region is determined by your team. Switch persona to change region."

---

### Testing Scenarios

#### Scenario 1: Basic Upload Isolation
| Step | Action | Expected |
|------|--------|----------|
| 1 | Login as Alice (user-1, US-East) | See US-East destinations |
| 2 | Upload 3 files to "FDA Submissions" | Files stored at `regions/us-east-1/uploads/user-1/...` |
| 3 | Submit job | Job visible in Alice's job list |
| 4 | Switch to Bob (user-2, EU-West) | Alice's job NOT visible |
| 5 | Bob uploads to "EMA Submissions" | Files stored at `regions/eu-west-1/uploads/user-2/...` |
| 6 | Switch back to Alice | Only Alice's job visible |

#### Scenario 2: Same Team, Different Users
| Step | Action | Expected |
|------|--------|----------|
| 1 | Login as Alice (user-1, Team Alpha) | See Team Alpha destinations |
| 2 | Upload and submit a job | Job created for user-1 |
| 3 | Switch to Carol (user-3, Team Alpha) | Carol sees SAME destinations (same team) |
| 4 | Carol's job list does NOT show Alice's job | Ownership isolation works |
| 5 | Carol uploads her own files | Creates separate job |

#### Scenario 3: Regional Destination Filtering
| Step | Action | Expected |
|------|--------|----------|
| 1 | Login as Alice (US-East) | Destination tree shows: Regulatory, Clinical |
| 2 | Switch to Bob (EU-West) | Tree shows: EMA Submissions, Site Documents |
| 3 | Switch to David (AP-Southeast) | Tree shows: TGA Regulatory, Site Files |

#### Scenario 4: Failure and Retry Cross-Region
| Step | Action | Expected |
|------|--------|----------|
| 1 | Login as Bob (EU-West) | — |
| 2 | Upload file, submit job | Task queued |
| 3 | Mock destination fails (simulate_failure=true) | Task shows "failed" with error |
| 4 | Click Retry | Task re-queued, eventually succeeds |
| 5 | Delivered file appears at `delivered/eu-west-1/dest-eu-1/...` | Regional delivery confirmed |

#### Scenario 5: Concurrent Users (Manual)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Open Tab A: Alice uploads 10 files | 10 tasks processing |
| 2 | Open Tab B: Bob uploads 5 files | 5 tasks processing |
| 3 | Both process concurrently | Worker handles both |
| 4 | Check S3 | Files in respective region prefixes |

---

### S3 Bucket Setup Commands

```bash
# Create the dev bucket (if not exists)
aws s3api create-bucket \
  --bucket docbridge-blob-local \
  --region us-east-1

# Set CORS for browser uploads
aws s3api put-bucket-cors \
  --bucket docbridge-blob-local \
  --cors-configuration '{
    "CORSRules": [{
      "AllowedOrigins": ["http://localhost:5173", "http://localhost:3000"],
      "AllowedMethods": ["PUT", "GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }]
  }'

# Create region prefix "directories" (S3 doesn't need this, but helps with visualization)
aws s3api put-object --bucket docbridge-blob-local --key regions/us-east-1/
aws s3api put-object --bucket docbridge-blob-local --key regions/eu-west-1/
aws s3api put-object --bucket docbridge-blob-local --key regions/ap-southeast-1/
aws s3api put-object --bucket docbridge-blob-local --key delivered/us-east-1/
aws s3api put-object --bucket docbridge-blob-local --key delivered/eu-west-1/
aws s3api put-object --bucket docbridge-blob-local --key delivered/ap-southeast-1/
```

---

### Environment Variables Update

```bash
# .env (development)
S3_BUCKET=docbridge-blob-local
S3_ENDPOINT=                          # Empty for real AWS, set for LocalStack
S3_REGION=us-east-1

# Region simulation mode
REGION_SIMULATION=prefix              # 'prefix' (Option A) or 'bucket' (Option B)

# Mock destination service
MOCK_DESTINATION_URL=http://localhost:3001
MOCK_DESTINATION_DELAY_MS=500
MOCK_DESTINATION_FAIL_RATE=0.0        # 0.0 = never fail, 0.3 = 30% failure

# Queue
TASK_QUEUE_URL=http://localhost:4566/000000000000/docbridge-tasks
JOB_QUEUE_URL=http://localhost:4566/000000000000/docbridge-jobs
SQS_ENDPOINT=http://localhost:4566    # LocalStack
```

---

### Database Changes

Add `region` column to jobs and tasks for queryability:

```sql
-- Migration: 002_add_region_support.sql

ALTER TABLE jobs ADD COLUMN region VARCHAR(20);
ALTER TABLE tasks ADD COLUMN destination_region VARCHAR(20);
ALTER TABLE tasks ADD COLUMN delivered_object_key VARCHAR(512);

-- Backfill existing rows (all in us-east-1 by default)
UPDATE jobs SET region = 'us-east-1' WHERE region IS NULL;
UPDATE tasks SET destination_region = 'us-east-1' WHERE destination_region IS NULL;

-- Index for region-based queries
CREATE INDEX idx_jobs_region ON jobs(region);
CREATE INDEX idx_tasks_destination_region ON tasks(destination_region);
```

---

### API Endpoint Additions

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/destinations` | GET | Return destinations for user's region |
| `GET /api/regions` | GET | Return list of all supported regions (admin/dev) |
| `GET /api/me` | GET | Updated to include region info |
| `POST /api/tasks/:taskId/retry` | POST | Retry a failed task |

---

## Summary

| Capability | Approach |
|-----------|----------|
| Multi-region storage | S3 prefix-based path separation (`regions/{region}/...`) |
| Regional delivery simulation | S3 copy to `delivered/{region}/...` path |
| Multi-user support | 5 personas across 3 teams / 3 regions |
| Persona switching | Frontend dropdown, updates `x-user-id` header |
| Destination filtering | Backend filters by user's team region |
| Job isolation | Existing ownership check (user_id on jobs) |
| Failure simulation | Mock destination service with configurable failure rate |
| Verification | Region-prefixed S3 paths visible in AWS Console / CLI |

These requirements can be implemented incrementally:
1. **Phase 1:** Persona definitions + backend team-service expansion + `/api/destinations`
2. **Phase 2:** Frontend persona switcher + region badge + destination tree
3. **Phase 3:** S3 prefix routing in upload-service + task-processor delivery simulation
4. **Phase 4:** Mock destination service + failure/retry testing
