# ADR-0010 — DynamoDB routing table for destinations

## Context
Each task carries a destination whose region determines the destination API endpoint. The worker
must resolve `region → { endpointUrl, authType, authToken }` at delivery time
(`routing-service.ts`). This is a small, high-read, key-value lookup that changes rarely.

## Decision required
Where does the region → destination-endpoint routing configuration live?

## Alternatives evaluated
### 1. DynamoDB routing table
+ Simple key-value lookup, single-digit-ms reads, fully managed.
+ Config changes are data writes, not deploys.
+ Independent of the relational store, so routing changes never touch the jobs/tasks schema.
− A second datastore to provision and seed.
− Cross-store consistency is manual (routing vs task rows), acceptable for rarely-changing config.

### 2. PostgreSQL table
+ Reuses the existing database; joinable with tasks.
− Couples routing config to the app schema and its migration/deploy cycle for data that is
  operational config, not domain data.

### 3. Config file / environment variables baked into the image
+ No datastore at all.
− Changing an endpoint requires a redeploy; poor fit for per-region operational config.

## Decision
* **Option 1: DynamoDB routing table.**
* Rationale: the access pattern is exactly a key-value lookup; keeping routing config out of the
  relational schema and out of the image lets endpoints change without a deploy or a migration.
* Ratified by: Amo Paymon (2026-09-27)
