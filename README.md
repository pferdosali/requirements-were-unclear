# DocBridge — Document Upload Orchestration Platform

[![CI](https://github.com/pferdosali/requirements-were-unclear/actions/workflows/ci.yml/badge.svg)](https://github.com/pferdosali/requirements-were-unclear/actions/workflows/ci.yml)

A clinical document upload orchestration platform. Users upload files once — the system validates, routes, and delivers them to the correct regional destination while providing real-time status tracking, checksums, retries, and audit logging.

**Live on AWS** (us-east-1, account 930330383608). End-to-end delivery pipeline verified.

Current session state: [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md). Pipeline setup: [docs/CI_CD.md](docs/CI_CD.md). Timestamped work: [WORK_LOG.md](WORK_LOG.md).

---

## Quick Status

| Component | Status |
|-----------|--------|
| Backend API | ✅ Running on ECS Fargate (ALB) |
| Worker | ✅ Running on ECS Fargate (SQS consumer) |
| Infrastructure | ✅ 8 CDK stacks deployed |
| Database | ✅ RDS PostgreSQL 16.9 (auto-migrates on startup) |
| CI/CD | CI verified; staging-first release activation in progress |
| Frontend | API/upload wiring exists; staging acceptance is being verified |
| Destination Routing | ✅ DynamoDB config + 2 mock Lambda destinations |

---

## Architecture

```
                              ┌─────────────────┐
                              │   CloudFront    │
                              │   (S3 + ALB)    │
                              └────────┬────────┘
                                       │
                              ┌────────▼────────┐
                              │   ALB (HTTP)    │
                              └────────┬────────┘
                                       │
              ┌────────────────────────▼────────────────────────┐
              │              ECS Fargate Cluster                 │
              │  ┌──────────────────┐  ┌──────────────────────┐ │
              │  │   API Service    │  │   Worker Service      │ │
              │  │  (Express:3000)  │  │  (SQS long-poll)     │ │
              │  └────────┬─────────┘  └──────────┬───────────┘ │
              └───────────┼───────────────────────┼─────────────┘
                          │                       │
         ┌────────────────┼───────────────────────┼──────────────┐
         │                ▼                       ▼              │
    ┌────┴────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐ │
    │   S3    │    │   RDS    │    │   SQS    │    │ DynamoDB │ │
    │ (files) │    │ (Postgres)│    │ (queues) │    │(routing) │ │
    └─────────┘    └──────────┘    └──────────┘    └────┬─────┘ │
                                                        │       │
                                                        ▼       │
                                           ┌─────────────────┐  │
                                           │ Mock Destination │  │
                                           │ Lambdas (2)     │  │
                                           └─────────────────┘  │
```

---

## Delivery Flow (End-to-End Verified ✅)

```
1. Client → POST /api/upload/presign     → Get presigned S3 URL
2. Client → PUT to S3                    → Upload file directly
3. Client → POST /api/upload/confirm     → Verify file in S3
4. Client → POST /api/jobs               → Create job + tasks
5. Client → POST /api/jobs/:id/submit    → Publish to SQS
6. Worker → SQS long-poll                → Receive task message
7. Worker → DynamoDB lookup              → Resolve destination endpoint
8. Worker → S3 download                  → Get file (memory buffer, ≤100MB)
9. Worker → POST to destination          → Deliver with checksum
10. Worker → DB update                    → Task completed, job recalculated
```

---

## Repository Structure

```
requirements-were-unclear/
├── .github/workflows/ci.yml          # CI/CD: test → build → ECR → ECS deploy
├── docs/
│   ├── DocBridge_Blueprint_PAS_1.md  # Original system design
│   ├── Technical Design Document.md
│   ├── decisions/
│   │   └── 001-open-questions-tradeoffs.md  # Worker image, file size, streaming decisions
│   ├── specs/
│   │   ├── docbridge-figma-make-prompt.md              # Figma Make generation prompt
│   │   ├── docbridge-frontend-backend-integration-spec.md  # 12-task frontend wiring spec
│   │   └── docbridge-multi-region-multi-user-requirements.md  # Multi-region/persona requirements
│   └── Diagrams/
├── implementation/
│   ├── api/                           # Express API + Worker (TypeScript)
│   │   ├── Dockerfile                 # Multi-stage, node:20-alpine, non-root
│   │   ├── src/
│   │   │   ├── startup.ts            # Migration → server boot
│   │   │   ├── server.ts             # HTTP + WebSocket
│   │   │   ├── app.ts                # Express app
│   │   │   ├── middleware/auth.ts    # Mock auth (x-user-id header)
│   │   │   ├── routes/               # health, upload, jobs, status
│   │   │   ├── services/             # team, upload, job, task, queue, routing, delivery
│   │   │   ├── worker/               # SQS consumer, task processor, retry logic
│   │   │   ├── ws/                   # WebSocket connection manager + notifier
│   │   │   ├── logging/              # Structured JSON, correlation IDs, audit
│   │   │   ├── types/                # Queue message interfaces
│   │   │   └── db/                   # Pool (SSL) + migrations
│   │   └── tests/                    # Jest (unit + integration)
│   ├── frontend/                      # React UI (Figma Make generated, needs wiring)
│   │   ├── src/app/components/        # Pages, layout, upload, jobs, tasks
│   │   └── src/styles/                # Tailwind + shadcn theme
│   ├── infra/                         # AWS CDK (TypeScript)
│   │   ├── bin/infra.ts
│   │   └── lib/                       # 8 stacks
│   └── mock-destination/              # Lambda handler for delivery testing
├── latest_updates.md                  # Detailed operational state + decisions
└── README.md                          # ← You are here
```

---

## Deployed Infrastructure

| Stack | Resources | Status |
|-------|-----------|--------|
| DocBridge-Networking | VPC (2 AZ, NAT), Security Groups | ✅ Live |
| DocBridge-Auth | Cognito User Pool | ✅ Live |
| DocBridge-Storage | S3 (KMS), RDS PostgreSQL 16.9 | ✅ Live |
| DocBridge-Messaging | SQS Job + Task queues, SNS, DLQs | ✅ Live |
| DocBridge-Routing | DynamoDB routing config table | ✅ Live |
| DocBridge-Compute | ECS cluster, API + Worker Fargate services | ✅ Live |
| DocBridge-Edge | ALB, CloudFront, WebSocket API Gateway | ✅ Live |
| DocBridge-MockDestination | 2 Lambda destinations (region-a, region-b) | ✅ Live |

**ALB Endpoint:** `http://DocBri-ApiAl-OWo4hhH8nLlB-762444483.us-east-1.elb.amazonaws.com`
**Monthly cost:** ~$83 (all services running)

---

## Epic Progress

| Epic | Status | Notes |
|------|--------|-------|
| #9 Infrastructure as Code | ✅ Deployed | 8 CDK stacks live in us-east-1 |
| #1 Authentication & User Access | ✅ Complete | Mock auth + Cognito pool |
| #2 File Upload & S3 Storage | ✅ Complete | Presigned URLs, browser→S3 |
| #3 Job and Task Metadata | ✅ Complete | PostgreSQL, CRUD, ownership |
| #4 Queue-Based Processing | ✅ Complete | SQS batch publish, DLQs |
| #5 Worker Execution & Retry | ✅ Complete | Exponential backoff + jitter |
| #6 Destination Routing | ✅ Complete | DynamoDB lookup, 2 mock destinations |
| #7 Status Tracking UI | ✅ Complete | WebSocket + polling fallback |
| #8 Audit Logging | ✅ Complete | Structured JSON, correlation IDs |
| #10 CI/CD | ✅ Complete | Docker → ECR → ECS, GitHub Actions |
| **Frontend Integration** | **Implemented, verification pending** | API wiring exists; staging acceptance covers upload/delivery |

---

## Running Locally

```bash
# Backend API
cd implementation/api
npm install
npm run dev              # Express on :3000

# Worker (optional)
npm run dev:worker       # SQS consumer

# Frontend
cd implementation/frontend
pnpm install
pnpm dev                 # Vite on :5173
```

---

## Key Engineering Decisions

See [`docs/decisions/001-open-questions-tradeoffs.md`](docs/decisions/001-open-questions-tradeoffs.md):

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Worker Docker image | Shared image, separate entrypoints | Simplicity at current scale |
| File size limit | 100MB | Covers clinical docs, avoids streaming complexity |
| Delivery strategy | Memory buffer | Integrity > throughput for healthcare data |
| IaC tool | AWS CDK (TypeScript) | Same language, fast iteration |
| Database | RDS PostgreSQL | Relational model for jobs/tasks |
| Queue | SQS + DLQs | Reliable, managed, per-task messages |
| Auth (dev) | x-user-id header | Fast iteration; Cognito for prod |

---

## What's Next

1. **Activate staging-first releases** — Finish isolated staging, approve the scoped roles in the local access plan, populate verified environment variables, and enable `DEPLOYMENTS_ENABLED` after acceptance passes. Production promotion remains approved through its GitHub environment.
2. **Enforce production authentication** — Validate Cognito JWTs in the API; the current backend still uses mock identity headers.
3. **Complete regional storage and task recovery** — Follow the multi-region requirements and close retry/file-size/error-detail gaps.

---

## Disclaimer

Personal learning sandbox. Designs may evolve as new approaches are explored.

