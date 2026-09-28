# ADR-0008 — Single RDS PostgreSQL, migrate-on-startup

## Context
DocBridge stores jobs, tasks, and file metadata, with a burst-insert pattern (a job plus its
tasks) and dashboard queries that aggregate task status per job. The system uses a single RDS
PostgreSQL instance; migrations run on service startup (`src/startup.ts` → `src/db`).

## Decision required
Which database engine and topology, and how are migrations applied?

## Alternatives evaluated
### 1. Single PostgreSQL instance, migrate-on-startup
+ Relational model fits jobs/tasks/ownership; transactional job+task inserts.
+ Status aggregation is a `GROUP BY` on an indexed column.
+ One instance to run and back up — matches current scale.
− Migrate-on-startup races if multiple tasks boot simultaneously (needs an advisory lock or a
  single migrate step).
− Single failure domain.

### 2. DynamoDB for job/task store
+ High write throughput, pay-per-request.
− Breaks transactional job+task insert; status aggregation becomes hand-built bookkeeping;
  throughput far exceeds the need.

### 3. Three isolated logical databases (per future service)
+ Enforced ownership; textbook microservice end-state.
− Unjustified now given the single-service decision (ADR-0004).

## Decision
* **Option 1: one PostgreSQL instance, migrate-on-startup.**
* Rationale: every workload is inside PostgreSQL's comfort zone; a single instance matches scale
  and the single-service architecture.
* Consequence accepted / follow-up task: guard startup migration against concurrent boots
  (advisory lock or a dedicated migrate step) so `desired_count > 1` is safe.
* Ratified by: Amo Paymon (2026-09-27)
