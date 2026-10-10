# Agent & Contributor Contract — Definition of Done

**Purpose:** stop the recurring problem where a new session opens the repo and
finds it out of date. The fix is a strict, checkable ritual at session end. If
every session leaves the repo reflecting reality, no future session starts stale.

This applies to **AI agents and humans alike**. It is short on purpose.

---

## Start of session

1. Read `PROJECT_OVERVIEW.md`, the newest handoff below, and `WORK_LOG.md`.
2. Check `git status`, current GitHub runs, and the relevant live AWS resources. This station currently uses AWS profile `default` in `us-east-1`.
3. Use `docs/CI_CD.md` for pipeline configuration and staging activation. The previous `START_HERE.md`, `STATUS.generated.md`, and status script were removed upstream and should not be assumed present.

## End of session — Definition of Done

- Commit and publish authorized changes; preserve unrelated work and call out intentional WIP.
- Run checks appropriate to the change. Local/CI validation: `bash scripts/validate.sh`.
- Update `PROJECT_OVERVIEW.md`, append timestamped practical results to `WORK_LOG.md`, and add a dated handoff below with Done / Next / Blockers.
- Verify GitHub/AWS changes directly. Record failures as unverified rather than inferring successful state from empty output.
- Reconcile relevant issues/PRs when necessary. Never publish credentials or exact private deployment-access inventories; retain them under gitignored `.local/`.
- Keep production promotion behind its GitHub environment approval gate. `DEPLOYMENTS_ENABLED` stays false until staging and scoped roles are verified.

---

## Handoff Log

_Newest first. Keep entries to ~3 lines: Done / Next / Blockers._

### 2026-10-10 (pink login staging test)
- **Done:** Changed only the login screen palette to pink; frontend build passed; staging publication/cache invalidation completed; live staging bundle matches the build and production does not contain the pink change.
- **Next:** Review the visual test in staging; CI activation still requires scoped role approval.
- **Blockers:** Automated releases remain disabled pending the previously requested IAM approval; operator staging deployment succeeded.

### 2026-10-10 (pipeline activation)
- **Done:** Published staging-first CI; created GitHub environments and production reviewer; provisioned all eight isolated staging stacks; published frontend/CORS and seeded 25 routes/five demo users. Fixed API-error masking with a frontend-only SPA rewrite on staging. Three-region delivery, ownership isolation, delivered bytes and site probes passed; remote CI 38075421799 passed.
- **Next:** Apply scoped OIDC roles only after approval, enable releases, and verify a staged pipeline run before production review. Production Edge requires its own reviewed infrastructure update.
- **Blockers:** IAM role creation awaits explicit user approval after automatic review rejection. Exact policies are gitignored in `.local/DEPLOYMENT_ACCESS_PLAN.md`; public `docs/DEPLOYMENT_ACCESS_PLAN.md` summarizes permissions. `DEPLOYMENTS_ENABLED=false`.

### 2026-09-09
- **Done:** Added `PROJECT_OVERVIEW.md` (status/decisions/assumptions/next steps) and
  pushed to `main` (commit 851a616). Confirmed auth model = mock `x-user-id` header
  (code in `middleware/auth.ts`; Cognito JWT is a future "in production" note) and
  documented it as the source of truth. Regenerated `STATUS.generated.md`. Set up SSH
  push (origin switched to SSH URL); fixed a broken `dev` AWS profile so `status.sh`
  now reports true CloudFront/ECS state.
- **Next:** Reconcile GitHub board — close epic issues #1,2,4,5,6,7,8,10 and PR #21.
  This session could NOT do it: the fine-grained PAT is read-only for the Issues/PRs
  API (git push works over SSH, but `gh issue/pr close` returns "Resource not
  accessible by personal access token"). Run the reconciliation under a token with
  Issues+PRs write, or close them via the web UI.
- **Blockers:** PAT lacks Issues/Pull-requests write permission.

### 2026-08-30 (setup)
- **Done:** Added self-updating status system — `scripts/status.sh`,
  `STATUS.generated.md`, `START_HERE.md`, this contract. Verified live: frontend
  200, `/api/health` 401 (healthy), CloudFront Deployed, both ECS services 1/1 ACTIVE.
- **Next:** Reconcile GitHub issues #1,2,4,5,6,7,8,10 (marked open but complete per
  `latest_updates.md`) and close/merge stale PR #21. Confirm auth model (code uses
  `x-user-id` mock header; docs claim Cognito JWT) and update whichever is wrong.
- **Blockers:** none.

### 2026-10-10 (CI/CD pipeline implementation)
- **Done:** Added staging-first application release workflow, immutable image promotion, production approval preflight, isolated staging CDK configuration, runtime frontend auth config, and setup/rollback guide in `docs/CI_CD.md`.
- **Next:** Provision staging, seed staging routing/users, configure GitHub environments and AWS OIDC roles, then run a staged release and review it before production approval.
- **Blockers:** Cloud deployment has not been performed; remote environment settings and live AWS readiness remain unverified. Local changes await commit/publish.
