# Architecture decisions

Date: 2026-11-16. Baseline context and evidence: [AUDIT.md](AUDIT.md).

## ADR-001 — Preserve the modular monolith

**Status:** accepted.

Keep React/TypeScript + Express + MongoDB, with Qdrant/FastEmbed for semantic taxonomy lookup. Account/session, ingestion, profile, normalization, matching and export are module boundaries in one API. Routes enforce HTTP/auth rules; services handle domain work; models handle persistence. Introduce a new framework/store/service only when a measured constraint requires it.

**Consequences:** one deployment and understandable failure paths; no need for Kubernetes, microservices or multi-agent orchestration. Existing route/service separation can be improved incrementally. Qdrant is not an authority on candidate competence: it suggests canonical skills.

## ADR-002 — Opaque, revocable server-side sessions

**Status:** accepted for M1; session UX can evolve later.

Use Node's asynchronous scrypt with a random 16-byte salt and a versioned hash representation. M1 parameters: N=32768, r=8, p=3, 64-byte derived key; maxmem 64 MiB. Verify with a timing-safe comparison. Passwords are bounded to 12–128 characters and omitted from normal queries/responses/logs. Unknown-login users perform a dummy hash comparison. Account existence can still be inferred from a duplicate registration response; email verification/recovery and enumeration resistance remain follow-up work.

Generate 32 random bytes for a bearer token; store only its SHA-256 hash, owner ID and absolute one-hour expiration in MongoDB. Hashing a high-entropy random token does not need password-strength key derivation. Each request checks both the hash and future expiry. Mongo TTL is cleanup, not the authorization clock. Logout deletes the current session.

Keep the bearer token only in browser memory and send it in Authorization headers. No cookies or local/sessionStorage tokens; requests have no ambient credentials, so another origin cannot cause an authenticated request through a simple form. The existing frontend/backend use different hosting domains; a same-site HttpOnly cookie design would benefit from a unified origin and explicit CSRF controls. JWTs provide no advantage here because immediate server-side revocation is required anyway.

**Consequences:** refresh/tab close loses the browser token and requires login; the server session remains until expiry if the tab closes without logout. This is an explicit initial UX tradeoff. TLS is required outside localhost. XSS remains a threat to an active page; memory storage is not an XSS defense. CSP/dependency review and a first-party hosting/session strategy remain release work. No refresh tokens in M1. Email verification, password reset/change and account-wide session revocation are not yet implemented.

## ADR-003 — Ownership comes from the session

**Status:** accepted.

Authenticate before multipart upload processing and all private profile operations. Build Mongo predicates from authenticated `res.locals.userId`; never accept an owner field in a body/query. For ID routes use `{ _id, userId }`, validate the ID format, and return the same 404 for missing and foreign records. Derive upload upsert owner from the session. Use explicit response DTOs; no token hash, owner ID, raw resume or dormant public slug is returned.

**Consequences:** frontend removes the shared demo ID and supports account sign-in and authenticated blob downloads. Object IDs are resource locators, not access credentials. New endpoints must extend the same negative access tests. Existing arbitrary/shared-ID records cannot be securely claimed from resume email; they remain inaccessible to new accounts. Any migration of legacy user data requires a separately reviewed ownership/recovery procedure.

## ADR-004 — Private by default; disable unsafe legacy publication

**Status:** accepted.

Existing slug links were created without consent and expose contact data. M1 makes the legacy public route return 404 without a database lookup. Keep dormant schema fields to avoid destructive data migration during the access-control patch, but do not return or activate them. Remove the share button until sharing is implemented with explicit opt-in, an allowlisted preview, unpredictable tokens, expiry and revocation.

Stop saving raw resume text on new uploads; unset it on re-upload of the same owned record. Remove the legacy browser profile cache on app mount and retain current profiles only in memory. Add owner-only profile deletion. Log bounded event names/counts instead of resume/model content, IDs, file names, provider exceptions or database URLs.

**Consequences:** raw evidence will need a new consent/retention design when source evidence is introduced; prefer minimal spans linked to reviewed fields. This change does not purge existing database rows, provider logs, backups or browser caches on devices that never open the updated app. Do not claim otherwise. Account deletion and documented retention policies remain release gates.

## ADR-005 — Bounded requests and safe errors before advanced resilience

**Status:** accepted for single-process development; scaling deferred.

Apply a bounded in-process fixed-window request limiter (200 API requests/minute/IP), credential limiter (20 attempts/15 minutes/IP), and AI limiter (10 upload/optimize requests/15 minutes/account). Credential throttling excludes logout so failed sign-ins do not prevent session revocation. Do not trust arbitrary forwarded headers; default Express proxy trust remains off. Production deployment must explicitly test a trusted proxy configuration; conservative default may group users behind a proxy.

Use fixed 10 MB uploads, one PDF/no text fields, declared MIME plus `%PDF-` signature and parser content extraction; cap extracted text at 100,000 characters, job descriptions at 20,000 characters and JSON requests at 32 KiB. File signature alone is not full PDF safety. Return safe consistent errors and no-store responses. A generic 500 does not serialize provider/database errors into the response.

**Consequences:** bounded memory limiter state and no new production dependency/store, but quotas reset on restart and are not distributed. Authenticated users can still submit concurrent work and many accounts can distribute abuse; phase 1/5 must add parser/page/time limits, concurrency admission and shared account/IP budgets before release. Large valid PDFs with highly compressed text can exceed limits during parsing before the text-length check; isolation remains necessary. Fixed 10 MB replaces the previously loosely parsed MAX_FILE_SIZE_MB setting.

## ADR-006 — Make correctness visible; do not silently claim a finished AI product

**Status:** accepted.

M1 persists/returns extracted projects and uses saved profiles for matching/export. Persistent corrections, resume versions and approved AI rewrites are separate milestones. The UI discloses that preview edits are unsaved and labels the existing match score as an unvalidated AI estimate. Remove selectable PDF themes because the backend has only one implementation. Future matching must compute reproducible components from validated job requirements/evidence; never report hiring probability.

**Consequences:** the existing AI workflow remains usable as a prototype, with explicit limitations; it is not considered release-ready. Prompt instructions alone are insufficient for factuality or injection protection. Phase 2 introduces runtime contracts, evidence, bounded recovery and offline evaluation, and requires approval before saved rewrites reach export.

## ADR-007 — Test boundaries without contacting production

**Status:** accepted.

Use Node's built-in test runner with the existing tsx loader. HTTP tests exercise the real app/middleware, password hashing, authorization and multipart processing while replacing only Mongo methods and expensive services. Add a separate disposable MongoDB test to verify real indexes, owner queries, upsert/persistence, hidden fields, expiry/revocation and deletion. Inject AI/PDF services for deterministic ingestion tests; test real PDF separately with synthetic fixtures. No real candidate data, existing environment credentials or live LLM calls are needed.

**Consequences:** offline regression tests are quick and deterministic; the disposable Mongo test downloads a Mongo binary on first use and requires an appropriate local OS. Clearly distinguish service doubles from live provider/embedding/PDF verification. Browser/AI evaluation suites and CI follow in later milestones. This approach avoids pretending mocked storage alone proves MongoDB behavior.
