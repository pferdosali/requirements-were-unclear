# DocBridge — Architecture Decision Records

Each ADR captures one decision: the context, the decision required, the alternatives evaluated
(with honest advantages `+` and drawbacks `−` for each), and the decision with rationale. This
matches the team ADR template.

> **Grounding note.** These ADRs document the decisions behind the system **as actually built**
> in this repository. Where the decision differs from the more ambitious reference design, that
> is called out. **Open** ADRs record decisions not yet settled.

## Index

| ADR | Title | Status |
|---|---|---|
| [ADR-0003](ADR-0003-authentication.md) | Authentication: Cognito JWT vs mock header | Accepted (transitional) |
| [ADR-0004](ADR-0004-service-decomposition.md) | Single Express service vs microservices | Accepted |
| [ADR-0005](ADR-0005-worker-compute-model.md) | In-process worker vs Lambda | Accepted |
| [ADR-0006](ADR-0006-task-queue.md) | SQS + DLQ for asynchronous delivery | Accepted |
| [ADR-0007](ADR-0007-iac-tooling.md) | AWS CDK vs Terraform | Accepted |
| [ADR-0008](ADR-0008-database.md) | Single RDS PostgreSQL, migrate-on-startup | Accepted |
| [ADR-0009](ADR-0009-encryption-at-rest.md) | S3 SSE-KMS for staged files | Accepted |
| [ADR-0010](ADR-0010-routing-store.md) | DynamoDB routing table for destinations | Accepted |
| [ADR-0011](ADR-0011-dev-prod-pipelines.md) | Dev/Prod environments in one account + promotion pipeline | Accepted |
| [ADR-0012](ADR-0012-frontend-config-secrets.md) | Frontend config/secret handling | **Open** |
| [ADR-0013](ADR-0013-status-delivery.md) | WebSocket push vs polling for status | Accepted |
| [ADR-0014](ADR-0014-access-control-model.md) | Per-user allow/deny access model | **Open** |

## Template

```
# ADR-NNNN — <short title>

## Context
<why a decision is needed; current situation, briefly>

## Decision required
<one clear question, no leading hints>

## Alternatives evaluated
### 1. <option>
+ <advantage>
− <drawback>
### 2. <option>
...

## Decision
* <chosen option> and rationale.
* <consequences accepted>
* Ratified by: <name> (<date>)
```
