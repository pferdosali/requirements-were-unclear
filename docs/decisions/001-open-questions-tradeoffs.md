# Engineering Decisions: Open Questions & Tradeoffs

**Date:** 2026-08-15  
**Author:** Senior Engineer Review  
**Status:** Recommendation provided — awaiting owner sign-off

---

## 1. Worker Docker Image: Shared vs Separate

### Context

The API service (Express HTTP server) and Worker service (SQS long-poll consumer) currently live in the same `implementation/api/` codebase. Both Fargate task definitions use the placeholder `amazon/amazon-ecs-sample` image. The question is whether they should share a single Docker image with different entrypoints, or be built as two separate images.

### Option A: Shared Image, Separate Entrypoint

```dockerfile
# Single Dockerfile
FROM node:20-alpine
COPY . .
RUN npm ci --production && npm run build
# Entrypoint determined by ECS task definition command override
CMD ["node", "dist/server.js"]
```

API task: `CMD ["node", "dist/server.js"]`  
Worker task: `CMD ["node", "dist/worker/index.js"]`

| Pros | Cons |
|------|------|
| Single build pipeline — one ECR repo, one CI job | Image is larger than either service strictly needs |
| Guaranteed version consistency (API and worker always on same code) | Worker pulls Express, route handlers, etc. that it never uses (~5MB wasted) |
| Simpler rollback — one image tag to revert | Security surface area is larger (worker has HTTP deps it doesn't need) |
| Faster initial setup — fewer moving parts | Can't independently scale build/deploy cadence |
| Shared dependency layer means smaller incremental pulls | If API image breaks (bad dependency), worker also breaks |

### Option B: Separate Images

```
implementation/
├── api/Dockerfile        → docbridge-api:latest
└── worker/Dockerfile     → docbridge-worker:latest
```

| Pros | Cons |
|------|------|
| Minimal attack surface per container | Two ECR repos, two build pipelines |
| Independent deploy cadence (ship worker fix without touching API) | Must maintain version compatibility between shared types |
| Right-sized images (~40MB worker vs ~80MB API) | Risk of drift between API and worker if shared code diverges |
| Easier to reason about resource limits per service | More CI complexity (build matrix or separate workflows) |
| Can optimize base image per workload (e.g., worker doesn't need HTTP) | Slower initial setup |

### Recommendation: **Option A (Shared Image) for now, extract later**

**Rationale:**
1. The codebase is small (<5K LoC). The overhead of separate images isn't justified yet.
2. The worker imports from `../services/` (task-service, job-service, routing-service, delivery-service). Extracting it means either duplicating that code or publishing a shared package — premature at this stage.
3. Version consistency is critical during active development. A shared image guarantees the worker and API always agree on message schemas, DB models, and service contracts.
4. The "wasted" image size (~5MB of HTTP deps in the worker) is negligible at this scale.
5. You can extract later when: (a) deploy cadence diverges, (b) the worker needs a fundamentally different base image (e.g., for native binaries), or (c) the codebase crosses ~15K LoC.

**When to revisit:**
- Worker needs native dependencies the API doesn't (e.g., libvips for image processing)
- You're deploying API 5x more often than worker
- Security audit flags shared deps as a risk
- Image size exceeds 500MB

---

## 2. Maximum File Size Limit

### Context

The system uses presigned S3 URLs for upload (supports up to 5GB per single PUT). The delivery service downloads files into memory before POSTing to the destination. Current hard limit: 100MB.

### Considerations

| Factor | Implications |
|--------|-------------|
| **Clinical document sizes** | PDFs: 1-20MB typical, up to 50MB for imaging reports. HL7/CDA: <1MB. DICOM images: 50MB-2GB (but usually separate systems) |
| **Fargate memory** | 512MB allocated → ~350MB usable after runtime overhead. 100MB buffer is safe. |
| **S3 presigned PUT** | Single PUT supports up to 5GB. Multipart needed above that. |
| **Destination POST** | Most healthcare APIs accept 50-100MB per request. Larger files typically use chunked upload protocols. |
| **Cost** | Larger files = more NAT transfer, more Fargate memory, longer processing time |
| **Browser upload UX** | Files >100MB take 30s+ on typical connections. Need progress tracking (already implemented). |

### Options

| Limit | Suitable For | Tradeoff |
|-------|-------------|----------|
| 25MB | Text documents, small PDFs | Too restrictive for imaging PDFs |
| **100MB** | All clinical documents, scanned PDFs | Covers 99%+ of use cases without architecture changes |
| 250MB | Large imaging reports, batched documents | Requires Fargate memory increase (1GB+), ~$18/mo per service |
| 1GB | Everything short of raw DICOM | Requires streaming delivery (Option B below), significant memory/cost increase |

### Recommendation: **100MB upload limit, 100MB delivery buffer (current)**

**Rationale:**
1. Covers the stated use case (clinical document delivery) without overengineering.
2. Keeps Fargate at the cheapest tier (512MB / 0.25 vCPU = ~$9/mo).
3. The presigned URL already enforces `Content-Length` via `x-amz-content-length` condition — adding a 100MB server-side validation is trivial.
4. If a user tries to upload >100MB, fail fast at presign time with a clear error, not after a long upload.
5. Revisit if the product expands to handle medical imaging (DICOM), which is a different problem space.

**Implementation:**
```typescript
// In upload-service.ts — add to presign validation
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB
if (fileSizeBytes > MAX_UPLOAD_BYTES) {
  throw new ValidationError(`File size ${fileSizeBytes} exceeds maximum allowed (${MAX_UPLOAD_BYTES} bytes)`);
}
```

---

## 3. Streaming vs Memory Buffer for File Delivery

### Context

When the worker delivers a file to a destination, it currently:
1. Downloads the entire file from S3 into a Node.js `Buffer` (memory)
2. Computes SHA-256 checksum
3. POSTs the buffer to the destination endpoint

This is the "memory buffer" approach. The alternative is "streaming" — piping the S3 response stream directly to the destination HTTP request.

### Option A: Memory Buffer (Current Implementation)

```
S3 → [Download to RAM] → [Verify Checksum] → [POST to Destination]
```

| Pros | Cons |
|------|------|
| Checksum verification before delivery — guarantees data integrity | Memory-bound: 100MB file = 100MB RAM + overhead |
| Simple retry: if POST fails, retry with same buffer (no re-download) | Slower time-to-first-byte (must download fully before sending) |
| Full error context: know the file is valid before attempting delivery | GC pressure on large buffers in Node.js |
| Easy to test and reason about | Can't handle files larger than available memory |
| If destination rejects (4xx), haven't wasted bandwidth re-downloading | Sequential: download time + upload time (not parallelized) |

### Option B: Streaming (Pipe S3 → Destination)

```
S3 → [Transform Stream: compute checksum] → [HTTP POST body]
```

| Pros | Cons |
|------|------|
| Constant memory (~64KB buffer regardless of file size) | Can't verify checksum before sending (only know at end of stream) |
| Handles multi-GB files | If destination fails mid-stream, must re-download from S3 |
| Faster TTFB: starts sending as destination receives | Complex error handling: partial writes, broken pipes, backpressure |
| Lower GC pressure | Can't retry without re-establishing the S3 stream |
| Total transfer time is (max of download, upload) not (sum) | Destination receives data before integrity is confirmed |
| | Node.js stream error handling is notoriously tricky (error events, premature close, backpressure) |
| | Harder to unit test (need to mock stream lifecycle) |

### Option C: Hybrid (Memory for small, Stream for large)

```
if file < 100MB → Memory Buffer (Option A)
if file ≥ 100MB → Streaming (Option B)
```

| Pros | Cons |
|------|------|
| Best of both worlds for the common case | Two code paths to maintain and test |
| Large file support without sacrificing integrity for small files | More complex branching logic |
| Graceful degradation | Need to determine file size before choosing path (S3 HeadObject) |

### Recommendation: **Keep Memory Buffer (Option A). Add streaming only if >100MB support is required.**

**Rationale:**
1. **Data integrity is non-negotiable for clinical documents.** Delivering a corrupted file to a healthcare system is worse than delivering it slowly. Memory buffer lets you verify before sending.
2. **The 100MB limit covers the stated use case.** Clinical PDFs, HL7 messages, and CDA documents are well under this threshold.
3. **Streaming adds significant complexity for minimal gain at this file size.** The engineering effort to properly handle stream errors, backpressure, partial failures, and checksum-after-delivery isn't justified for files under 100MB.
4. **Retry semantics are dramatically simpler with buffered data.** If the destination returns a 503, you retry the POST immediately without re-downloading from S3.
5. **Cost impact is minimal.** A 100MB buffer in a 512MB Fargate task is fine. You'd only need streaming if processing many large files concurrently — and the worker processes one message at a time.

**When to add streaming:**
- Product requirement for files >100MB (medical imaging, video)
- Worker needs to handle concurrent deliveries (not current design)
- Memory costs become significant at scale (>10 workers running concurrently)

**If you do add streaming later:**
- Use the Hybrid approach (Option C)
- Add `Content-MD5` or `x-amz-checksum-sha256` response validation
- Implement post-delivery checksum verification with the destination (ask destination to confirm received checksum)
- Consider a separate "large file worker" service with higher memory allocation

---

## Summary of Recommendations

| Question | Recommendation | Confidence |
|----------|---------------|------------|
| Worker Docker image | Shared image, separate entrypoints | High — extract when complexity warrants it |
| File size limit | 100MB (enforce at presign time) | High — covers clinical docs, revisit for imaging |
| Streaming vs Memory | Memory buffer (current) | High — integrity > throughput for healthcare data |

All three recommendations optimize for **simplicity and correctness at current scale** over premature optimization. Each includes a clear "when to revisit" trigger so you're not locked in.
