# Agent & Contributor Contract — Definition of Done

**Purpose:** stop the recurring problem where a new session opens the repo and
finds it out of date. The fix is a strict, checkable ritual at session end. If
every session leaves the repo reflecting reality, no future session starts stale.

This applies to **AI agents and humans alike**. It is short on purpose.

---

## Start of session

1. Ensure you are in the canonical clone (`~/docbridge`) on `main`.
2. Run `./scripts/status.sh` and read `STATUS.generated.md`. That is ground truth.
3. Read the **Handoff** note at the bottom of this file (last session's summary).

---

## End of session — Definition of Done

Do **all** of these before you consider work finished. Each is verifiable.

- [ ] **Committed.** No meaningful uncommitted changes. Run `git status` — clean,
      or only intentional WIP you explicitly call out in the handoff.
- [ ] **No stranded files.** Anything real (code, config templates, docs) is
      tracked. Secrets stay untracked/gitignored — commit a `*.template` instead.
- [ ] **Pushed to `main`.** `git push origin main`. `status.sh` must show
      `ahead of origin/main: 0`. Local-only commits = stranded work = the bug.
- [ ] **Status regenerated.** Run `./scripts/status.sh` and commit the updated
      `STATUS.generated.md`. It must reflect what you just did.
- [ ] **Tests/typecheck pass** for anything you touched
      (`cd implementation/api && npm test && npx tsc --noEmit`).
- [ ] **Issues & PRs reconciled.** Close GitHub issues that are actually done;
      close/merge stale PRs. The board should match `## 4. Live Deployment` in the
      generated status. (Historically the board has lagged reality — fix it.)
- [ ] **Handoff updated.** Add a dated 3-line entry below: what changed, what's
      next, any blockers.

> If a verification step is blocked (e.g. no AWS creds this session), say so
> explicitly in the handoff rather than leaving it silently unverified.

---

## Why prose alone fails (read once)

`STATUS.generated.md` is derived from **git + GitHub + live AWS probes**, so it
cannot lie about the current state. Narrative docs (`latest_updates.md`) are for
*history and rationale*. When they disagree, the generated file wins — and you
should update the narrative to match.

---

## Handoff Log

_Newest first. Keep entries to ~3 lines: Done / Next / Blockers._

### 2026-08-30 (setup)
- **Done:** Added self-updating status system — `scripts/status.sh`,
  `STATUS.generated.md`, `START_HERE.md`, this contract. Verified live: frontend
  200, `/api/health` 401 (healthy), CloudFront Deployed, both ECS services 1/1 ACTIVE.
- **Next:** Reconcile GitHub issues #1,2,4,5,6,7,8,10 (marked open but complete per
  `latest_updates.md`) and close/merge stale PR #21. Confirm auth model (code uses
  `x-user-id` mock header; docs claim Cognito JWT) and update whichever is wrong.
- **Blockers:** none.
