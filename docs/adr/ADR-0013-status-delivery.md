# ADR-0013 — WebSocket push vs polling for status

## Context
A job fans out into tasks that resolve over seconds to minutes. The dashboard must show status
that "updates automatically" (M-9: < 5 s from change to UI). The system implements WebSocket
push (`src/ws`) with a polling fallback in the client.

## Decision required
How does the browser receive task/job status updates while a job runs?

## Alternatives evaluated
### 1. WebSocket push + polling fallback
+ Near-real-time updates; meets the < 5 s target comfortably.
+ Fallback keeps the dashboard correct if the socket drops.
− A connection registry and push plumbing to maintain.

### 2. Short polling only (every 2–3 s)
+ Simplest; one endpoint, no connection state.
− Updates lag by the interval; chattiest per unit of information.

### 3. Server-Sent Events
+ Natural one-way stream.
− Buffering/timeout constraints at some edges; less flexible than the chosen combo here.

## Decision
* **Option 1: WebSocket push with a polling fallback.**
* Rationale: delivers live updates for the product's core screen while degrading gracefully to
  polling. Correctness never depends on the socket.
* Consequence accepted: a connection registry and push path from the status-update code.
* Ratified by: Amo Paymon (2026-09-27)
