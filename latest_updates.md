# DocBridge — Latest Updates

Last Updated: 2026-08-15

---

## Current Status

| Epic                             | Status                 | Notes                                  |
| -------------------------------- | ---------------------- | -------------------------------------- |
| #9 Infrastructure as Code        | ✅ Deployed to AWS      | All 8 stacks live in us-east-1         |
| #1 Authentication & User Access  | ✅ Complete             | Mock auth middleware + team resolution |
| #2 File Upload & S3 Storage      | ✅ Complete             | Presigned URL pattern, browser→S3 verified |
| #3 Job and Task Metadata         | ✅ Complete             | PostgreSQL schema, CRUD APIs, ownership checks |
| CI Pipeline                      | ✅ Complete             | GitHub Actions: API tests + CDK synth |
| #4 Queue-Based Processing        | ✅ Complete             | SQS job submission, per-task messages, batch publish |
| #5 Worker Execution & Retry      | ✅ Complete             | SQS consumer, exponential backoff, job recalculation |
| #6 Destination Routing           | 🔜 Next                |                                        |
| #7 Status Tracking UI            | ⬜ Todo                 |                                        |
| #8 Audit Logging & Observability | ⬜ Todo                 |                                        |
| #10 CI/CD and Deployment         | ⬜ Todo                 |                                        |

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
| Auth | Mock header-based → Cognito for production | x-user-id header for dev |
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

### Auth Mechanism (Dev/Mock)

- Send `x-user-id` header with requests
- Missing header → 401 response
- User ID maps to a team via `team-service.ts`
- Teams map to regions (team-a → region-a, team-b → region-b)

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
| DocBridge-Compute | ECS cluster, Fargate services (API + Worker, desiredCount=0) | ✅ Live |
| DocBridge-Edge | ALB, CloudFront, WebSocket API Gateway | ✅ Live |
| DocBridge-MockDestination | Lambda + API Gateway (mock file receiver) | ✅ Live |

**Mock Destination Endpoint:** `https://6nn7dftjsk.execute-api.us-east-1.amazonaws.com/prod/upload`

**Note:** Fargate services are at `desiredCount: 0` — the placeholder `amazon/amazon-ecs-sample` image doesn't serve on port 3000 or pass `/health` checks. Once the real Docker image is built (Epic #10), update the image and set `desiredCount: 1`.

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
| ECS Fargate — API (0.25 vCPU / 512MB) | Scaled to 0 (placeholder image) | $0 |
| ECS Fargate — Worker (0.25 vCPU / 512MB) | Scaled to 0 (placeholder image) | $0 |
| CloudFront | Active | ~$1 |
| S3 (KMS-encrypted, versioned) | Active | < $1 |
| SQS / SNS | Active | < $1 (free tier) |
| DynamoDB | Active | < $1 (pay per request) |
| KMS | Active | ~$1 |
| Cognito | Active | $0 (free tier) |
| Mock Destination Lambda | Active | $0 (free tier) |
| EC2 (i-060972db9737602b8, t2.small) | Stopped | $0 compute |
| EBS volume (attached to stopped EC2) | Active | ~$0.80 |
| **Total current** | | **~$65/month** |

**Note:** Fargate services are at desiredCount=0 because both use the placeholder `amazon/amazon-ecs-sample` image. Once the real Docker image is built and pushed, set desiredCount=1 and costs will rise to ~$82/month.

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
- **Auth:** Hardcoded `x-user-id: user-1` header (injected in `src/app/api.ts`)
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

## Next Steps

- Epic #6: Destination Routing — route files to correct regional endpoints
- Epic #7: Status Tracking UI — WebSocket push for real-time status updates
- Epic #8: Audit Logging & Observability
