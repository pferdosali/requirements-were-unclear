# ADR-0009 — S3 SSE-KMS for staged files

## Context
Staged files are clinical documents and must be encrypted at rest, with encryption managed by a
cloud KMS (no home-grown crypto). Files land in S3 and are read back by the worker for delivery.

## Decision required
Which S3 server-side encryption mode for the staging bucket?

## Alternatives evaluated
### 1. SSE-KMS (KMS-managed key)
+ KMS performs encryption; usage audited in CloudTrail; no crypto written by us.
+ Compatible with direct browser uploads and worker reads.
+ Path to a customer-managed key (CMK) later without application changes.
− Per-request KMS cost (reduced with S3 Bucket Keys).

### 2. SSE-S3 (S3-managed keys)
+ Zero config, no KMS cost.
− No key we control; weakest for a compliance-sensitive domain.

### 3. SSE-C (customer-provided keys)
+ Full possession of key material.
− Key bytes must travel with every request; incompatible with presigned browser uploads.

## Decision
* **Option 1: SSE-KMS**, with S3 Bucket Keys enabled to cut request cost.
* Rationale: satisfies "encryption managed by a cloud KMS, no crypto by us," audited in
  CloudTrail, and keeps direct-to-S3 uploads working.
* Upgrade path: switch to a customer-managed key if a client/auditor requires key ownership —
  a bucket-setting + key-resource change, invisible to app code.
* Ratified by: Amo Paymon (2026-09-27)
