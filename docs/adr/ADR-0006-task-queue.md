# ADR-0006 — SQS + DLQ for asynchronous delivery

## Context
Job submission fans out into one task per file-to-destination pair. Submission must acknowledge
quickly (M-1: p99 < 500 ms) and delivery must be decoupled, retried at least 3 times (M-5), and
never silently lost (M-6). The system uses two SQS queues (task queue and job queue), each with
a dead-letter queue.

## Decision required
What buffers work between submission and the worker?

## Alternatives evaluated
### 1. SQS standard queue + DLQ
+ Fully managed; absorbs fan-out spikes with no tuning.
+ Visibility timeout + `maxReceiveCount` implements "≥3 attempts"; DLQ implements "no silent
  loss" as infrastructure, not code (M-5, M-6).
+ Per-message consumption is exactly per-task independence (M-8).
− At-least-once delivery: the worker must be idempotent per task.

### 2. PostgreSQL as a queue (`SELECT … FOR UPDATE SKIP LOCKED`)
+ No new infrastructure; enqueue is transactional with job creation.
− Couples delivery throughput to the primary DB; retry/visibility/DLQ become app code.

### 3. Kafka / RabbitMQ
+ Rich routing / high throughput headroom.
− Operational weight unjustified at this scale; retry/DLQ semantics must be hand-built.

## Decision
* **Option 1: SQS standard queues with dead-letter queues.**
* Rationale: its semantics map one-to-one onto the requirements (retries, isolation, no silent
  loss). The one obligation — idempotent delivery — must be handled for any at-least-once queue
  and is a listed risk regardless.
* Consequence accepted: the worker treats delivery as idempotent per task.
* Ratified by: Amo Paymon (2026-09-27)
