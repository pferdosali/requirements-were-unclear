# ADR-0003 — Authentication: Cognito JWT vs mock header

## Context
DocBridge exposes an HTTP API consumed by a browser SPA. Every `/api/*` endpoint must reject
unauthenticated requests. A Cognito user pool already exists and is live
(`us-east-1_jCnHbWlwq`, stack `DocBridge-Auth`), and the frontend already integrates
`amazon-cognito-identity-js` and sends `Authorization: Bearer <idToken>`. However, the API
middleware (`src/middleware/auth.ts`) currently trusts only an `x-user-id` header and does not
verify the JWT. This is fine for local iteration but is not an authentication control.

## Decision required
How does the API authenticate requests: verify Cognito-issued JWTs, or keep the mock header?

## Alternatives evaluated
### 1. Verify Cognito JWT; keep `x-user-id` as a dev-only fallback
+ Real authentication: signature, issuer, audience, and expiry checked against the pool JWKS.
+ Uses identity infrastructure that already exists and is already partly wired on the frontend.
+ `x-user-id` remains available for local/dev and existing tests, guarded by an env flag.
− JWKS fetch/caching and claim validation to implement and test.
− Two code paths (JWT + fallback) until the fallback is removed.

### 2. Keep mock `x-user-id` only
+ Zero work; tests already assume it.
− Not authentication: any caller can claim any user id. Unacceptable for anything shared.

### 3. Put a Cognito JWT authorizer at the edge (API Gateway) instead of in the app
+ Rejects invalid traffic before it reaches the service.
− The current edge is CloudFront + ALB, not API Gateway; adding a gateway is a larger change
  than the app-level check and is out of scope for this release.

## Decision
* **Option 1.** The API verifies the Cognito JWT (signature via JWKS, issuer, client/audience,
  expiry) and derives `req.user` from claims. `x-user-id` is retained **only** as a dev fallback
  behind an environment flag, so existing tests and local runs keep working.
* Transitional status: the fallback is removed once the frontend login is fully cut over.
* Consequence accepted: a JWKS cache and clock-skew handling live in the middleware.
* Ratified by: Amo Paymon (2026-09-27)
