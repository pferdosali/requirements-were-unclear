# DocBridge Blueprint

| Field | Value |
|---|---|
| Document Type | Stage 1 Blueprint |
| Status | Draft |
| Owner | Liam / Payman |
| Last Updated | May 2026 |

---

## 1. Executive Summary

DocBridge is a batch upload orchestration system for clinical trial teams that need to distribute the same document set across multiple hospitals, binders, folders, or study destinations.

Instead of requiring users to manually upload files to each destination, DocBridge lets users upload once, map files to many destinations, submit a single job, and track each delivery independently.

The system acts as an orchestration layer on top of existing authentication and document management systems. It does not replace the client’s document repository.

---

## 2. Problem

Clinical trial coordinators currently perform repetitive manual uploads across many destinations.

This creates operational risk:

- Same file uploaded repeatedly
- Failures discovered late
- No centralized job-level visibility
- Manual recovery when one upload fails
- Limited audit trail across upload attempts
- Higher chance of human error

DocBridge reduces this by separating user submission from background delivery execution.

---

## 3. Goals

| Goal | Description |
|---|---|
| Batch upload | Users can upload multiple files in one session. |
| Multi-destination delivery | A file can be mapped to one or more target destinations. |
| Async processing | Large or slow uploads do not block the user workflow. |
| Failure isolation | One failed delivery does not fail the entire batch. |
| Recovery | Failed tasks can be retried without requiring users to re-upload files. |
| Security | Files are protected in transit, at rest, and during processing. |
| Auditability | Each job and task has traceable lifecycle events. |

---

## 4. Non-Goals

DocBridge does not handle:

- Clinical document authoring
- Clinical content validation
- Long-term document retention
- Replacing the client document management system
- Building a new identity provider
- Final API schemas or database schemas in this stage

Those belong in later technical design or implementation stages.

---

## 5. High-Level Architecture

> Diagram placeholder: Replace this text block with a visual architecture diagram in the final version.

```text
+-------------+
| Web Client  |
+-------------+
       |
       v
+-------------+        +-------------------+
| Upload API  | -----> | Metadata Store    |
+-------------+        | Jobs / Tasks      |
       |              +-------------------+
       v
+-------------------+
| Object Storage    |
| Temporary Files   |
+-------------------+
       |
       v
+-------------------+
| Task Queue        |
+-------------------+
       |
       v
+-------------------+
| Upload Workers    |
+-------------------+
       |
       v
+-------------------+
| Region Router     |
+-------------------+
       |
       v
+---------------------------+
| Destination Document APIs |
+---------------------------+
```

---

## 6. Major Components

| Component | Responsibility |
|---|---|
| Web Client | Upload files, select destinations, submit jobs, view progress. |
| Upload API | Validates request, stores files, creates job/task metadata, enqueues work. |
| Object Storage | Temporarily stores uploaded files durably before delivery. |
| Metadata Store | Stores jobs, tasks, statuses, retry counts, file references, audit references. |
| Task Queue | Decouples user submission from background processing. |
| Upload Workers | Consume tasks, upload files to destinations, validate delivery, update status. |
| Region Router | Selects destination endpoint or routing path based on destination metadata. |
| Destination APIs | External or client-provided document management APIs. |

---

## 7. Datastore Choices

Specific technologies do not need to be finalized in Stage 1, but the system needs three datastore categories.

| Store Type | Used For | Why |
|---|---|---|
| Object storage | Uploaded file payloads | Large files should not live in the database. Object storage provides durability, encryption, and scalable file access. |
| Metadata database | Jobs, tasks, statuses, destination mappings | The system needs queryable state for progress tracking, retries, and audit workflows. |
| Queue | Pending upload tasks | Async delivery requires durable buffering and retry-friendly task processing. |

Potential examples for later stages:

- Object storage: S3, Azure Blob Storage, GCS
- Metadata store: PostgreSQL, DynamoDB, Aurora
- Queue: SQS, RabbitMQ, Kafka, Pub/Sub

---

## 8. File Lifecycle

```text
1. User uploads one or more files.
2. Upload API validates request and file metadata.
3. Files are stored in encrypted temporary object storage.
4. Job record is created.
5. Task records are created for each file-destination pair.
6. Tasks are pushed to a queue.
7. Workers consume tasks asynchronously.
8. Region router selects the destination API endpoint.
9. Worker uploads the file to the destination system.
10. Worker validates delivery result and checksum where supported.
11. Task status is updated.
12. Job aggregate status is recalculated.
13. Audit event is recorded.
```

### Example

If a user uploads 5 files and maps each file to 4 destinations:

```text
5 files x 4 destinations = 20 delivery tasks
```

Each task is processed independently. If task 7 fails, the other 19 can still complete.

---

## 9. Asynchronous Processing Strategy

DocBridge should not upload all files to all destinations inside the initial user request.

The upload request should only:

1. Authenticate the user
2. Validate the submission
3. Persist files
4. Persist metadata
5. Enqueue tasks
6. Return a Job ID

Background workers perform destination delivery.

This design improves:

- User responsiveness
- Reliability
- Retry handling
- Failure isolation
- Horizontal scalability

### Task Model

A task represents one file going to one destination.

```text
Task = File + Destination + Status + RetryCount + Checksum
```

This keeps failure handling simple and precise.

---

## 10. Security Strategy

| Requirement | Blueprint Approach |
|---|---|
| Authentication | Delegate to existing enterprise identity provider. |
| Authorization | Enforce permission-aware destination browsing and submission. |
| File encryption at rest | Store files encrypted in object storage. |
| Metadata encryption at rest | Use encrypted database storage. |
| Encryption in transit | Use HTTPS/TLS for all client, service, and destination API calls. |
| Secrets management | Store credentials/tokens in a managed secrets system. |
| Integrity | Use checksums such as SHA-256 before and after delivery where supported. |
| Auditability | Record immutable lifecycle events for jobs and tasks. |

Security design principle:

> DocBridge should never become a bypass around the client’s existing identity, authorization, or document access model.

---

## 11. Reliability and Failure Handling

| Failure Scenario | Handling Strategy |
|---|---|
| Destination API timeout | Retry with exponential backoff. |
| Destination API unavailable | Retry, then move task to failed state or DLQ. |
| Worker crash | Task remains recoverable from queue or metadata. |
| Partial job failure | Failed tasks are isolated; successful tasks remain complete. |
| Duplicate task execution | Workers must be idempotent. |
| File corruption | Detect with checksum validation. |
| Queue backlog | Scale workers horizontally. |

### Retry Strategy

Use bounded retries with exponential backoff.

Example:

```text
Attempt 1: immediate
Attempt 2: +1 minute
Attempt 3: +2 minutes
Attempt 4: +4 minutes
Attempt 5: move to failed state / DLQ
```

---

## 12. Job and Task Status Model

### Task Status

| Status | Meaning |
|---|---|
| Pending | Task created but not started. |
| InProgress | Worker is processing the task. |
| Completed | File delivered successfully. |
| Failed | Task failed after retry policy was exhausted. |
| RetryScheduled | Task failed transiently and will retry. |

### Job Status

| Status | Meaning |
|---|---|
| Pending | Job created, tasks not complete. |
| InProgress | At least one task is running. |
| Completed | All tasks completed. |
| CompletedWithFailures | Some tasks completed and some failed. |
| Failed | All tasks failed or job-level failure occurred. |

---

## 13. Observability

Minimum observability requirements:

| Signal | Examples |
|---|---|
| Metrics | Queue depth, task success rate, retry count, worker errors, upload latency. |
| Logs | Job ID, task ID, file ID, destination ID, correlation ID. |
| Alerts | DLQ growth, high failure rate, stuck jobs, queue backlog, destination API failures. |
| Audit Events | Job created, task queued, upload started, upload completed, retry scheduled, task failed. |

---

## 14. Key Architectural Decisions

| Decision | Rationale |
|---|---|
| Use async workers | Destination uploads may be slow, unreliable, or large. |
| Store files before queuing tasks | Prevents queued work from referencing missing files. |
| Model each file-destination pair as a task | Enables independent retry, tracking, and failure isolation. |
| Use object storage for files | Better fit for large binary payloads than relational storage. |
| Use metadata store for jobs/tasks | Enables status tracking, reporting, and recovery. |
| Use queue between API and workers | Decouples user request path from delivery execution. |
| Make workers idempotent | Required for safe retry and replay. |
| Delegate authentication | Reduces scope and preserves client security model. |

---

## 15. Open Questions and Decisions Needed

| Topic | Question |
|---|---|
| Destination API behavior | Do destination APIs support checksum validation after upload? |
| File retention | How long should temporary files remain after job completion? |
| Max file size | What file size limits must be supported? |
| Max destinations per job | What is the expected upper bound? |
| User permissions | Are permissions checked only at submission, or again during delivery? |
| Duplicate uploads | Should the system prevent duplicates or allow overwrite/versioning? |
| Regional routing | Are destinations region-specific, tenant-specific, or both? |
| Audit retention | How long must audit events be retained? |
| Compliance | Are HIPAA, GxP, 21 CFR Part 11, or customer-specific controls required? |

---

## 16. Evaluation Alignment

| Evaluation Area | Blueprint Coverage |
|---|---|
| Design makes sense for the problem | Batch upload, async processing, task-level delivery. |
| Technical decisions are justified | Datastore, queue, worker, and object storage choices explained. |
| Hard parts considered | Failure handling, retries, security, auditability, idempotency. |
| Senior engineer reviewable | Major components, data movement, and open decisions are explicit. |
| Implementation path exists | Stage 2 can expand this into APIs, schemas, tests, and final technology choices. |

---

## 17. Summary

DocBridge should be designed as a secure, asynchronous upload orchestration system.

The core idea is simple:

```text
User submission creates a Job.
Each file-destination pair creates a Task.
Workers process Tasks independently.
The system tracks, retries, validates, and audits every delivery.
```

This architecture keeps the user workflow simple while giving the backend enough structure to handle scale, failures, and security requirements thoughtfully.
