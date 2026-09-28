# PAS-001 — DocBridge Blueprint

**Blueprint: DocBridge — Batch File Distribution for Clinical Trial Documents**

| Field | Value |
|---|---|
| Document ID | PAS-001 |
| Status | Living (reflects what is built today; expands as scope grows) |
| Owner | Amo Paymon |
| Last Updated | 2026-09-27 |
| Related | Technical Specification (`docs/tech-spec/`), ADRs (`docs/adr/`), High-Level Design (below) |

> **How to use this document.** This is the business-facing blueprint. It communicates the
> problem, the shape of the solution, and how we measure success — for managers and business
> owners. It intentionally avoids implementation detail; that lives in the Technical
> Specification and the ADRs. This blueprint describes **what is actually built today** and
> flags where scope is planned to expand.

---

## What problem we're solving and why

Clinical trial coordinators routinely place the same set of documents into many destinations.
A typical case: a batch of regulatory documents that must land in multiple team binders and
folders across several hospitals.

**Current state.** The destination document platform supports uploading a single file to a
single destination. Coordinators repeat the same upload many times per batch. The work is slow,
and because it is manual, files get skipped or land in the wrong binder with no record of what
went wrong.

**Impact.** Coordinator hours are wasted on mechanical repetition. Worse, in a regulated
clinical-trial context, a missed or misplaced document is a compliance problem, not just an
inconvenience. Today there is no reliable way to answer *"did every file reach every
destination?"* with confidence.

**DocBridge** is a standalone web application that solves this: select files once, map them to
destinations, submit as one batch, and track every individual delivery to a definitive success
or failure. No file is ever silently lost.

---

## Definition of done

A user submits N files across M destinations; the system acknowledges the submission quickly
(it does not block on processing); every file-to-destination pair is delivered asynchronously
and independently; the user can watch per-destination status until the whole job resolves; and
every failure is surfaced with a reason. No file is ever silently lost.

---

## Context

DocBridge sits in front of a **document platform** — an electronic document management system
organized as **Team → Binder → Folder (optionally nested) → Document**. Access is team-based:
users only see and act on resources for teams they belong to. The platform is modeled to be
deployed per region, and **region is carried on every destination** so routing can be added
without a data migration.

The current build runs a single deployment in AWS `us-east-1`, with regional routing simulated
via a routing table and mock destination endpoints (see High-Level Design).

### Key terminology

| Term | Definition |
|---|---|
| Document platform | The destination system. A permission-controlled document store organized as Team → Binder → Folder → Document. Modeled per region. |
| Destination | A specific place a file is delivered to: a binder or folder within a binder, belonging to a team, in a region. |
| Job | One batch submission. Contains the selected files and their destination mappings. |
| Task | One file-to-destination pair. The atomic unit of work. |
| Staging | Temporary encrypted storage where uploaded files live between submission and delivery. |
| Delivery | A worker transferring a staged file into the document platform at one destination, with integrity verified by checksum. |
| Task lifecycle | `pending → in_progress → completed / failed`. Pending: created, no worker has touched it. In-progress: a worker owns it. |

### Assumptions

- The document platform is ours to model, so its ingestion contract is ours to define. It is
  kept minimal: authenticate, receive a file into a destination, confirm receipt with an
  integrity check.
- A file is staged once and delivered to one or more destinations.
- **Team membership is the authorization model** for the current release. Finer-grained
  per-user access control is a planned expansion (see *Releases* and the open ADR on access
  control).
- Users are trusted employees of client organizations, but every operation must still be
  authorized. No operation runs unauthenticated.
- **Region is an attribute of a destination**, known at destination-browse time. Users do not
  choose regions; the system routes automatically.

---

## Job stories

- **When I start a distribution session,** I want to browse only the teams, binders, and folders
  I actually have access to, so that I cannot target a destination I am not authorized for.
- **When I have a batch of documents to distribute,** I want to select files and map each to one
  or more destinations in a single session, so that I do not repeat the same upload many times.
- **When I submit a batch,** I want an immediate confirmation that the job was accepted, so that
  I know the batch is recorded and can watch it finish rather than babysitting each upload.
- **When a job is running,** I want to see the live status of every individual
  file-to-destination delivery, so that I know exactly what has landed and what is still pending.
- **When a delivery fails,** I want to see which file, which destination, and why, so that I can
  fix the cause or retry without guessing.
- **When a teammate has distributed documents,** I want to view and retrieve files from their
  team's jobs, so that our team works from the same set of documents.

---

## High-level architecture

The system is a browser SPA in front of a single API service (with an in-process asynchronous
worker), backed by S3 for file bytes, PostgreSQL for job/task metadata, SQS for decoupling
delivery, and a DynamoDB routing table that maps destinations to regional endpoints. Delivery
targets are mock regional document platforms.

![DocBridge — AWS Architecture (C4 Container View)](../DocBridge-High-Level-Design.png)

> If the image does not render in your viewer, the source is
> `docs/DocBridge-High-Level-Design.png` (a copy of the root `DocBridge - High Level Design.png`),
> and an editable version lives in the team Eraser workspace.

### Component overview

| Component | Responsibility |
|---|---|
| Web client (React SPA) | File selection, destination mapping, job submission, job/task dashboard. Authenticates via Cognito. Served from S3 behind CloudFront. |
| Edge (CloudFront + ALB) | CloudFront serves the SPA and fronts the API; the Application Load Balancer routes API traffic to the service. |
| API service (ECS Fargate, Express) | Authentication check, destination browsing, upload coordination, job/task creation and status, WebSocket status push. Owns job/task records. |
| Worker (in-process, SQS-triggered) | Consumes task messages, fetches the staged file, verifies checksum, delivers to the destination platform, updates status, retries with backoff. Runs as a Fargate service. |
| Staging store (S3 + SSE-KMS) | Holds uploaded files encrypted at rest until deliveries complete. |
| Metadata store (RDS PostgreSQL) | Source of truth for jobs, tasks, file metadata, and audit records. Auto-migrates on startup. |
| Task/Job queues (SQS + DLQs) | Decouple submission from delivery; dead-letter queues ensure nothing is silently lost after retries are exhausted. |
| Routing (DynamoDB) | Maps a destination's region to a destination API endpoint. |
| Mock destinations (Lambda × 2) | Stand-ins for the regional document platforms (region-a, region-b), used to verify end-to-end delivery. |
| Identity (Cognito) | User pool for authentication; issues JWTs the API verifies. Google sign-in planned via federation. |

---

## User flows

**Flow 1 — Browse destinations.** User logs in, opens a distribution session, and browses the
team → binder → folder tree, filtered to their memberships. Outcome: a permission-accurate
destination tree; the user cannot select anything outside their access.

**Flow 2 — Distribute a batch.** User selects files, maps them to destinations, and submits.
The system acknowledges immediately and shows the job with all tasks pending. Files upload to
staging; as each file's bytes land they are verified and that file's tasks become deliverable.
Each task is delivered independently to the correct region, with transient failures retried.
Outcome: the dashboard converges to a final state where every task is completed or failed, each
failure carrying a reason. One task failing never blocks the others.

**Flow 3 — Track a job.** User opens the job list, sees aggregate status per job, and opens a
job to see every task's state. Statuses update automatically (WebSocket push with polling
fallback). Outcome: the user can answer "did every file reach every destination?" at a glance.

**Flow 4 — Retrieve a file.** User opens a job from their team, requests a download, and the
system authorizes against team membership and returns a direct, time-limited download from
staging. Outcome: authorized team members retrieve files; nobody else can.

---

## Access control model (current + planned)

**Today.** Authorization is team-membership based. A user is associated with a team; a team is
associated with a region; destinations the user may target are the ones in their team(s).

**This release adds** an explicit, illustrative per-user allow/deny capability so navigation and
upload rights can differ between users — see the Technical Specification for the two seeded
demo users. This is deliberately simple (an allow/deny list) and is documented as an **open
decision** (`docs/adr/`): the long-term model derives access from the Cognito user pool and a
managed access list, not a hardcoded list.

---

## Releases

### Release 1 — Core pipeline (built and live)

**Status:** Deployed to AWS `us-east-1`. End-to-end delivery verified.

**Scope (feature level):**
- Authentication via Cognito (user pool live; JWT verification path being wired into the API).
- Destination browsing filtered by team.
- Multi-file selection with direct-to-staging upload.
- File-to-destination mapping and one-action batch submission with instant acknowledgment.
- Asynchronous, independent per-task delivery with automatic retries and dead-letter queues.
- Job and task status tracking down to individual failure reasons (WebSocket + polling).
- Region-based routing via a DynamoDB routing table to mock regional destinations.
- Encrypted staging (SSE-KMS) and SHA-256 integrity verification.
- Audit logging with correlation IDs.

**Success metrics:**

| Metric | Target | How we measure |
|---|---|---|
| Job submission acknowledgment | p99 < 500 ms regardless of batch size | Submission API response time |
| No silent file loss | 0 undetected failures | Every failed task surfaces in the status view; DLQ depth stays at 0 under normal ops |
| Delivery failure rate | ≤ 0.1% under normal conditions | Failed tasks / total tasks over a rolling window |
| Destination browser load | < 1 s for a typical team set | Time to interactive on first browse |
| Partial-failure isolation | A failed task never blocks siblings | Integration test: force one delivery failure, assert the others complete |
| End-to-end pipeline | A full batch completes in dev and prod | Smoke test: N files × M destinations → all tasks resolve |

**Risks:**

| Risk | Mitigation |
|---|---|
| Fan-out spike (a single submission creating many tasks) | Queue absorbs the spike; worker pulls at its own pace |
| Duplicate deliveries from queue redelivery | Delivery is idempotent per task; destination dedupes |
| Abandoned upload (tab closed mid-upload) | A staging deadline fails exactly those tasks with a specific reason; tasks whose files arrived complete normally |

### Release 2 — Environments, identity, and access maturity (in progress)

- Separate **Dev** and **Prod** environments in one AWS account (env-suffixed stacks), with a
  Dev → Prod promotion pipeline and a manual approval gate before prod.
- **Cognito login fully wired** end to end: frontend login replaces static code; the API
  verifies Cognito JWTs; two seeded demo users; **Google sign-in** via Cognito federation.
- Per-user allow/deny access driving navigation and upload rights (illustrative now,
  pool-and-policy-driven later).

### Release 3+ — Operational maturity (planned)

Candidate themes: real multi-region infrastructure, job cancellation, one-action re-run of
failed tasks, richer delivery reporting/export, per-binder role-based access control, edge
throttling tuned per client organization.

---

## Resolved questions

| Question | Decision |
|---|---|
| Can users retry failed tasks? | Automatic retries with backoff today; one-action manual re-run is planned. |
| Can users cancel uploads? | Not in the current release. |
| Are multiple destinations per submission supported? | Yes — a job fans out to many tasks. |
| Are status updates real time? | Yes, via WebSocket, with polling fallback. |
| What authentication is used? | Cognito (user pool live); JWT verification being wired into the API. |
| What regulatory posture applies? | Encrypt everything in transit (TLS) and at rest (SSE-KMS); verify integrity with SHA-256. |
| How are users associated with regions? | Through team-to-region mapping; the system routes automatically. |

---

## Summary

DocBridge reduces manual upload effort by introducing an orchestration layer for clinical
document distribution. The current release delivers reliable batch distribution with
independent per-task delivery, real-time status, region-based routing, encrypted staging, and
durable asynchronous processing. The design preserves clear expansion paths for real
multi-region infrastructure and finer-grained access control without a redesign.
