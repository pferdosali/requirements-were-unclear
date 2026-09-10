# DocBridge — Project Overview

_A high-level snapshot of what DocBridge is, where it stands, the key decisions and
assumptions behind it, and what comes next. For machine-verified live state, always
run `./scripts/status.sh` — this document is the human narrative._

**Last updated:** 2026-09-09 (docs published to main; SSH push set up; GitHub board reconciled — 0 open issues/PRs)

---

## 1. What DocBridge Is

DocBridge is a **clinical document upload orchestration platform**. Clinical trial
coordinators today upload documents manually across hospitals, teams, binders, and
folders — repetitive, error-prone, hard to monitor, and hard to recover from when
something fails.

DocBridge lets a user **upload a file once**, then the system validates it, routes it
to the correct regional destination, and delivers it — with real-time status tracking,
checksums, automatic retries, and audit logging. It is an **orchestration layer above**
existing document repositories; it does not replace them.

The platform has moved well beyond the original PAS-1 blueprint: it is now a **working,
end-to-end system deployed live on AWS**.

---

## 2. Where We Are

**Status: backend platform complete and live on AWS. Frontend integration is the one
remaining feature area.**

- **Live on AWS** — us-east-1, account `930330383608`. End-to-end delivery pipeline
  (upload → queue → worker → destination) verified.
- **10 of 11 epics complete** — everything except wiring the UI to the backend.

| Component | Status |
|-----------|--------|
| Backend API | ✅ Running on ECS Fargate (behind ALB / CloudFront) |
| Worker | ✅ Running on ECS Fargate (SQS consumer) |
| Infrastructure | ✅ 8 CDK stacks deployed |
| Database | ✅ RDS PostgreSQL 16.9 (auto-migrates on startup) |
| Messaging | ✅ SQS job + task queues with dead-letter queues |
| Destination routing | ✅ DynamoDB config + 2 mock Lambda destinations |
| Multi-region simulation | ✅ 3 regions, 5 personas, region-partitioned S3 folders |
| CI/CD | ✅ GitHub Actions: test → build → push ECR → deploy ECS |
| Audit logging | ✅ Structured JSON logs, correlation IDs |
| Frontend UI shell | ✅ Deployed and serving (Figma Make generated) |
| **Frontend ↔ backend wiring** | 🔜 **Next** — UI not yet driving the live API |

### Live endpoints (verified 2026-09-09)

| What | URL | Probe result |
|------|-----|--------------|
| Frontend (SPA) | https://dk9dmvpe7a2yb.cloudfront.net | HTTP 200 ✅ |
| API (via CloudFront) | https://dk9dmvpe7a2yb.cloudfront.net/api | reachable ✅ |
| API health check | https://dk9dmvpe7a2yb.cloudfront.net/api/health | HTTP 401 ✅ (healthy — see note) |

> **Note:** `/api/health` returning **401** is the *healthy* signal. It means the API is
> reachable through CloudFront and the auth guard is active. A 5xx or timeout is the
> failure signal. Authenticated calls pass an `x-user-id` header (mock auth, see §4).

### Delivery flow (end-to-end verified)

```
1. Client → POST /api/upload/presign   → get presigned S3 URL
2. Client → PUT to S3                   → upload file directly to S3
3. Client → POST /api/upload/confirm    → verify file landed in S3
4. Client → POST /api/jobs              → create job + tasks
5. Client → POST /api/jobs/:id/submit   → publish tasks to SQS
6. Worker → SQS long-poll               → receive task message
7. Worker → DynamoDB lookup             → resolve destination endpoint
8. Worker → S3 download                 → load file into memory (≤100MB)
9. Worker → POST to destination         → deliver with SHA-256 checksum
10. Worker → DB update                  → task completed, job status recalculated
```

### Deployed infrastructure (8 CDK stacks)

| Stack | Resources |
|-------|-----------|
| Networking | VPC (2 AZ, NAT), security groups |
| Auth | Cognito user pool |
| Storage | S3 (SSE-KMS), RDS PostgreSQL 16.9 |
| Messaging | SQS job + task queues, SNS, DLQs |
| Routing | DynamoDB routing config table |
| Compute | ECS cluster, API + Worker Fargate services |
| Edge | ALB, CloudFront, WebSocket API Gateway |
| Mock Destination | 2 Lambda destinations (region-a, region-b) |

**Approximate running cost:** ~$83/month with all services on (RDS + two Fargate
services + ALB/NAT are the ongoing spend).

---

## 3. Next Steps

1. **Frontend Integration (the immediate priority).** The Figma Make UI shell is
   deployed and rendering, but it is not yet wired to the live backend. A detailed
   12-task integration spec exists at
   `docs/specs/docbridge-frontend-backend-integration-spec.md`. Completing this makes
   the platform demoable end-to-end through the browser.
2. **Multi-region / multi-persona depth.** Basic simulation is live (3 regions,
   5 personas, region-partitioned S3). Remaining work is tracked in
   `docs/specs/docbridge-multi-region-multi-user-requirements.md`.
3. **Production auth.** Replace the mock `x-user-id` header with real Cognito JWT
   verification (the Cognito pool already exists). See the assumption in §4.
4. **CI/CD hardening.** Configure the `AWS_DEPLOY_ROLE_ARN` secret so GitHub Actions
   deploys via OIDC rather than long-lived keys.

_Housekeeping completed 2026-09-09: GitHub board reconciled (all 10 epics closed,
stale PR #21 closed; 0 open issues/PRs), `PROJECT_OVERVIEW.md` + regenerated status
published to `main`, and SSH push configured on the dev host._

---

## 4. High-Level Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| IaC tool | AWS CDK (TypeScript) | Same language as app code; fast iteration; generates CloudFormation |
| Compute | ECS Fargate | No cold starts, native WebSocket support, right fit for a long-poll worker |
| API framework | Express (TypeScript) | Lightweight, well understood, sufficient for REST + middleware |
| Database | RDS PostgreSQL | Relational model fits jobs/tasks and ownership queries |
| Blob storage | S3 with SSE-KMS | Encrypted at rest; presigned URLs let the browser upload directly |
| Upload pattern | Presigned S3 URLs | Avoids proxying large files through the API |
| Queue | SQS + DLQs | Reliable, managed, one message per task, dead-letter on repeated failure |
| Routing config | DynamoDB | Simple key-value lookup for region → destination endpoint |
| Worker packaging | Shared image, separate entrypoints | Simplicity + version consistency at current scale (<5K LoC) |
| File size limit | 100MB, enforced at presign | Covers clinical PDFs/HL7/CDA without streaming complexity |
| Delivery strategy | Download to memory, checksum, then POST | Integrity > throughput for healthcare data; simpler retries |
| Status updates | WebSocket (API Gateway) + polling fallback | Near-real-time job/task status while user works |
| Auth (dev) | Mock `x-user-id` header → Cognito for prod | Fast iteration now; Cognito pool provisioned for later |
| CI/CD | GitHub Actions → ECR → ECS | Repo already on GitHub; automated test/build/deploy |

Full tradeoff analysis (worker image, file size, streaming vs buffer) lives in
`docs/decisions/001-open-questions-tradeoffs.md`.

---

## 5. Assumptions

- **Clinical document sizes fit under 100MB.** PDFs are typically 1–20MB (up to ~50MB
  for imaging reports); HL7/CDA are <1MB. Raw DICOM (50MB–2GB) is treated as a separate
  problem space and out of scope for now.
- **Single destination per task in P0.** Multi-destination upload is part of the product
  vision but planned for P1.
- **The worker processes one message at a time.** Memory-buffered delivery is safe under
  this assumption; concurrent large-file delivery would require revisiting.
- **Regional support is simulated, not real multi-region infra.** A single AWS account
  with region-prefixed S3 paths (`regions/{region}/...`, `delivered/{region}/...`)
  emulates regional isolation for dev/demo. Regions modeled: `us-east-1`, `eu-west-1`,
  `ap-southeast-1`.
- **Auth is mocked in the current build.** Requests carry an `x-user-id` header that maps
  to a team, which maps to a region. Production will use the existing Cognito pool. Where
  older docs claim Cognito JWT enforcement, the running code is header-based — this is a
  known gap to close.
- **DocBridge orchestrates, it does not store of record.** Destination repositories remain
  the systems of record; DocBridge tracks delivery lifecycle and audit events.
- **No cancellation / scheduling / advanced workflow automation in P0.** Deferred as
  future enhancements.

---

## 6. Repository Map

```
requirements-were-unclear/
├── START_HERE.md                     # Canonical session entry point (read first)
├── STATUS.generated.md               # Auto-generated live status (never edit by hand)
├── scripts/
│   ├── status.sh                     # Generates status from git + GitHub + live AWS
│   └── reconcile-board.sh            # Closes completed epic issues / stale PRs (needs write token)
├── CONTRIBUTING-agent.md             # Session "definition of done" contract
├── PROJECT_OVERVIEW.md               # ← this document
├── docs/
│   ├── DocBridge_Blueprint_PAS_1.md  # Original PAS-1 blueprint
│   ├── Technical Design Document (TDD).md
│   ├── decisions/001-open-questions-tradeoffs.md
│   ├── specs/
│   │   ├── docbridge-figma-make-prompt.md
│   │   ├── docbridge-frontend-backend-integration-spec.md   # 12-task UI wiring
│   │   └── docbridge-multi-region-multi-user-requirements.md
│   └── Diagrams/
└── implementation/
    ├── api/                          # Express API + SQS worker (TypeScript, Jest tests)
    ├── frontend/                     # React SPA (Vite) — deployed, needs wiring
    ├── infra/                        # AWS CDK — 8 stacks
    └── mock-destination/             # Lambda file receiver for delivery testing
```

---

## 7. How to Verify Current State

```bash
# Ground-truth status from git + GitHub + live AWS probes
./scripts/status.sh

# Try the API directly (401 without the header is expected/healthy)
curl -s https://dk9dmvpe7a2yb.cloudfront.net/api/health
curl -s https://dk9dmvpe7a2yb.cloudfront.net/api/me -H "x-user-id: user-a"
```

---

_Personal learning sandbox. Designs may evolve as new approaches are explored._
