# DocBridge — Latest Updates

Last Updated: 2026-06-25

---

## Current Status

| Epic                             | Status                 | Notes                                  |
| -------------------------------- | ---------------------- | -------------------------------------- |
| #9 Infrastructure as Code        | ✅ Complete (CDK synth) | Not yet deployed to AWS                |
| #1 Authentication & User Access  | ✅ Complete             | Mock auth middleware + team resolution |
| #2 File Upload & S3 Storage      | ✅ Complete             | Presigned URL pattern                  |
| #3 Job and Task Metadata         | ⬜ Todo                 |                                        |
| #4 Queue-Based Processing        | ⬜ Todo                 |                                        |
| #5 Worker Execution & Retry      | ⬜ Todo                 |                                        |
| #6 Destination Routing           | ⬜ Todo                 |                                        |
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
│       │   ├── services/team-service.ts
│       │   └── services/upload-service.ts
│       └── tests/
│           ├── auth.test.ts
│           └── upload.test.ts
├── deployment/
└── latest_updates.md
```

---

## CDK Stacks

| Stack | Resources |
|-------|-----------|
| DocBridge-Networking | VPC (2 AZ, NAT), SGs for API, Worker, ALB, DB |
| DocBridge-Auth | Cognito User Pool |
| DocBridge-Storage | S3 bucket (KMS), RDS PostgreSQL (t3.micro) |
| DocBridge-Messaging | SQS (Job + Task queues), SNS fanout, DLQs |
| DocBridge-Routing | DynamoDB table (partition: destination_region, sort: tenant_id) |
| DocBridge-Compute | ECS cluster, Fargate services (API + Worker) |
| DocBridge-Edge | ALB, CloudFront, WebSocket API Gateway |

---

## Lessons Learned

1. **CDK cross-stack cyclic dependencies** — When Stack A exports a security group and Stack B creates resources referencing it back, CDK detects a cycle. Solution: define all shared security groups in a single Networking stack and pass as props.

2. **ALB requires explicit protocol** — Non-standard ports (e.g., 3000) need `protocol: ApplicationProtocol.HTTP` in `addTargets()`.

3. **Fargate circuit breaker** — Always set `circuitBreaker: { enable: true, rollback: true }` to avoid 3-hour deployment timeouts.

4. **Presigned URLs for large files** — Don't proxy uploads through the API (Lambda/Fargate size limits, memory costs). Let clients PUT directly to S3. API only generates the signed URL and confirms afterward.

5. **S3 client flexibility** — Using `S3_ENDPOINT` env var allows pointing at LocalStack or MinIO for local development without code changes.

---

## Environment & Tooling

| Tool | Version |
|------|---------|
| Node.js | v24.18.0 (via nvm) |
| AWS CDK | 2.1128.1 |
| TypeScript | 5.7.3 |
| Express | 4.21.2 |
| AWS SDK (S3) | 3.750.0 |
| Jest | 29.7.0 |
| AWS Profile | `dev` |
| AWS Region | us-east-1 |
| GitHub CLI | Authenticated |

---

## Current Expenses

### Active Resources (as of 2026-06-25)

| Resource | Status | Monthly Cost |
|----------|--------|--------------|
| EC2 (i-060972db9737602b8, t2.small) | Stopped | $0 compute |
| EBS volume (attached to stopped EC2) | Active | ~$0.80 |
| **Total current** | | **~$0.80/month** |

CDK stacks have NOT been deployed. All infrastructure exists only as synthesized templates locally.

### Projected Cost After CDK Deploy

| Resource | Monthly Estimate |
|----------|-----------------|
| NAT Gateway | ~$32 |
| RDS PostgreSQL (db.t3.micro, single-AZ) | ~$13 |
| ALB | ~$16 |
| ECS Fargate — API (0.25 vCPU / 512MB) | ~$9 |
| ECS Fargate — Worker (0.25 vCPU / 512MB) | ~$9 |
| CloudFront | ~$1 |
| S3 | < $1 |
| SQS / SNS | < $1 (free tier) |
| DynamoDB | < $1 (pay per request) |
| KMS | ~$1 |
| Cognito | $0 (free tier: 50k MAUs) |
| **Total projected** | **~$82/month** |

### Cost Optimization Options (not yet applied)

- Replace NAT Gateway ($32/mo) with NAT instance (t3.nano, ~$3/mo) — saves ~$29
- Use VPC endpoints for S3/DynamoDB to reduce NAT data transfer
- Stop Fargate services when not in use (scale to 0)
- Use RDS stop/start for dev (auto-restarts after 7 days)

---

## Open Questions

1. Maximum supported file size for uploads? (Presigned URLs support up to 5GB per PUT)
2. Destination API rate limits — how should we simulate external platforms?
3. Should the worker be a separate Docker image or share the API image?
4. Virus scanning requirement — needed for P0?
5. Data retention policy — permanent per blueprint, but any cleanup for dev?
6. When to deploy to AWS? (CDK is ready, costs ~$2-3/day for dev)
7. Multi-region strategy — are the two regions both in AWS, or is one external?
8. File type restrictions — should we limit accepted content types?
9. Checksum validation — SHA-256 per blueprint. Generate client-side or server-side after upload?

---

## Next Steps

- Epic #3: Job and Task Metadata — PostgreSQL schema, CRUD APIs for jobs/tasks
- Epic #4: Queue-Based Processing — SQS integration, job submission flow
- Epic #5: Worker Execution & Retry — consume tasks, upload to destinations
