# ADR-0007 — AWS CDK vs Terraform

## Context
All AWS resources (VPC, RDS, ECS, SQS, S3, KMS, DynamoDB, Cognito, CloudFront/ALB, Lambda) are
managed as code. The codebase is TypeScript throughout. The reference design chose Terraform;
this project uses **AWS CDK** (`implementation/infra`, 8 stacks).

## Decision required
Which tool defines and manages the AWS infrastructure?

## Alternatives evaluated
### 1. AWS CDK (TypeScript)
+ Same language as the application; loops, types, and IDE support for free.
+ High-level constructs cut boilerplate (one construct wires a Fargate service, LB, logs).
+ First-class AWS support; synthesizes CloudFormation.
− Constructs hide the underlying resources; CFN diffs are harder to read.
− AWS-only.

### 2. Terraform (HCL)
+ Cloud-agnostic; explicit state and drift detection; 1:1 resource mapping.
− A second language alongside TypeScript; state backend must be bootstrapped.

### 3. Raw CloudFormation
+ Native, no extra tooling.
− Verbose; slow feedback; painful rollbacks.

## Decision
* **Option 1: AWS CDK (TypeScript).**
* Rationale: one language across app and infra, fast iteration, and high-level constructs match
  a small team moving quickly. The whole stack set is already expressed in CDK.
* Consequence accepted: AWS lock-in and CFN's diff/rollback characteristics.
* Environment split (ADR-0011) is implemented by parameterizing `bin/infra.ts` with an env
  context (`-c env=dev|prod`) to emit `DocBridge-dev-*` / `DocBridge-prod-*` stacks.
* Ratified by: Amo Paymon (2026-09-27)
