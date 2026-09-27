# ADR-0011 — Dev/Prod environments in one account + promotion pipeline

## Context
There is a single AWS account (`930330383608`). The current CI (`.github/workflows/ci.yml`)
deploys a single set of `DocBridge-*` stacks on push to `main`. We need separate **Dev** and
**Prod** environments, publishing to Dev first and promoting to Prod after approval, with the
running code visibly mapped to a commit.

## Decision required
How do we get two isolated environments in one account, and how do pipelines promote Dev → Prod?

## Alternatives evaluated
### 1. Env-suffixed CDK stacks in one account (`DocBridge-dev-*`, `DocBridge-prod-*`)
+ Full resource isolation (ECS, RDS, S3, DynamoDB, Cognito) per environment, one account.
+ `bin/infra.ts` parameterized by `-c env=dev|prod`; `envs/*` differ only in variables.
+ Cheapest path to isolation without multi-account setup.
− Shared account limits/blast radius; naming discipline required.
− Two of everything to pay for.

### 2. Two AWS accounts (dev, prod)
+ Strongest isolation and separate limits/billing.
− The user has and wants one account; org/account setup is out of scope.

### 3. One environment with feature flags
+ Cheapest.
− No real pre-prod; defeats the purpose of a promotion gate.

## Decision
* **Option 1: env-suffixed CDK stacks in the single account**, with a promotion pipeline:
  - CI on PRs to `dev`/`main`: `tsc --noEmit`, `npm test`, `cdk synth`.
  - Merge to `dev` → build image tagged `:${git-sha}` → deploy `DocBridge-dev-*`.
  - Merge to `main` → **manual approval (GitHub Environment `production`)** → deploy
    `DocBridge-prod-*`.
* **Artifact identity / visibility:** images are tagged with the git SHA (not only `:latest`);
  the deploy job prints the deployed image URI + commit so the running revision maps to a
  commit. Rollback = redeploy a previous SHA.
* Consequence accepted: duplicated resources and per-account limits shared across envs.
* Ratified by: Amo Paymon (2026-09-27)
