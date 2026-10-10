# Local → staging → production

Use this station for development and validation, GitHub Actions for builds and deployments, and separate AWS staging resources. A separate AWS account is preferable as the project grows; this implementation supports separate accounts via CDK environment variables. In one account, staging uses distinct stack/resource names and its own VPC, database, buckets, queues, user pool, routing table, and services. Never copy production clinical data into staging.

## Release flow

1. Run `bash scripts/validate.sh` locally; develop on a branch and open a PR.
2. PR checks install locked dependencies, typecheck/test the API, build the frontend and mock Lambda, test infrastructure, and synthesize both environments.
3. Merge to `main`: when repository variable `DEPLOYMENTS_ENABLED=true`, build one Docker image, push a unique release tag, resolve its immutable digest, and retain the frontend artifact.
4. Deploy that digest and frontend artifact to staging. Wait for both services to stabilize, verify the expected task revisions (including detection of ECS rollback), publish frontend/config, invalidate CloudFront, and run smoke checks.
5. The production job waits for GitHub environment approval. Review staging manually, then approve promotion of the same digest and compiled frontend artifact. Environment-specific Cognito IDs are supplied by `/config.js`.

Required reviewers must be configured in GitHub; naming an environment in YAML does not itself enable approval. Configure this before enabling the workflow. The build job checks the production environment via the GitHub API and fails closed if no required reviewers exist; allow the workflow token to read environment settings. The current smoke test checks frontend availability and `/api/me`; it is not an upload/delivery acceptance test. Run a synthetic upload and check destination contents in staging before approval. Update the smoke test when backend JWT authentication replaces mock auth.

## GitHub setup

Create environments `build`, `staging`, and `production`. Keep repository variable `DEPLOYMENTS_ENABLED=false` during provisioning; enable it after resource variables and environment-specific roles are verified. CI validation runs regardless of that switch. Restrict all to `main`; configure a required reviewer on `production`. For a solo maintainer, allow self-review so you can approve your own release. Protect `main` with PR checks.

Set environment secret `AWS_DEPLOY_ROLE_ARN` for each environment. Use GitHub OIDC, not long-lived AWS keys. Each role's trust policy must match this repository and environment, for example `repo:pferdosali/requirements-were-unclear:environment:staging`, with audience `sts.amazonaws.com`.

The build role needs ECR login/push/describe access to the release repository. Deployment roles need ECS describe/register/update, `iam:PassRole` limited to their environment's task/execution roles, write/list access to their frontend bucket, and CloudFront invalidation/get access to their distribution. Do not give deployment roles CDK/admin rights. If accounts are separate, authorize both environments to pull from the release ECR repository (repository policy and execution-role permissions).

Variables in `build`: `AWS_REGION` (default `us-east-1`), `ECR_REPOSITORY` (default `docbridge`).

Variables in both deployment environments:

| Variable | Meaning |
| --- | --- |
| `AWS_REGION` | Environment AWS region |
| `ECS_CLUSTER` | `docbridge-staging` or existing production `docbridge` |
| `API_SERVICE`, `WORKER_SERVICE` | Exact service names from AWS |
| `FRONTEND_BUCKET` | Environment frontend S3 bucket |
| `CLOUDFRONT_DISTRIBUTION_ID` | Environment distribution ID |
| `FRONTEND_URL` | HTTPS origin without trailing slash |
| `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` | Environment auth outputs |

Existing production distribution is `EYJ0TF0EM7LS3`, URL `https://dk9dmvpe7a2yb.cloudfront.net`. Discover and verify remaining production values from AWS before setting them. Staging and production variables must reference different resources.

## Provision staging once

Provisioning is intentionally separate from application releases. Preview the CDK diff and review cost/resources first. A full staging copy incurs additional AWS charges; shut it down when appropriate for this sandbox.

After validation builds the mock Lambda, from `implementation/infra`:

```bash
# Use credentials for the intended staging account. This station currently uses profile default.
export AWS_PROFILE=default
# Bootstrap the account if necessary.
npx cdk diff -c environment=staging -c imageTag=<release-tag>
npx cdk deploy --all -c environment=staging -c imageTag=<release-tag> --outputs-file staging-outputs.json
# Read the Edge FrontendUrl output, then configure browser upload CORS:
npx cdk deploy DocBridge-Staging-Storage -c environment=staging -c imageTag=<release-tag> -c frontendOrigin=https://<staging-distribution>.cloudfront.net
```

If using a different ECR repository, also pass `-c ecrRepository=<name>` on every CDK command. Initial services require an image already present in that repository; seed it with a reviewed image first. Persist your staging imageTag/frontendOrigin/ecrRepository context in your deployment configuration for subsequent infra changes. Use `CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION` to target another account/region.

Seed the staging DynamoDB routing table with the staging mock-destination URLs, and create staging test Cognito users. CDK creates these resources but does not seed routing records/users. Confirm all destination routes point only at staging. Configure GitHub variables using CDK outputs and ECS service discovery. Production stack identifiers and named resources retain their existing names.

Infrastructure updates require a separate reviewed `cdk diff` and deploy. Application CI does not apply infrastructure changes. Database migrations currently run on API startup: migrations must remain backward compatible with the old API/worker during rolling deployment. Database rollback is not automatic.

## Rollback and limitations

Deployment artifacts include each previous and expected task-definition ARN. To roll back a service, use its previous ARN with `aws ecs update-service --cluster <cluster> --service <service> --task-definition <previous-arn>`, then wait for stability. Roll back both API and worker. Restore the frontend from the corresponding earlier workflow artifact and environment config, then invalidate CloudFront. Assets are retained to support existing browser sessions.

ECS circuit breakers handle service startup failures; smoke-test failures mark the release failed and block production but do not automatically reverse all changes. API, worker, and frontend updates are sequential rather than transactional. Retain ECR release digests and workflow artifacts needed for rollback. A workflow rerun builds a new release and goes through staging again.

The currently published API uses mock identity headers. This pipeline does not resolve that authentication gap; JWT validation remains necessary before treating the application as production-ready.
