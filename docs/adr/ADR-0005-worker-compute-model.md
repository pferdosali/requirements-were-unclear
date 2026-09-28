# ADR-0005 — In-process worker vs Lambda

## Context
Task delivery is asynchronous: consume a task message, fetch the staged file from S3, verify
checksum, POST to the destination, update status, retry on failure. The reference design used
Lambda functions. The system as built runs the worker as an **in-process SQS long-poll consumer**
packaged in the same image as the API and deployed as a **separate ECS Fargate service**
(`WorkerService`).

## Decision required
What compute runs the queue consumer: Lambda, or an ECS service?

## Alternatives evaluated
### 1. In-process worker in an ECS Fargate service (same image, separate entrypoint)
+ No execution-time cap; persistent DB connection pool; no RDS Proxy required.
+ Same container/build/deploy model as the API — one image, one pipeline.
+ Straightforward local dev (`npm run dev:worker`).
− Always-on cost even when idle.
− Queue-depth autoscaling must be configured rather than free per-message scaling.

### 2. Lambda with SQS event source mapping
+ Scales to zero; per-message concurrency without autoscaling config.
− Separate build/packaging path; cold starts; concurrency can exhaust DB connections (needs
  RDS Proxy); 15-minute cap constrains large-file handling.
− A second deployment model alongside the ECS API.

## Decision
* **Option 1: in-process worker as an ECS Fargate service.**
* Rationale: reuses the API's image, build, and pipeline; avoids RDS Proxy and cold-start
  complexity; and the memory-buffer delivery strategy (100 MB cap, ADR-0006/M-2) fits a
  long-running container better than a time-capped function.
* Consequence accepted: idle cost and manual queue-depth autoscaling.
* Ratified by: Amo Paymon (2026-09-27)
