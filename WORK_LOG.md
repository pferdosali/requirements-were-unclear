# WORK LOG

This log documents commands run, their results, and the rationale behind them, in realtime.

---


## Session: 2026-09-27 (Sync repo + get up to speed)

**Goal:** Ensure the local directory is the up-to-date clone of `pferdosali/requirements-were-unclear`; review local + remote info to onboard.

> Note: this WORK_LOG was reset to its header between sessions, so earlier session
> detail (identity audit, AWS credential update) is no longer in this file. Those
> outcomes: `gh` logged in as `pferdosali` (scopes gist, project, read:org, repo,
> workflow); AWS `default` profile now valid as `arn:aws:iam::930330383608:user/dev-cli`;
> AWS `dev` profile has no credentials.

### Step 1 — Assess local git state + list GitHub repos

**Commands run:**
```bash
git rev-parse --is-inside-work-tree
git remote -v
git status -sb
git log --oneline -5
gh repo list --limit 30
```

**Rationale:** Confirm whether the local dir is already the clone (avoid re-cloning / clobbering local work) and identify the correct remote repo.

**Result:**
- Local dir **is already** the git clone; `origin = https://github.com/pferdosali/requirements-were-unclear.git`, on `main`.
- Only untracked items: `.kiro/` and `WORK_LOG.md` — not tracked, so safe.
- Repo exists on the account as `pferdosali/requirements-were-unclear` (public).

### Step 2 — Fetch + compare

**Commands run:**
```bash
git fetch origin
git rev-list --left-right --count main...origin/main
git status -sb
git stash list
```

**Result:** Local `main` was **behind by 9** (0 ahead). Remote also has 3 feature branches (`feat/epic-10-deployment`, `feat/epic-5-worker-execution`, `feat/epic-7-status-tracking`). No stashes.

### Step 3 — Fast-forward sync (hit a git config bug)

**Command run:**
```bash
git pull --ff-only origin main          # FAILED
```

**Result:** ❌ `fatal: invalid value for 'pull.rebase': 'flase'` — a **typo in `~/.gitconfig`** (`pull.rebase = flase`, should be `false`). Confirmed via `git config --show-origin --get pull.rebase` → `file:/home/payman/.gitconfig  flase`.

**Fix (non-destructive):** Overrode only for this command; did NOT change global config:
```bash
git -c pull.rebase=false pull --ff-only origin main   # SUCCESS
```
Fast-forwarded `e955bd4a..cccce181`. Local `main` now even with `origin/main`.

### Step 4 — Review synced docs + tree

**Read:** `PROJECT_OVERVIEW.md`, `CONTRIBUTING-agent.md`. Verified tree with `ls` / `git ls-files`.

**Result / findings:**
- Pulled commits **added** `PROJECT_OVERVIEW.md` + `CONTRIBUTING-agent.md` and **deleted** the `.obsidian/` vault, `scripts/status.sh`, `scripts/reconcile-board.sh`, `STATUS.generated.md`, `START_HERE.md`.
- ⚠️ **Doc drift:** both new docs still reference `./scripts/status.sh`, `START_HERE.md`, `STATUS.generated.md` — but those files were deleted in the same batch of commits. The status-automation system no longer exists in the tree.
- Project state per docs: backend platform **complete + live on AWS** (account `930330383608`, us-east-1, 8 CDK stacks, ECS API+Worker, RDS, SQS, DynamoDB). **10/11 epics done.** Remaining priority = **frontend ↔ backend wiring** (12-task spec at `docs/specs/docbridge-frontend-backend-integration-spec.md`).
- Auth is **mock `x-user-id` header** (Cognito JWT is future). `/api/health` returning 401 is the healthy signal.

### Summary of Findings

| Item | Status | Details |
|------|--------|---------|
| Local clone | ✅ In sync | `main` fast-forwarded to `cccce181`, even with `origin/main`. |
| Remote branches | ℹ️ 3 feature branches | epic-5, epic-7, epic-10 exist on origin (not checked out). |
| Git config bug | ⚠️ Needs user fix | `~/.gitconfig` has `pull.rebase = flase` (typo). Worked around per-command; not modified. |
| Doc drift | ⚠️ Noted | New docs reference deleted `scripts/status.sh`, `START_HERE.md`, `STATUS.generated.md`. |
| Project status | ✅ Understood | Backend live on AWS; next priority = frontend↔backend wiring. |

**Recommended next actions:** (1) fix the `.gitconfig` typo (`flase`→`false`); (2) decide whether to restore or delete references to the removed status system; (3) begin frontend integration per the 12-task spec.

---

## Session: 2026-09-27 (Docs restructure + CI/CD + Cognito — Part 1: docs & memory)

**Goal:** Restructure docs (Blueprint/Tech Spec/ADRs, Google-Docs-compatible), add GitHub docs, agentic memory + skill; then Dev/Prod pipelines and Cognito integration.

### Done so far (branch feat/docs-restructure-and-cicd-cognito)
- Fetched 3 example Google Docs via `/export?format=txt` (ADR, TDD, Blueprint templates) — format basis.
- Audited real code + live AWS (grounded): single Express API + in-process worker, CDK (not TF), single Postgres, DynamoDB routing, 100MB memory-buffer delivery + SHA-256, mock x-user-id auth, Cognito pool us-east-1_jCnHbWlwq live.
- Wrote `docs/blueprint/DocBridge-Blueprint.md` (business, embeds HLD PNG).
- Wrote `docs/tech-spec/DocBridge-Technical-Specification.md` (granular, M-1..M-9 measurable targets from real code).
- Wrote `docs/adr/` README + ADR-0003..0014 (example format; 0012 & 0014 marked OPEN).
- Wrote `AGENT_MEMORY.md` + `.kiro/skills/session-memory/SKILL.md` (maintains it every session).

### Rationale
- Docs describe reality per user decision; expand later. Format matches examples; content grounded in code (endpoints from routes/*.ts, 100MB from delivery-service.ts).

### Next
- GitHub standard docs (README/CONTRIBUTING/architecture/runbook); Dev/Prod CI workflows; Cognito integration (frontend+API+infra, 2 seeded users, Google IdP, allow/deny); verify tsc+test+synth; open PR into main (approval gate). Do NOT push to main directly.

---

## Session: 2026-09-27 (Part 2: implementation + verify + PR)

**Goal:** Implement pipelines + Cognito + docx generation; verify; commit; push; open PR into main.

### Commands & results (grounded)
- Installed pandoc static binary to `~/.local/bin` (no sudo). `scripts/build-docs.sh` → 3 `.docx` in `docs/generated/` (Blueprint 625KB w/ embedded HLD).
- API: rewrote `middleware/auth.ts` (Cognito JWT via `aws-jwt-verify`, dev `x-user-id` fallback), added `services/access-control.ts` + `requireUploadAccess`, guarded upload, `/api/me` exposes access. `npx jest --ci` → **100 passed / 11 suites**.
- Infra: env-aware `bin/infra.ts` (`-c env=dev|prod`), `auth-stack.ts` (per-env pool + Hosted UI + Google IdP), `compute-stack.ts` (env cluster). `cdk synth` dev **and** prod → OK.
- Frontend: env-driven `auth.ts` + `signInWithGoogle`; `.env.*` updated; `jobs.ts` access type. `npx vite build` → **OK (2070 modules)**.
- Workflows: `ci.yml`, `deploy-dev.yml`, `deploy-prod.yml` (approval env). YAML validated (python yaml.safe_load) → all OK.
- Reconciled ADR-0014 + tech-spec to match implemented default-allow / user-b-deny.

### Git
- Branch `feat/docs-restructure-and-cicd-cognito`, commit `3344c81e`, pushed with `-u`.
- Opened **PR #23 → main** (did NOT push to main directly, per git safety). Tree clean.

### Rationale
- Docs describe reality; format matches examples. One-account/two-env via env-suffixed stacks (user decision 3). Feature branch + PR + approval gate (user decision 4). `.env.*` hold Cognito pool/client IDs = public config, not secrets (ADR-0012).

### Follow-ups (documented in PR, non-blocking)
- Visual login UI wiring into App.tsx/NavBar.tsx; fill prod Cognito env after prod Auth deploys; set GH Environment reviewers + AWS_DEPLOY_ROLE_ARN; seed user-a/user-b.

---

## Session: 2026-09-27 (Local test of Cognito auth + allow/deny)

**Goal:** Let the user test login locally (Option B — no new dev infra). Seed 2 users, run API+FE, verify.

### Commands & results
- Confirmed only old `DocBridge-*` stacks exist (no `DocBridge-dev-*`) → deploying dev = full new infra + cost; chose local test instead (user agreed).
- `admin-create-user` + `admin-set-user-password` for user-a@docbridge.local (allow) and user-b@docbridge.local (deny). Both CONFIRMED. Password = `DocBridge2024!` (matches FE constant).
- Started API :3000 (Cognito env set, ALLOW_DEV_AUTH_HEADER off): health 200, no-auth /api/me 401.
- Started FE :5173 (vite, proxies /api→:3000). Added user-a/user-b to App.tsx PERSONAS.
- Got real ID tokens via SRP (amazon-cognito-identity-js). **Verified** (direct + via proxy):
  - user-a: /api/me 200 canUpload:true; presign **201**.
  - user-b: /api/me 200 canUpload:false; presign **403** 'Upload access denied'.
  - garbage token: **401**.

### Rationale
- API access map matches by email (demo users' Cognito sub != user-a/b). ALLOW_DEV_AUTH_HEADER off = real JWT path only.

### Handover
- Browser: http://localhost:5173 → click "User A — Allow" or "User B — Deny". Password handled by app (DocBridge2024!).
- Credentials: user-a@docbridge.local / user-b@docbridge.local, password DocBridge2024!.
- Servers are backgrounded; App.tsx persona addition is an uncommitted local demo change.

---

## Session: 2026-09-28 (Save progress / checkpoint)

**Goal:** Persist progress so a future session can resume from here.

### Actions
- Verified local servers still up (api:3000 200, fe:5173 200) and branch state.
- Updated `AGENT_MEMORY.md`: last-updated 2026-09-28, new handoff entry (session 3), added §9
  "Restart the local demo" with exact commands + demo credentials.
- Decided to commit the `App.tsx` demo personas (user-a/user-b) to the branch so the demo state
  isn't stranded as a local-only change.

### Resume pointers
- Branch `feat/docs-restructure-and-cicd-cognito`; PR #23 → main open.
- Local demo restart: see AGENT_MEMORY.md §9. Users: user-a/user-b @docbridge.local / DocBridge2024!.
- Next options: stand up real DocBridge-dev-* (adds Cognito env vars to compute-stack first) OR
  keep local; optionally add typed login form; then merge PR #23.

---
