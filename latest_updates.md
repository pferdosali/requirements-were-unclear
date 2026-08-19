# DocBridge — Latest Updates

Last Updated: 2026-08-18

---

## Current Status

| Epic                             | Status                 | Notes                                  |
| -------------------------------- | ---------------------- | -------------------------------------- |
| #9 Infrastructure as Code        | ✅ Deployed to AWS      | All 8 stacks live in us-east-1         |
| #1 Authentication & User Access  | ✅ Complete (Cognito)   | Real AWS Cognito SRP auth with JWT tokens |
| #2 File Upload & S3 Storage      | ✅ Complete             | Presigned URL pattern, browser→S3 verified |
| #3 Job and Task Metadata         | ✅ Complete             | PostgreSQL schema, CRUD APIs, ownership checks |
| CI Pipeline                      | ✅ Complete             | GitHub Actions: API tests + CDK synth |
| #4 Queue-Based Processing        | ✅ Complete             | SQS job submission, per-task messages, batch publish |
| #5 Worker Execution & Retry      | ✅ Complete             | SQS consumer, exponential backoff, job recalculation |
| #6 Destination Routing           | ✅ Complete             | DynamoDB lookup, 2 mock Lambda destinations, S3 copy |
| #7 Status Tracking UI            | ✅ Complete             | WebSocket + polling fallback |
| #8 Audit Logging & Observability | ✅ Complete             | Structured JSON, correlation IDs, audit events |
| #10 CI/CD and Deployment         | ✅ Complete             | Docker → ECR → Fargate, GitHub Actions auto-deploy |
| Frontend Integration             | ⚠️ In Progress          | UI deployed to CloudFront, known issues below |

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| IaC Tool | AWS CDK (TypeScript) | Same language as app code, generates CloudFormation, faster iteration |
| API Services | ECS Fargate | No cold starts, native WebSocket support, per architecture diagram |
| API Framework | Express (TypeScript) | Lightweight, widely understood, sufficient for REST + middleware pattern |
| Database | RDS PostgreSQL | Relational model for jobs/tasks, flexible queries |
| Blob Storage | S3 with SSE-KMS | Encrypted at rest, versioned |
| File Upload Pattern | Presigned S3 URLs | Client uploads directly to S3; avoids proxying large files through API |
| Queue | SQS + SNS fanout + DLQs | Job Queue → SNS → Task Queue[n], dead letter queues |
| Routing Config | DynamoDB | Simple key-value lookup for region routing |
| Frontend | React (planned) → CloudFront + S3 | SPA with API routing through CloudFront |
| Auth | AWS Cognito SRP + JWT | Real authentication with User Pool, SRP flow, JWT validation |
| WebSocket | API Gateway WebSocket | Managed, serverless status push |
| CI/CD | GitHub Actions (planned) | Repo already on GitHub |

---

## API Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| /health | GET | No | Health check |
| /api/me | GET | Yes | Return authenticated user + team info |
| /api/upload/presign | POST | Yes | Get presigned S3 URL for file upload |
| /api/upload/confirm | POST | Yes | Confirm file exists in S3 after upload |
| /api/jobs | POST | Yes | Create a new upload job (with optional inline tasks) |
| /api/jobs | GET | Yes | List all jobs for the authenticated user |
| /api/jobs/:jobId | GET | Yes | Get a single job (ownership enforced) |
| /api/jobs/:jobId/tasks | GET | Yes | List all tasks for a job |
| /api/jobs/:jobId/tasks | POST | Yes | Add tasks to an existing job |
| /api/jobs/:jobId/submit | POST | Yes | Submit job for async processing (publishes to SQS) |
| /api/tasks/:taskId | GET | Yes | Get a single task (ownership via parent job) |

### Auth Mechanism

- Frontend uses real AWS Cognito SRP login flow with JWT tokens
- All 5 test users created in the User Pool (user-1 through user-5)
- Backend validates JWT tokens from Cognito
- User ID and team mapping derived from JWT claims

### Upload Flow

1. Client calls `POST /api/upload/presign` with `{ fileName, contentType, fileSizeBytes }`
2. API returns `{ fileId, uploadUrl, expiresIn, objectKey }`
3. Client PUTs file directly to `uploadUrl` (S3 presigned URL)
4. Client calls `POST /api/upload/confirm` with `{ objectKey }`
5. API validates file exists via S3 HeadObject

---

## Project Structure

```
requirements-were-unclear/
├── docs/                              # Blueprints, TDD, diagrams
├── implementation/
│   ├── infra/                         # CDK project (7 stacks)
│   │   ├── bin/infra.ts
│   │   └── lib/
│   │       ├── networking-stack.ts
│   │       ├── auth-stack.ts
│   │       ├── storage-stack.ts
│   │       ├── messaging-stack.ts
│   │       ├── routing-stack.ts
│   │       ├── compute-stack.ts
│   │       └── edge-stack.ts
│   └── api/                           # API service (Express/TypeScript)
│       ├── src/
│       │   ├── app.ts
│       │   ├── server.ts
│       │   ├── middleware/auth.ts
│       │   ├── routes/health.ts
│       │   ├── routes/upload.ts
│       │   ├── routes/jobs.ts
│       │   ├── services/team-service.ts
│       │   ├── services/upload-service.ts
│       │   ├── services/job-service.ts
│       │   ├── services/task-service.ts
│       │   ├── services/queue-service.ts
│       │   ├── types/queue-messages.ts
│       │   ├── worker/
│       │   │   ├── worker.ts
│       │   │   ├── task-processor.ts
│       │   │   ├── config.ts
│       │   │   └── index.ts
│       │   └── db/
│       │       ├── pool.ts
│       │       └── migrations/001_create_jobs_and_tasks.sql
│       └── tests/
│           ├── auth.test.ts
│           ├── upload.test.ts
│           ├── jobs.test.ts
│           ├── submit.test.ts
│           └── worker.test.ts
├── deployment/
└── latest_updates.md
```

---

## CDK Stacks

**Deployed:** 2026-08-15 to `us-east-1` (account 930330383608, profile `dev`)

| Stack | Resources | Status |
|-------|-----------|--------|
| DocBridge-Networking | VPC (2 AZ, NAT), SGs for API, Worker, ALB, DB | ✅ Live |
| DocBridge-Auth | Cognito User Pool | ✅ Live |
| DocBridge-Storage | S3 bucket (KMS), RDS PostgreSQL 16.9 (t3.micro) | ✅ Live |
| DocBridge-Messaging | SQS (Job + Task queues), SNS fanout, DLQs | ✅ Live |
| DocBridge-Routing | DynamoDB table (partition: destination_region, sort: tenant_id) | ✅ Live |
| DocBridge-Compute | ECS cluster, Fargate services (API + Worker, desiredCount=1) | ✅ Live |
| DocBridge-Edge | ALB, CloudFront, WebSocket API Gateway | ✅ Live |
| DocBridge-MockDestination | Lambda + API Gateway (mock file receiver) | ✅ Live |

**Mock Destination Endpoint:** `https://6nn7dftjsk.execute-api.us-east-1.amazonaws.com/prod/upload`

---

## Lessons Learned

1. **CDK cross-stack cyclic dependencies** — When Stack A exports a security group and Stack B creates resources referencing it back, CDK detects a cycle. Solution: define all shared security groups in a single Networking stack and pass as props.

2. **ALB requires explicit protocol** — Non-standard ports (e.g., 3000) need `protocol: ApplicationProtocol.HTTP` in `addTargets()`.

3. **Fargate circuit breaker** — Always set `circuitBreaker: { enable: true, rollback: true }` to avoid 3-hour deployment timeouts.

4. **Presigned URLs for large files** — Don't proxy uploads through the API (Lambda/Fargate size limits, memory costs). Let clients PUT directly to S3. API only generates the signed URL and confirms afterward.

5. **S3 client flexibility** — Using `S3_ENDPOINT` env var allows pointing at LocalStack or MinIO for local development without code changes.

6. **Browser file.type can be empty** — Browsers return empty string for `file.type` on unknown extensions (e.g., `.text`, `.log`, `.dat`). API validation must not reject these — default to `application/octet-stream`.

7. **S3 presigned URLs and browser compatibility** — AWS SDK v3 adds `ServerSideEncryption`, `ContentLength`, metadata headers, and checksum requirements to presigned URLs by default. Browsers can't send custom `x-amz-*` headers on PUT. Solution: remove all optional signed headers, set `requestChecksumCalculation: 'WHEN_REQUIRED'` on the S3 client, and use `unhoistableHeaders` to exclude `content-type` from the signature.

8. **S3 CORS is required for browser uploads** — Even with valid presigned URLs, browsers enforce CORS preflight on cross-origin PUT requests. Must configure `AllowedOrigins`, `AllowedMethods: [PUT]`, and `AllowedHeaders: [*]` on the bucket.

9. **SQS batch send limit is 10** — `SendMessageBatch` accepts max 10 messages. Must chunk larger payloads. Each entry needs a unique `Id` within the batch.

10. **Explicit submit vs auto-submit** — Chose explicit `/submit` endpoint over auto-queueing on job creation. Users may add tasks incrementally and want control over when processing starts. Prevents partial submissions.

11. **Exponential backoff needs jitter** — Without jitter, retrying consumers create "thundering herd" patterns when they all retry at the same intervals. Adding `Math.random() * base` spreads retries.

12. **SQS visibility timeout for retry backoff** — Instead of implementing application-level delays (sleep/setTimeout), use `ChangeMessageVisibility` to hide the message for the backoff period. SQS handles the timing.

---

## Environment & Tooling

| Tool | Version |
|------|---------|
| Node.js | v24.18.0 (via nvm) |
| AWS CDK | 2.1128.1 |
| TypeScript | 5.7.3 |
| Express | 4.21.2 |
| AWS SDK (S3) | 3.750.0 |
| pg (PostgreSQL client) | 8.13.1 |
| Jest | 29.7.0 |
| AWS Profile | `dev` |
| AWS Region | us-east-1 |
| GitHub CLI | Authenticated |

---

## Current Expenses

### Active Resources (as of 2026-08-15)

| Resource | Status | Monthly Cost |
|----------|--------|--------------|
| NAT Gateway | Active | ~$32 |
| RDS PostgreSQL (db.t3.micro, single-AZ) | Active | ~$13 |
| ALB | Active | ~$16 |
| ECS Fargate — API (0.25 vCPU / 512MB) | Running (1 task) | ~$9 |
| ECS Fargate — Worker (0.25 vCPU / 512MB) | Running (1 task) | ~$9 |
| CloudFront | Active | ~$1 |
| S3 (KMS-encrypted, versioned) | Active | < $1 |
| SQS / SNS | Active | < $1 (free tier) |
| DynamoDB | Active | < $1 (pay per request) |
| KMS | Active | ~$1 |
| Cognito | Active | $0 (free tier) |
| Mock Destination Lambda | Active | $0 (free tier) |
| EC2 (i-060972db9737602b8, t2.small) | Stopped | $0 compute |
| EBS volume (attached to stopped EC2) | Active | ~$0.80 |
| **Total current** | | **~$83/month** |

**Note:** All services running. To reduce costs when not actively testing, scale Fargate to 0 and stop RDS.

### Cost Optimization Options (not yet applied)

- Replace NAT Gateway ($32/mo) with NAT instance (t3.nano, ~$3/mo) — saves ~$29
- Use VPC endpoints for S3/DynamoDB to reduce NAT data transfer
- Stop Fargate services when not in use (scale to 0) — already at 0
- Use RDS stop/start for dev (auto-restarts after 7 days)

---

## Open Questions

1. ~~Maximum supported file size for uploads?~~ **Decided:** 100MB. See [docs/decisions/001-open-questions-tradeoffs.md](docs/decisions/001-open-questions-tradeoffs.md).
2. ~~Destination API rate limits — how should we simulate external platforms?~~ **Answered:** Created mock destination Lambda with CloudWatch logging. Supports `?simulate_failure=true` query param for retry testing.
3. ~~Should the worker be a separate Docker image or share the API image?~~ **Decided:** Shared image, separate entrypoints. See [docs/decisions/001-open-questions-tradeoffs.md](docs/decisions/001-open-questions-tradeoffs.md).
4. Virus scanning requirement — needed for P0?
5. Data retention policy — permanent per blueprint, but any cleanup for dev?
6. ~~When to deploy to AWS?~~ **Done:** Deployed 2026-08-15. All 8 stacks live.
7. Multi-region strategy — are the two regions both in AWS, or is one external?
8. File type restrictions — should we limit accepted content types?
9. Checksum validation — SHA-256 per blueprint. Generate client-side or server-side after upload?
10. ~~**Streaming vs Memory for file delivery — what's the tradeoff?**~~ **Decided:** Memory buffer with 100MB size guard. See [docs/decisions/001-open-questions-tradeoffs.md](docs/decisions/001-open-questions-tradeoffs.md).

---

## Frontend Integration

- **Source:** https://github.com/pferdosali/Userinterface (Figma-exported React app)
- **Stack:** Vite + React + Tailwind + Radix UI + shadcn
- **Status:** Wired to real backend, uploads working end-to-end
- **Local dev:** `npx vite` on :5173, Vite proxy forwards `/api/*` to backend on :3000
- **Auth:** Real AWS Cognito SRP login with JWT tokens (all 5 test users in User Pool)
- **Upload flow:** Presign → XHR PUT to S3 (with progress tracking) → confirm
- **Key change:** Replaced `simulateJobUpload` with `realJobUpload` in App.tsx

### S3 Bucket (dev)

- **Bucket:** `docbridge-blob-local` (us-east-1)
- **CORS:** AllowedOrigins `*`, AllowedMethods `PUT/GET/HEAD`
- **Encryption:** AES256 (S3 default, KMS will be added with full CDK deploy)
- **Object path pattern:** `uploads/{userId}/{fileId}/{fileName}`

---

## Queue-Based Processing (Epic #4)

### Submit Flow

1. Client calls `POST /api/jobs/:jobId/submit`
2. API validates: ownership, status=pending, tasks exist
3. Publishes per-task `PROCESS_TASK` messages to SQS Task Queue (batched, max 10/call)
4. Publishes `JOB_SUBMITTED` notification to SQS Job Queue
5. Updates job status to `processing`

### Queue Message Types

| Type | Queue | Purpose |
|------|-------|---------|
| `PROCESS_TASK` | Task Queue | One per task — consumed by worker |
| `JOB_SUBMITTED` | Job Queue | Audit/tracking notification |

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `TASK_QUEUE_URL` | LocalStack URL | SQS Task Queue endpoint |
| `JOB_QUEUE_URL` | LocalStack URL | SQS Job Queue endpoint |
| `SQS_ENDPOINT` | (none) | Override SQS endpoint for local dev |

---

## Worker Execution & Retry (Epic #5)

### Worker Architecture

```
Task Queue (SQS) → Worker (long-poll) → Task Processor → DB Status Update
```

### Retry Policy

| Setting | Value |
|---------|-------|
| Max retries | 3 |
| Base backoff | 1000ms |
| Max backoff | 30000ms |
| Strategy | Exponential with jitter |

### Message Lifecycle

- **Success:** Delete message → mark task `completed` → recalculate job status
- **Retry (under max):** Extend visibility (backoff) → increment retry → revert to `pending`
- **Failed (at max):** Delete message → mark task `failed` → recalculate job status

### Job Status Recalculation

| Condition | Job Status |
|-----------|-----------|
| All tasks completed | `completed` |
| Mix of completed + failed | `partial_success` |
| All tasks failed | `failed` |
| Any task processing | `processing` |
| Otherwise | `pending` |

### Running the Worker

```bash
npm run dev:worker     # Development (ts-node)
npm run start:worker   # Production (compiled JS)
```

Graceful shutdown: send SIGTERM or SIGINT — worker finishes current message then exits.

---

## CI/CD Pipeline (Epic #10)

### Docker Image

- **Dockerfile:** `implementation/api/Dockerfile` (multi-stage, node:20-alpine, non-root user)
- **ECR:** `930330383608.dkr.ecr.us-east-1.amazonaws.com/docbridge`
- **Strategy:** Shared image, separate entrypoints (API: `node dist/server.js`, Worker: `node dist/worker/worker.js`)
- **Size:** ~120MB production image

### Deployment Flow

```
Push to main → GitHub Actions:
  1. API tests pass (Jest)
  2. CDK synth passes
  3. Build Docker image
  4. Push to ECR (SHA tag + :latest)
  5. Force new ECS deployment (API + Worker)
  6. Wait for service stability
```

### GitHub Actions Setup Required

The `deploy` job uses OIDC for AWS authentication. To enable:
1. Create an IAM role with trust policy for `token.actions.githubusercontent.com`
2. Add permissions: ECR push, ECS update-service, ECS describe-services
3. Set GitHub secret `AWS_DEPLOY_ROLE_ARN` to the role ARN

### Live Endpoints

| Endpoint | URL |
|----------|-----|
| ALB (Health) | http://DocBri-ApiAl-OWo4hhH8nLlB-762444483.us-east-1.elb.amazonaws.com/health |
| ALB (API) | http://DocBri-ApiAl-OWo4hhH8nLlB-762444483.us-east-1.elb.amazonaws.com/api/me |
| Mock Destination | https://6nn7dftjsk.execute-api.us-east-1.amazonaws.com/prod/upload |

---

## Next Steps

- ~~**Cognito Authentication**~~ ✅ **Done** — Real Cognito SRP login integrated, JWT validation, 5 test users created
- ~~**Test Suite**~~ ✅ **Done** — Test suite added (API integration tests + frontend tests)
- **Multi-Region/Multi-Persona** — Backend enhancements for full persona system
  - See `docs/specs/docbridge-multi-region-multi-user-requirements.md`

---

## Session Log (2026-08-15/16)

### What was accomplished:
1. ✅ Deployed all 8 CDK stacks to AWS (~$83/mo)
2. ✅ Built CI/CD: Dockerfile → ECR → Fargate (API + Worker running)
3. ✅ Epic #6 complete: DynamoDB routing + 2 mock Lambda destinations
4. ✅ E2E delivery verified: presign → S3 → job → SQS → worker → deliver → completed
5. ✅ Frontend (Figma Make) wired to real backend (API client, store, upload flow)
6. ✅ Deployed frontend to CloudFront (https://dk9dmvpe7a2yb.cloudfront.net)
7. ✅ Fixed: S3 CORS, SPA routing (403→index.html), WebSocket fallback
8. ✅ Mock Lambda saves delivered files to S3 destinations/ folder
9. ✅ Engineering decisions doc (worker image, file size, streaming)
10. ✅ All spec docs added to repo (integration, multi-region, figma-make)

### UAT URL: https://dk9dmvpe7a2yb.cloudfront.net

### Remaining for next session:
- ~~Cognito auth integration (Task #3 from original task list)~~ ✅ Done
- ~~Test suite~~ ✅ Done
- Merge PR #22 to main

### Known Issues (to fix next session):
1. **WebSocket disabled in production** — CloudFront is HTTPS but ALB is HTTP-only, so `ws://` from `https://` page is blocked (mixed content). Current fix: detect and skip WS, show "connected" (polling handles updates). Real fix: add HTTPS to ALB (needs ACM cert + domain) or route WS through API Gateway WebSocket (already deployed but not wired).
2. **File size shows "0 B" in job detail** — Backend doesn't track file size on tasks (only `file_id`, `destination_id`). The `adaptTask()` function in `store.tsx` hardcodes `fileSize: 0`. Fix: either store file size in tasks table, or fetch it from S3 metadata.
3. **No error details on "Delivery failed"** — The task status shows "failed" but doesn't display the actual error message from the backend. Need to map `BackendTask` error info through to the UI.
4. **Persona switch doesn't clear old jobs immediately** — When switching personas, there's a brief flash of the previous user's jobs before the new fetch completes. Add loading state on persona switch.
5. **GitHub Actions deploy job not yet functional** — Needs `AWS_DEPLOY_ROLE_ARN` secret configured (OIDC role for GitHub → AWS).
