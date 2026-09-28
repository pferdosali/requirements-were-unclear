# ADR-0014 — Per-user allow/deny access model (OPEN)

## Context
Today authorization is team-membership based, and job/task endpoints are owner-only. This
release must demonstrate that **navigation and upload rights differ between users**: two demo
users should see different available paths and upload capabilities. The user asked for an
arbitrary allow/deny list for now, with a future model driven by the Cognito user pool and a
managed access list.

## Decision required
How is per-user allow/deny access represented and enforced for this release, and what is the
path to the real model?

## Alternatives evaluated
### 1. Static allow/deny map keyed by Cognito `sub`/email (config in the app)
+ Trivial to implement for two demo users; enforced both in the SPA (hide/disable nav + upload)
  and in the API (authorize upload/job creation).
+ Clear, inspectable, good enough to illustrate the capability.
− Not scalable; editing access means a code/config change and deploy.
− Two enforcement points to keep in sync.

### 2. Cognito groups → claims → policy
+ Uses Cognito as the source of truth; group membership rides in the token.
+ Scales to real users; no app deploy to change access.
− More setup (groups, group-to-permission mapping, token customization) than a two-user demo
  needs right now.

### 3. External policy store (DynamoDB/Postgres) queried per request
+ Fully dynamic, auditable, admin-manageable.
− Heaviest option; unjustified for an illustrative two-user demo.

## Decision
* **OPEN.** For **this release**, adopt **Option 1**: a static allow/deny map keyed by Cognito
  identity, enforced in both the SPA (navigation + upload visibility) and the API (upload/job
  authorization via `requireUploadAccess`), seeded for two demo users:
  - `user-a`: allow browse + upload (explicit allow entry).
  - `user-b`: allow browse, **deny upload** (explicit deny entry — demonstrates the deny path).
* **Default for unlisted authenticated users:** allow (browse + upload). This preserves the
  prior behavior ("any authenticated user may upload") and keeps existing tests valid; the deny
  path is demonstrated by the explicit `user-b` entry rather than by a restrictive default.
  Implemented in `implementation/api/src/services/access-control.ts`.
* **Long-term** (to ratify): **Option 2** — derive access from Cognito groups/claims plus a
  managed access list, removing the hardcoded map; a restrictive default may be reconsidered then.
* Enforcement exists server-side (`requireUploadAccess` returns `403`); client-side hiding is
  additive, not the only control. Verified by tests in `tests/access-control.test.ts`.
* Ratified by: _pending_ (interim Option 1 accepted for the demo by Amo Paymon, 2026-09-27)
