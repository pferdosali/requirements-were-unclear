# Technical Specification — DocBridge (PAS-001)

| Field | Value |
|---|---|
| Status | Living — reflects the deployed system as of 2026-09-27 |
| Blueprint | `docs/blueprint/DocBridge-Blueprint.md` |
| ADRs | `docs/adr/` |
| Owner | Amo Paymon |

> **Scope of truth.** This document describes **what is built and deployed today**, in enough
> detail to break each part into a Jira task with a measurable outcome. Where a target is
> aspirational rather than currently enforced, it is marked *(target)*. Where behavior differs
> from the more ambitious example designs, the difference is stated explicitly and linked to an
> ADR.

---

## Rules for implementation

- **IaC:** All AWS resources are defined in AWS CDK (`implementation/infra`). The console is for
  reading, not writing. (ADR-0007.)
- **CI/CD:** Every deployable gets a GitHub Actions workflow. Dev deploys on merge to `dev`;
  prod deploys on merge to `main` behind a manual approval gate. (ADR-0011.)
- **Secrets:** Nothing sensitive in code. AWS Secrets Manager + environment variables. Frontend
  config (pool IDs, API base) via build-time env, not hardcoded. (ADR-0012, open.)
- **Decisions:** When a part hits a real decision with competing options, write an ADR using the
  template before implementing. One-obvious-answer choices get a one-line note, not an ADR.

---

## System shape (as built)

| Concern | Implementation | Note / ADR |
|---|---|---|
| Frontend | React + Vite SPA, served from S3 behind CloudFront | Figma-generated shell, being wired to the API |
| API | Single Express service (TypeScript) on ECS Fargate | Not 3 microservices — ADR-0004 |
| Async worker | In-process SQS consumer, run as a separate Fargate service from the same image | Not Lambda — ADR-0005 |
| IaC | AWS CDK, 8 stacks | Not Terraform — ADR-0007 |
| Database | Single RDS PostgreSQL 16.x, auto-migrates on startup | ADR-0008 |
| Object storage | S3 with SSE-KMS | ADR-0009 |
| Queues | SQS task + job queues, each with a DLQ | ADR-0006 |
| Routing | DynamoDB routing table → destination endpoint | ADR-0010 |
| Destinations | 2 mock Lambda receivers (region-a, region-b) | Test stand-ins |
| Auth | Cognito user pool (live); API currently mock `x-user-id`, JWT verification being added | ADR-0003 |
| Status delivery | WebSocket push + polling fallback | ADR-0013 |

### Repository layout

```
requirements-were-unclear/
├── implementation/
│   ├── api/            # Express API + in-process worker (TypeScript, Jest)
│   │   └── src/{routes,services,worker,ws,middleware,logging,db,types}/
│   ├── frontend/       # React SPA (Vite) — deployed, being wired
│   ├── infra/          # AWS CDK — 8 stacks (lib/*.ts, bin/infra.ts)
│   └── mock-destination/  # Lambda receiver for delivery testing
├── docs/{blueprint,tech-spec,adr}/
└── .github/workflows/  # CI/CD
```

---

## Measurable requirements

These are the acceptance thresholds. Each maps to a test in the *Testing strategy* section.

| ID | Requirement | Target | Enforced today? |
|---|---|---|---|
| M-1 | Job submission acknowledgment latency | p99 < 500 ms regardless of task count | Measured *(target)* |
| M-2 | Max file size (memory-buffer delivery) | 100 MB hard limit, rejected above | **Yes** — `MAX_FILE_SIZE_BYTES = 100*1024*1024` in `delivery-service.ts` |
| M-3 | Allowed content types | `pdf, docx, xlsx, png, jpg` *(target allow-list)* | Partial — presign accepts a contentType; allow-list enforcement is a task |
| M-4 | Delivery integrity | SHA-256 computed on the delivered bytes and checked against the declared checksum | **Yes** — `computeSha256` in `delivery-service.ts` |
| M-5 | Retry attempts before DLQ | ≥ 3 attempts, then dead-letter | **Yes** — SQS `maxReceiveCount`, worker backoff |
| M-6 | No silent loss | Every failed task has a `failure_reason`; DLQ depth 0 under normal ops | **Yes** for reasons; DLQ alarm is a task |
| M-7 | Destination browse latency | < 1 s for a typical team set | Measured *(target)* |
| M-8 | Partial-failure isolation | One failed task never blocks siblings | **Yes** — per-task messages |
| M-9 | Status update latency (dashboard) | < 5 s from state change to UI | **Yes** via WebSocket; polling fallback ≤ poll interval |

---

## Database design

Single PostgreSQL instance, migrated on service startup (`src/startup.ts` → `src/db`). The
current schema is job/task/file-centric (single logical database). Splitting into isolated
logical databases per service is an expansion path, not the current state (ADR-0004, ADR-0008).

Core entities (as used by the services):

```sql
-- jobs: one batch submission, owned by a user
jobs (
  job_id      uuid PRIMARY KEY,
  user_id     text NOT NULL,
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','processing','completed','failed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- tasks: one file-to-destination pair, the atomic unit of delivery
tasks (
  task_id        uuid PRIMARY KEY,
  job_id         uuid NOT NULL REFERENCES jobs(job_id),
  file_id        text NOT NULL,
  destination_id text NOT NULL,
  checksum       text,                      -- client-declared SHA-256, verified at delivery
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','in_progress','completed','failed')),
  attempt_count  int  NOT NULL DEFAULT 0,
  failure_reason text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
```

> **Jira task — schema doc:** generate the authoritative DDL dump from the migrations in
> `src/db` and paste it here, so this section is verifiable against the running database rather
> than paraphrased. (Fields above reflect the service layer; confirm exact columns/indexes
> against `src/db`.)

Routing configuration lives in **DynamoDB** (not Postgres): a routing table keyed by region →
`{ endpointUrl, authType, authToken }` consumed by `routing-service.ts` (ADR-0010).

---

## API design & contracts

All JSON. All `/api/*` routes require authentication (`authMiddleware`). `/health` is public.
Error shape: `{ "error": "message" }`.

**Authentication (current):** the API reads `x-user-id` and sets `req.user = { userId, email }`.
Missing header → `401`. The **JWT verification path** (verify a Cognito-issued token, fall back
to `x-user-id` only in dev) is the auth task in this release (ADR-0003).

### Endpoints (as implemented)

| Method + path | Purpose | Response |
|---|---|---|
| `GET /health` | Liveness/readiness | `200` (public) |
| `GET /api/me` | Current user + resolved team | `{ user, team }` |
| `POST /api/upload/presign` | Presigned S3 URL for direct upload. Body `{ fileName, contentType, fileSizeBytes }` | `201 { …presigned fields, objectKey }`; `400` if `fileName`/`fileSizeBytes` missing |
| `POST /api/upload/confirm` | Confirm bytes landed in S3. Body `{ objectKey }` | `200 { confirmed, size }`; `404` if not found |
| `POST /api/jobs` | Create a job (optionally with tasks). Body `{ tasks?: [{ fileId, destinationId, checksum? }] }` | `201 { job, tasks }` |
| `GET /api/jobs` | List the caller's jobs | `{ jobs }` |
| `GET /api/jobs/:jobId` | Get one job (owner only) | `{ job }`; `403` non-owner; `404` missing |
| `GET /api/jobs/:jobId/tasks` | List tasks for a job (owner only) | `{ tasks }`; `403`/`404` |
| `POST /api/jobs/:jobId/tasks` | Add tasks to a job. Body `{ tasks: [...] }` | `201 { tasks }`; `400` if empty |
| `POST /api/jobs/:jobId/submit` | Submit for async processing; publishes SQS messages, sets status `processing` | `200 { job, submitted: { taskCount, submittedAt } }`; `409` if not `pending`; `400` if no tasks |
| `GET /api/tasks/:taskId` | Get one task (owner via parent job) | `{ task }`; `403`/`404` |
| `GET /api/destinations…` | Destination browsing | see `routes/destinations.ts` |

### Upload → delivery flow (end-to-end, verified)

1. `POST /api/upload/presign` → presigned S3 URL + `objectKey`.
2. Browser `PUT`s bytes directly to S3.
3. `POST /api/upload/confirm` → API verifies the object exists in S3.
4. `POST /api/jobs` → create job + tasks (one task per file×destination).
5. `POST /api/jobs/:id/submit` → publish one `PROCESS_TASK` message per task + one
   `JOB_SUBMITTED` message; job → `processing`.
6. Worker long-polls the task queue, receives a `PROCESS_TASK` message.
7. Worker resolves the destination endpoint from the DynamoDB routing table.
8. Worker downloads the file from S3 into memory (≤ 100 MB; larger is rejected — M-2).
9. Worker verifies SHA-256 against the declared checksum (M-4), then `POST`s to the destination
   with `X-DocBridge-Checksum` and auth headers per destination config.
10. Worker updates task status; job aggregate status recalculated; WebSocket push.

### Delivery outcomes (as coded in `delivery-service.ts`)

| Condition | Result |
|---|---|
| File missing in S3 | `success:false, error:'File not found in S3'` → task fails with reason |
| File > 100 MB | `success:false, error:'File too large for memory delivery…'` (M-2) |
| Checksum mismatch | `success:false, checksumValid:false, error:'Checksum mismatch…'` (M-4) |
| Destination `2xx` | `success:true, statusCode` → task completed |
| Destination non-2xx | `success:false, statusCode, error` → ret/DLQ per policy |
| Network error | `success:false, error:'Network error…'` → retried |

---

## Concurrency & failure modes

| Scenario | Handling |
|---|---|
| Same task message delivered twice (SQS at-least-once) | Delivery is idempotent per task; destination dedupes. *(Jira: confirm the claim-and-ack path in `worker/`.)* |
| One task fails, others in the job succeed | Per-task messages; failure isolated; job aggregate reflects mixed outcome (M-8) |
| Transient destination/5xx or network error | Worker retries with exponential backoff + jitter; after `maxReceiveCount` → DLQ (M-5) |
| Retries exhausted | DLQ; task marked `failed` with `RETRIES_EXHAUSTED` + last error (M-6) |
| File never uploaded | Confirm step / delivery detects missing object; task fails with a specific reason |
| Worker crash mid-delivery | SQS visibility timeout returns the message; another poll retries |

**Failure-mode matrix (dependency down → effect → recovery):**

| Dependency | Effect | Recovery |
|---|---|---|
| Destination platform | Deliveries fail transiently, retried, DLQ after limit | Backlog drains on recovery; DLQ consumer marks stragglers failed (visible) |
| PostgreSQL | User requests fail; SQS buffers messages | Messages replay on recovery; idempotency makes replay safe |
| S3 / KMS | Uploads and deliveries fail transiently | Standard retry; nothing acknowledged is lost |
| WebSocket path | Dashboard stalls | Non-fatal; polling fallback; deliveries unaffected |

---

## Security & access

- **Authentication:** Cognito user pool issues JWTs (`us-east-1_jCnHbWlwq`, stack
  `DocBridge-Auth`). The API will verify the JWT signature/claims against the pool JWKS;
  `x-user-id` remains a **dev-only** fallback (ADR-0003).
- **Authorization:** team-membership based (team resolved via `team-service.ts`); job/task
  endpoints enforce owner-only access (`403` otherwise). This release adds an illustrative
  per-user **allow/deny** list controlling navigation + upload rights for two demo users
  (ADR-0014, open).
- **Encryption:** SSE-KMS at rest for staged files (ADR-0009); TLS in transit; SHA-256 integrity
  end to end (M-4).
- **Secrets:** DB credentials and destination auth tokens in Secrets Manager / DynamoDB config,
  never in code. Frontend must load pool/client IDs from build-time env, not hardcoded
  (current code hardcodes them — remediation task, ADR-0012 open).
- **No PHI in logs:** structured JSON logs carry correlation IDs, task IDs, and reasons — not
  document contents.

---

## Cognito integration (this release)

**Goal:** replace the frontend's static/mock login with real Cognito auth, verify JWTs in the
API, seed two demo users, and support Google sign-in.

**Frontend (`implementation/frontend/src/app/api`):**
- `auth.ts` already uses `amazon-cognito-identity-js` (pool/client hardcoded — move to env).
- `client.ts` already prefers `Authorization: Bearer <idToken>` and falls back to `x-user-id`.
- **Tasks:** build a login screen; on success store tokens (sessionStorage) and call
  `setAuthCredentials`; gate routes/upload on the user's allow/deny entry; add "Sign in with
  Google" (Cognito Hosted UI, `identity_provider=Google`).

**API (`implementation/api/src/middleware/auth.ts`):**
- **Task:** verify the Cognito JWT (issuer, audience/client, signature via JWKS, expiry) and set
  `req.user` from claims; keep `x-user-id` as a dev-only fallback guarded by env.

**Infra (`implementation/infra/lib/auth-stack.ts`):**
- **Tasks:** add a Hosted UI domain; add Google as a federated IdP (`UserPoolIdentityProviderGoogle`
  with client ID/secret from Secrets Manager); add callback/logout URLs and Google scopes to the
  app client; per-environment pools (dev/prod).

**Seed users (two demo personas):**
- `user-a` — allow: browse + upload.
- `user-b` — deny upload; browse-only (illustrates deny path).
- Default for unlisted authenticated users: allow (backward compatible). Enforced server-side by
  `requireUploadAccess` (403 on deny); verified in `tests/access-control.test.ts`.
- Created via `admin-create-user` (pool has `AllowAdminCreateUserOnly=true`). The allow/deny
  mapping is in `src/services/access-control.ts` and documented in ADR-0014 (open decision —
  future: pool + policy driven).

---

## Environments & CI/CD (this release)

One AWS account, two isolated environments via **env-suffixed CDK stacks**
(`DocBridge-dev-*`, `DocBridge-prod-*`) — separate ECS services, RDS, S3, DynamoDB, and Cognito
pools per environment (ADR-0011). `bin/infra.ts` must take an env parameter
(`-c env=dev|prod`) instead of hardcoded stack names.

**Pipelines (GitHub Actions):**
- CI (PRs to `dev`/`main`): `tsc --noEmit`, `npm test`, `cdk synth`.
- Dev deploy: on merge to `dev` → build/push image tagged `:${git-sha}` → deploy `DocBridge-dev-*`.
- Prod deploy: on merge to `main` → **manual approval (GitHub Environment)** → deploy
  `DocBridge-prod-*`.
- **Visibility of published code:** images tagged with the git SHA; the deploy job prints the
  deployed image tag/URI and the commit, so the running revision maps to a commit (ADR-0011).

---

## Testing strategy

- **Unit (Jest, every CI run):** `implementation/api/tests/*` already cover worker, submit,
  status, routing-delivery, upload-flow, destinations, jobs, auth, logging. Add: JWT
  verification, allow/deny gating, content-type allow-list (M-3).
- **Integration:** submit → publish → worker → mock destination; double-delivery idempotency;
  DLQ path marks tasks failed; oversize-file rejection (M-2); checksum mismatch (M-4).
- **E2E (deployed dev, gated before prod):** the M-1…M-9 checklist, run against `DocBridge-dev-*`.

---

## Launch plan

- **Migrations:** forward-only, run on startup (`src/startup.ts`). Non-backward-compatible
  changes ship expand-then-contract across two deploys.
- **Rollout:** dev first (merge to `dev`), verify M-checklist, then prod via the approval gate.
- **Rollback:** redeploy the previous image SHA (application) or previous CDK synth (infra).
- **Monitoring:** default CloudWatch, plus two cheap alarms that back success metrics directly —
  **DLQ depth > 0** on any DLQ (M-6) and **worker delivery error rate** (Release-1 target).
