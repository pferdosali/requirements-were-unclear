# DocBridge — Project Overview

_Start here for saved project state. Deployment setup is documented in [docs/CI_CD.md](docs/CI_CD.md); timestamped activity is preserved in [WORK_LOG.md](WORK_LOG.md)._

**Last updated:** 2026-10-10 — Staging verified; CI deployment-role approval pending.

### Current session state

- Implemented local validation → automatic staging → approved production promotion using one image digest and compiled frontend artifact.
- Verified locally: 93 API tests, 3 infrastructure tests and 4 deployment/helper tests, builds/typechecks, CDK synthesis for both environments, and Docker build.
- GitHub environments `build`, `staging`, and `production` exist, restricted to `main`; production requires reviewer `pferdosali` and allows self-review.
- Repository variable `DEPLOYMENTS_ENABLED=false` keeps cloud deployment off during provisioning. CI remains active.
- AWS account is `930330383608`, region `us-east-1`. On this station use `AWS_PROFILE=default`; profile `dev` currently has no credentials.
- Current remote documentation deletions are preserved. `START_HERE.md`, `STATUS.generated.md`, and `scripts/status.sh` were removed upstream; use this overview and direct verification commands instead.
- Superseded local edits to the removed entry point/status script are preserved in a named git stash. Pre-existing architecture HTML files remain untouched.
- Pipeline is published to main. [Remote CI run 38075421799](https://github.com/pferdosali/requirements-were-unclear/actions/runs/38075421799) passed; build/deploy jobs were correctly skipped while deployments are disabled.
- All eight staging stacks are provisioned; frontend, CORS, 25 routing entries and five demo users are configured. The frontend-only SPA rewrite is deployed to staging. All three regional synthetic uploads completed with matching delivered bytes and cross-user/same-team ownership isolation. Frontend/deep links/config returned 200; unauthenticated API returned 401. Private evidence is in `.local/staging-acceptance.json` and `.local/staging-probes.log`. Scoped CI OIDC roles await user approval after automatic approval review rejected their persistent privilege grants. Exact policies are local in `.local/DEPLOYMENT_ACCESS_PLAN.md`. Production deployment requires separate GitHub review after staging passes.

The sections below retain historical design context. Claims of frontend wiring or regional storage completion should be checked against code and the current-session state above.

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

**Status: the API and frontend are implemented. CI/CD activation and authentication hardening are the current priorities. Historical deployment notes below predate staging.**

- **Live on AWS** — us-east-1, account `930330383608`. End-to-end delivery pipeline
  (upload → queue → worker → destination) verified.
- **Core modules are implemented.** Current activation and verification work is recorded above; historical epic completion notes do not establish production readiness.

| Component | Status |
|-----------|--------|
| Backend API | ✅ Running on ECS Fargate (behind ALB / CloudFront) |
| Worker | ✅ Running on ECS Fargate (SQS consumer) |
| Infrastructure | ✅ 8 CDK stacks deployed |
| Database | ✅ RDS PostgreSQL 16.9 (auto-migrates on startup) |
| Messaging | ✅ SQS job + task queues with dead-letter queues |
| Destination routing | ✅ DynamoDB config + 2 mock Lambda destinations |
| Multi-region simulation | Persona/destination definitions exist; upload region prefixes remain unfinished |
| CI/CD | Staging-first workflow implemented; activation in progress with deployments disabled |
| Audit logging | ✅ Structured JSON logs, correlation IDs |
| Frontend UI shell | ✅ Deployed and serving (Figma Make generated) |
| **Frontend ↔ backend wiring** | API client/upload flow exist; verify via staging acceptance tests |

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

1. **Activate staging-first CI/CD.** Finish staging provisioning, approve scoped OIDC roles, populate verified resource variables, and run CI and a staging release. Production promotion remains manually approved.
2. **Validate the full staging upload/delivery flow.** Use synthetic files across all three persona regions and verify job ownership isolation and delivered content.
3. **Production authentication.** Replace backend mock `x-user-id` authentication with validated Cognito JWT identity; frontend Cognito integration alone does not enforce API authentication.
4. **Task metadata and recovery.** Complete the retry endpoint, persistent file sizes/error details, secure status updates, and regional storage separation.

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
- **Regional support is simulated, not real multi-region infra.** Persona/team routing models three regions. Raw uploads currently use `uploads/{userId}/...`; region-prefixed uploads remain planned. Mock destinations use region-specific delivered paths. Staging is an isolated environment in the same AWS region, not a new geographical deployment.
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
├── WORK_LOG.md                       # Timestamped work and verification log
├── scripts/
│   ├── validate.sh                   # Local and CI validation
│   └── deploy-release.sh             # Deploy a fixed release and run smoke checks
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
# Local and remote state (this station uses the default AWS profile)
git status --short
gh run list --limit 5
aws cloudformation describe-stacks --profile default --region us-east-1 --query 'Stacks[].[StackName,StackStatus]'

# Try the API directly (401 without the header is expected/healthy)
curl -s https://dk9dmvpe7a2yb.cloudfront.net/api/health
curl -s https://dk9dmvpe7a2yb.cloudfront.net/api/me -H "x-user-id: user-a"
```

---

_Personal learning sandbox. Designs may evolve as new approaches are explored._
