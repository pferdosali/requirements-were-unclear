# AGENT_MEMORY.md — DocBridge

> **Purpose.** This is the durable memory for AI agents working in this repository. Read it first
> every session. It is kept current by the `session-memory` skill (`.kiro/skills/session-memory/`),
> which must be run at the **end of every session** on the assumption the session can end at any
> moment. If this file and code disagree, trust the code and fix this file.

**Last updated:** 2026-09-28

---

## 1. What this project is

**DocBridge** — a clinical document upload orchestration platform. Upload files once, map them to
many destinations, submit as one batch, and track every file-to-destination delivery to a
definitive success/failure with checksums, retries, and audit logging. It orchestrates above a
(currently mocked) destination document platform; it is not a system of record.

Business/eng collaboration docs live as Google-Docs-compatible Markdown in `docs/`
(`blueprint/`, `tech-spec/`, `adr/`). Software docs live in GitHub (README, CONTRIBUTING,
architecture, runbook).

## 2. Ground truth: what is actually built (verified from code + live AWS)

- **Single Express API** (`implementation/api`, TypeScript) on **ECS Fargate**, with an
  **in-process SQS worker** run as a separate Fargate service from the same image.
  NOT 3 microservices, NOT Lambda workers.
- **IaC = AWS CDK** (`implementation/infra`, 8 stacks: networking, auth, storage, messaging,
  routing, compute, edge, mock-destination). NOT Terraform. `bin/infra.ts` currently hardcodes
  single-env stack names `DocBridge-*` and account `930330383608`.
- **DB = single RDS PostgreSQL**, migrate-on-startup (`src/startup.ts`, `src/db`).
- **Routing = DynamoDB** table (region → endpoint) + **2 mock-destination Lambdas** (region-a/b).
- **Delivery** (`src/services/delivery-service.ts`): memory buffer, **100 MB hard limit**
  (`MAX_FILE_SIZE_BYTES`), **SHA-256** checksum, POST to destination with `X-DocBridge-Checksum`
  and bearer/api-key/none auth.
- **Auth**: `src/middleware/auth.ts` currently trusts **`x-user-id` header only** (JWT NOT
  verified). Frontend already has partial Cognito (`src/app/api/auth.ts`, `amazon-cognito-identity-js`,
  hardcoded pool `us-east-1_jCnHbWlwq` / client `4ocgklslli9bqhj9b13dmdf3j3`). `client.ts` prefers
  Bearer JWT, falls back to `x-user-id`.
- **Status**: WebSocket push (`src/ws`) + polling fallback.

**Real endpoints:** `GET /health`, `GET /api/me`, `POST /api/upload/presign`,
`POST /api/upload/confirm`, `POST /api/jobs`, `GET /api/jobs`, `GET /api/jobs/:id`,
`GET /api/jobs/:id/tasks`, `POST /api/jobs/:id/tasks`, `POST /api/jobs/:id/submit`,
`GET /api/tasks/:id`, destinations router.

**Live AWS:** account `930330383608`, us-east-1. Cognito pool `us-east-1_jCnHbWlwq`
(stack `DocBridge-Auth`, AdminCreateUserOnly=true, ~5 users). Default AWS CLI profile =
`arn:aws:iam::930330383608:user/dev-cli` (valid). `dev` profile has NO creds.

## 3. Environment / access notes

- **GitHub**: `gh` logged in as `pferdosali` (scopes gist, project, read:org, repo, workflow).
  Remote: `https://github.com/pferdosali/requirements-were-unclear.git`.
- **Git config bug**: `~/.gitconfig` has `pull.rebase = flase` (typo). Work around with
  `git -c pull.rebase=false ...` or fix to `false`.
- **WORK_LOG.md**: realtime command/rationale/result log (per user's standing rule + steering
  file `.kiro/steering/work-logging.md`). Has been reset between sessions before — commit it if
  persistence matters.

## 4. User's confirmed decisions (this initiative)

1. Docs describe reality now; expand toward the more ambitious reference design over time.
2. Cognito: frontend login + **API JWT verification path** + **2 seeded demo users** +
   **Google sign-in** via Cognito federation (Hosted UI).
3. **One AWS account, two environments** via env-suffixed CDK stacks (`DocBridge-dev-*`,
   `DocBridge-prod-*`), separate resources incl. separate Cognito pools.
4. Feature branch + PRs. Merge to `dev` → deploy dev; merge to `main` → deploy prod behind a
   **manual approval gate**. Do NOT push to `main` directly.

## 5. Current branch / work in flight

- Branch: **`feat/docs-restructure-and-cicd-cognito`** (off `main` @ `cccce181`).
- **Done:** `docs/blueprint/DocBridge-Blueprint.md`, `docs/tech-spec/DocBridge-Technical-Specification.md`,
  `docs/adr/` (README + ADR-0003..0014). Agentic memory + skill.
- **In progress / next:** GitHub docs (README/CONTRIBUTING/architecture/runbook), Dev/Prod
  CI/CD workflows, Cognito integration (frontend login + allow/deny, API JWT verify, infra
  Hosted UI + Google IdP + per-env pools, seed 2 users), verification (npm test + tsc + cdk
  synth), open PR.

## 6. Open decisions (see ADRs)

- **ADR-0012 (open):** frontend config/secrets — remove hardcoded Cognito IDs; build-time env vs
  runtime config.json.
- **ADR-0014 (open):** access model — interim static allow/deny map keyed by Cognito identity
  (`user-a` allow upload; `user-b` deny upload); long-term Cognito groups/claims + managed list.

## 7. How to verify state quickly

```bash
git -C . status -sb
cd implementation/api && npm ci && npx tsc --noEmit && npm test
cd implementation/infra && npm ci && npx tsc --noEmit && npx cdk synth --quiet
aws sts get-caller-identity              # expect account 930330383608, user/dev-cli
```

## 8. Handoff log (newest first, ~3 lines each)

### 2026-09-28 (session 3 — local Cognito test + save point)
- **Done:** Seeded 2 demo users in live pool `us-east-1_jCnHbWlwq`: `user-a@docbridge.local`
  (allow upload) and `user-b@docbridge.local` (deny upload), password `DocBridge2024!`
  (matches frontend `DEFAULT_PASSWORD`). Added both as personas in `App.tsx` login list.
  Ran API :3000 (Cognito env set, `ALLOW_DEV_AUTH_HEADER` off) + frontend :5173 (Vite proxy).
  **Verified end-to-end with real SRP JWTs** (direct + via proxy): user-a `/api/me` 200
  canUpload:true & presign **201**; user-b canUpload:false & presign **403**; bad token **401**.
- **Next:** Decide whether to stand up the real `DocBridge-dev-*` environment (full new infra,
  ~$ + ~30 min) or keep local. Wire a typed email/password login form (current UI is
  click-a-persona). Add Cognito env vars to `compute-stack.ts` container defs before any dev
  deploy (NOT done yet — dev API wouldn't verify JWTs without them). Then merge PR #23.
- **Blockers:** none. PR #23 open (`feat/docs-restructure-and-cicd-cognito` → `main`).
- **To resume the local demo:** see §9 "Restart the local demo".

### 2026-09-27 (session 2 — implementation)
- **Done:** Implemented all of Release 2. Env-aware CDK (`-c env=dev|prod` → `DocBridge-dev/prod-*`);
  AuthStack per-env pool + Hosted UI + optional Google IdP. Three GH workflows (CI, deploy-dev,
  deploy-prod w/ `production` approval env, SHA-tagged images). API Cognito JWT verify
  (`aws-jwt-verify`) + `x-user-id` dev fallback; allow/deny access (`access-control.ts`,
  `requireUploadAccess`); `/api/me` exposes access. Frontend `auth.ts` env-driven + Google Hosted
  UI. `.docx` generation via pandoc (`scripts/build-docs.sh`). All docs (Blueprint/TechSpec/12 ADRs/
  GitHub docs) + AGENT_MEMORY + skill.
- **Verified:** API 100 tests pass; infra synth dev+prod OK; frontend vite build OK; 3 workflow YAML valid.
- **Next:** Final visual wiring of login UI into `App.tsx`/`NavBar.tsx` (auth seam built + compiles).
  Fill prod Cognito env after `DocBridge-prod-Auth` deploys. Set GH Environment reviewers +
  `AWS_DEPLOY_ROLE_ARN` secret. Seed `user-a`/`user-b` in the pool. Then open PR into `main`.
- **Blockers:** none.

### 2026-09-27 (session 1 — docs)
- **Done:** Restructured docs into Blueprint + Tech Spec + 12 ADRs (Google-Docs-compatible,
  grounded in real code). Created this memory file + `session-memory` skill. Verified AWS login
  and Cognito pool live. On branch `feat/docs-restructure-and-cicd-cognito`.
- **Next:** GitHub standard docs; Dev/Prod pipelines; Cognito integration (frontend+API+infra,
  2 seeded users, Google IdP, allow/deny); run tests/synth; open PR into `main` (approval gate).
- **Blockers:** none known. `dev` AWS profile has no creds (default profile works).

## 9. Restart the local demo (Cognito login + allow/deny)

Two demo users already exist in the live pool `us-east-1_jCnHbWlwq`:

| User | Email | Password | Behavior |
|---|---|---|---|
| User A | `user-a@docbridge.local` | `DocBridge2024!` | allow browse + upload |
| User B | `user-b@docbridge.local` | `DocBridge2024!` | browse only, upload **denied** (403) |

Start the API (JWT verification on, dev header fallback off):

```bash
cd implementation/api
export COGNITO_USER_POOL_ID=us-east-1_jCnHbWlwq \
       COGNITO_CLIENT_ID=4ocgklslli9bqhj9b13dmdf3j3 \
       AWS_REGION=us-east-1 PORT=3000
unset ALLOW_DEV_AUTH_HEADER
npx ts-node src/server.ts        # health: curl -s localhost:3000/health
```

Start the frontend (Vite proxies /api + /ws to :3000):

```bash
cd implementation/frontend
npx vite --host                  # open http://localhost:5173, click "User A" / "User B"
```

Quick API verification (real token via SRP), run from `implementation/frontend`:

```bash
# get-token.cjs: authenticateUser via amazon-cognito-identity-js, prints ID token
TA=$(node get-token.cjs user-a@docbridge.local 'DocBridge2024!')
curl -s localhost:3000/api/me -H "Authorization: Bearer $TA"     # canUpload:true
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/upload/presign \
  -H "Authorization: Bearer $TA" -H "Content-Type: application/json" \
  -d '{"fileName":"a.pdf","contentType":"application/pdf","fileSizeBytes":1024}'   # 201
```

Notes:
- Login screen is a click-a-persona list (uses `DEFAULT_PASSWORD` in `App.tsx`), not a typed form.
- Full job create/submit needs Postgres/S3 (not run locally); this demo covers login + access control.
- No new AWS infra was created — only the 2 Cognito users.
