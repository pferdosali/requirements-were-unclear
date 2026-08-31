# START HERE

**This is the canonical entry point for DocBridge. Read this first — every session, human or AI.**

DocBridge is a clinical document upload orchestration platform. Users upload files
once; the system validates, routes, and delivers them to the correct regional
destination with status tracking, checksums, retries, and audit logging.

---

## 0. The one rule that prevents "why is this outdated?"

**Do not trust prose. Trust the generated status.** Hand-written notes drift the
moment code moves. The truth lives in git, GitHub, and live AWS — so we generate
status from those directly.

```bash
./scripts/status.sh
```

Run this **at the start of every session** to get true, current state in seconds,
and **at the end of every session** to record it. It is read-only and safe.

- `STATUS.generated.md` ← machine-generated, **never edit by hand**. If it looks
  stale, it is: just re-run the script.
- `latest_updates.md` ← human narrative/history and architecture decisions. Useful
  for *why*, not for *current state*. When it conflicts with `STATUS.generated.md`,
  the generated file wins.

---

## 1. Canonical location

| Thing | Value |
|-------|-------|
| GitHub repo | `pferdosali/requirements-were-unclear` (public) |
| Default branch | `main` (source of truth — always push here) |
| Recommended local clone path | `~/docbridge` |
| AWS | account `930330383608`, region `us-east-1`, profile `dev` |

> ⚠️ **Avoid multiple clones in nested folders.** Keep ONE clone at `~/docbridge`.
> Scattered stale clones are the #1 cause of "starting over" every session.

Fresh setup:
```bash
git clone https://github.com/pferdosali/requirements-were-unclear.git ~/docbridge
cd ~/docbridge && ./scripts/status.sh
```

---

## 2. What's deployed (live URLs)

| What | URL / ID |
|------|----------|
| Frontend (SPA) | https://dk9dmvpe7a2yb.cloudfront.net |
| API (via CloudFront) | https://dk9dmvpe7a2yb.cloudfront.net/api/... |
| CloudFront distribution | `EYJ0TF0EM7LS3` |
| ECS cluster | `docbridge` (Fargate: API + Worker services) |
| Mock destination | https://6nn7dftjsk.execute-api.us-east-1.amazonaws.com/prod/upload |

`GET /api/health` returning **401** is HEALTHY (API reachable, auth guard active).
A 5xx or timeout is the failure signal.

---

## 3. Layout

```
implementation/
├── api/              # Express API + SQS Worker (TypeScript). Tests: `npm test`
├── frontend/         # React SPA (Vite). Deployed to CloudFront/S3.
├── infra/            # AWS CDK (TypeScript) — 8 stacks
└── mock-destination/ # Lambda file receiver for delivery testing
docs/                 # Blueprints, TDD, specs, decisions
scripts/status.sh     # ← generates STATUS.generated.md from live systems
STATUS.generated.md   # ← auto-generated current state (do not edit)
CONTRIBUTING-agent.md  # ← session-end contract (Definition of Done)
latest_updates.md     # ← human history + architecture decisions
```

Common commands:
```bash
cd implementation/api && npm ci && npm test     # API tests
cd implementation/api && npx tsc --noEmit       # typecheck (same as CI)
cd implementation/infra && npx cdk diff          # preview infra changes
```

---

## 4. Before you end a session

Follow **`CONTRIBUTING-agent.md`** — the Definition of Done. In short: commit,
push to `main`, regenerate status, reconcile issues/PRs, leave a handoff note.
