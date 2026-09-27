# ADR-0012 — Frontend config/secret handling (OPEN)

## Context
The frontend hardcodes the Cognito `USER_POOL_ID` and `CLIENT_ID` in
`src/app/api/auth.ts`. With two environments (ADR-0011), each has its own Cognito pool, so the
frontend must select the right pool per environment. Pool/client IDs are not secrets, but
hardcoding them prevents building one artifact that runs in both environments and couples the
SPA to a single pool.

## Decision required
How does the SPA obtain its per-environment configuration (Cognito pool/client, API base,
Hosted UI domain)?

## Alternatives evaluated
### 1. Build-time env (Vite `import.meta.env`, `.env.development` / `.env.production`)
+ Simple; already partly used (`VITE_API_BASE_URL`).
+ Values baked per build; matches the two-environment model.
− One build per environment; changing config requires a rebuild.

### 2. Runtime `config.json` fetched on boot
+ One artifact for all environments; config swapped without rebuild.
− An extra request on boot; a config file to deploy alongside the SPA.

### 3. Keep hardcoded values
+ Zero work.
− Cannot support two environments; the reason this ADR exists.

## Decision
* **OPEN.** Leaning toward **Option 1 (build-time env)** for this release because the pipeline
  already builds per environment, with **Option 2** as the upgrade if we want a single artifact.
* Immediate remediation regardless of choice: remove hardcoded IDs from `auth.ts` and read from
  config.
* Ratified by: _pending_
