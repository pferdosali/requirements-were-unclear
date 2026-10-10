# Deployment access approval plan

Prepared 2026-10-10T10:43:13-07:00. IAM changes have not been applied.

Create roles `docbridge-github-build`, `docbridge-github-staging`, and `docbridge-github-production`, using the existing GitHub OIDC provider in the project AWS account. Trust is restricted to repository `pferdosali/requirements-were-unclear`, the matching GitHub environment, and audience `sts.amazonaws.com`.

- Build: authenticate to ECR and push/read release images only in the `docbridge` repository.
- Staging: update only staging API/worker services, pass only their existing task/execution roles to ECS, publish only the staging frontend bucket, and invalidate only the staging distribution.
- Production: equivalent scope limited to the existing production resources discovered locally.
- ECS task-definition registration/description require `Resource: "*"`; deployment and role-passing permissions remain scoped. These roles receive no CDK, IAM-management, database, document-bucket, or resource-deletion permissions.
- Set the role ARN as environment secret `AWS_DEPLOY_ROLE_ARN`, and populate resource variables from verified AWS discovery. The secret is a role identifier, not an AWS access key.
- Production application deployment remains a separate GitHub approval by `pferdosali`.

The configuration script plans by default; `--apply` performs the IAM/GitHub changes. It refuses to replace existing roles without the `ManagedBy=DocBridgeCI` tag. The full staging policy will be generated after its stack resources exist, using the same scoped policy function.

Automatic approval review rejected IAM creation because the exact persistent privilege grants were not explicitly approved. User approval is required before running `--apply`.

Exact resource identifiers and JSON policies are retained in gitignored `.local/DEPLOYMENT_ACCESS_PLAN.md` and `.local/*-policy.json`, not published in this public repository. The local plan remains the approval reference.
