# ADR-0004 — Single Express service vs microservices

## Context
The reference design imagined three services (auth, platform, DocBridge API). The system as
built is a single Express application (`implementation/api`) that handles authentication check,
destination browsing, upload coordination, and job/task management, plus an in-process worker
(ADR-0005). Scale is modest and the destination platform is mocked.

## Decision required
Is the API tier one deployable or multiple services?

## Alternatives evaluated
### 1. Single Express service (modular internally)
+ Simplest operations: one image, one pipeline, one thing to monitor and scale.
+ Authorization and job logic are in-process calls — no network hop on the hot path.
+ Matches the current scale and the mocked destination platform.
− Module boundaries are convention, not enforced by process isolation.
− A bad deploy affects all capabilities at once.

### 2. Three services (auth, platform, DocBridge)
+ Enforced ownership and independent deploy/failure domains.
+ The platform API becomes a genuine contract.
− Three pipelines, three target groups, cross-service calls on the latency path.
− Unjustified operational cost at current scale with a mocked platform.

## Decision
* **Option 1: a single Express service** (with an in-process worker, ADR-0005).
* Rationale: at current scale and with a mock destination platform, the operational simplicity
  outweighs the isolation benefits. Internal modularity (`routes/`, `services/`, `worker/`)
  keeps a future split cheap.
* Reconsideration trigger: real multi-region destinations or independent scaling needs — at
  which point auth is the cheapest, highest-value service to peel off first.
* Ratified by: Amo Paymon (2026-09-27)
