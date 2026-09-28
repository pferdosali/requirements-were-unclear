# DocBridge Runbook

Operational guide: deploy, promote, roll back, and diagnose. Account `930330383608`, region
`us-east-1`.

## Environments

One AWS account, two environments via env-suffixed CDK stacks:

| Environment | Stacks | Deploys when |
|---|---|---|
| Dev | `DocBridge-dev-*` | merge to `dev` branch |
| Prod | `DocBridge-prod-*` | merge to `main` branch, after manual approval |

## Deploy (via CI/CD — preferred)

1. Open a PR into `dev`. CI runs `tsc`, `npm test`, `cdk synth`.
2. Merge to `dev` → the **Deploy Dev** workflow builds the image (tagged with the git SHA),
   pushes to ECR, deploys `DocBridge-dev-*`, and prints the deployed image URI + commit.
3. Verify Dev (see *Smoke test*).
4. Open a PR from `dev` into `main`. On merge, the **Deploy Prod** workflow **pauses for manual
   approval** (GitHub Environment `production`), then deploys `DocBridge-prod-*`.

The deployed image is tagged `:${git-sha}`, so the running revision maps to a commit (ADR-0011).

## Deploy (manual, break-glass)

```bash
cd implementation/infra
npm ci
npx cdk deploy -c env=dev  'DocBridge-dev-*' --require-approval never   # or env=prod
```

## Roll back

- **Application:** redeploy the previous image SHA to the ECS service
  (`aws ecs update-service --task-definition <prev-revision>` or re-run the deploy workflow on the
  previous commit).
- **Infrastructure:** redeploy the previous CDK synth (checkout the previous commit, `cdk deploy`).

## Smoke test

```bash
# API health (401 without auth is the HEALTHY signal — the guard is active)
curl -s -o /dev/null -w "%{http_code}\n" https://<cloudfront-domain>/api/health

# Authenticated (dev fallback): expect 200 and a user/team payload
curl -s https://<cloudfront-domain>/api/me -H "x-user-id: user-a"
```

## Common diagnostics

| Symptom | Check |
|---|---|
| Deliveries failing | CloudWatch logs for the Worker service; DLQ depth (should be 0) |
| Tasks stuck `pending` | Worker service running? SQS task queue has messages? |
| Uploads rejected | File > 100 MB (M-2)? Content-type allowed (M-3)? presign response |
| Status not updating | WebSocket connectivity; client should fall back to polling |
| Auth 401 everywhere | JWT verification config (issuer/client/JWKS); token expiry |

## Alarms (target)

- **DLQ depth > 0** on any DLQ (backs "no silent loss", M-6).
- **Worker delivery error rate** above threshold.

## Cognito operations

- Pool (dev/prod are separate). Seed demo users via `admin-create-user` (self sign-up is
  disabled). Two demo personas: `user-a` (allow upload), `user-b` (deny upload) — see ADR-0014.
- Google sign-in: federated IdP via Hosted UI; client ID/secret in Secrets Manager.
