# Architecture decisions

Updated: 2026-11-17. Baseline context and evidence: [AUDIT.md](AUDIT.md). ADR-008 supersedes the preview-only behavior and upload replacement described in earlier M1 decisions; JSON body size is now 256 KiB for bounded full-document saves.

## ADR-010 — Private gap plans separate task progress from resume evidence

**Status:** accepted for M4 following the owner's instruction to implement saved next steps.

Store up to 20 bounded plans inside each existing owner-scoped job version. Create only from its current validated review; the client supplies a requirement ID and confirmation, never a replacement requirement or owner. Preserve the original quote, term, kind and priority. Hash kind, normalized term and normalized quote to reject duplicate plans even if a later model response changes its ordering or label. Context/eligibility/duration requirements allow a manual-check plan only. Existing experience and practice needs are user confirmations, not automatic inferences from missing text.

Use deterministic starting tasks with editable 1–5 criteria rather than another provider call. Persist private notes, optional credential-free HTTP(S) URL, checks and status. Completion requires all checks and nonblank outcome notes but remains explicitly self-reported. No URL is fetched or verified. No plan data enters the provider request, resume content, PDF or base profile DTO. User edits the resume separately and saves before local reassessment. Reuse the existing conservative exact/alias matcher against the frozen requirement, recording the checked resume revision and evidence excerpts. A fresh work mention establishes text coverage only; it does not prove competence. Reassessment never changes task status.

Plan mutations compare both the saved resume revision and a separate `plansRevision`, then atomically replace the bounded array and increment only the plan counter. This prevents concurrent plan changes from overwriting notes without unnecessarily invalidating resume review/export. Resume/review writes also guard the plan counter; plan writes guard the analysis snapshot. These checks keep the combined 500 KiB content/JD/review/plan budget valid across concurrent operations. Legacy missing plan fields start at empty/zero. Embedded deletion remains atomic with the version or base profile; no new service, transaction requirement, dependency or collection is needed.

The UI keeps plan drafts independent of resume drafts. Navigation/unload warns about either; a plan save preserves unsaved resume edits. Discarding resume edits keeps plan drafts. Saving/reloading a resume remounts the review panel with current persisted metadata and warns before discarding unsaved plan edits. A stale plan error retains local notes; explicit reload confirms their discard. Unsaved drafts still live only in memory and cannot survive forced refresh or session expiry.

**Consequences:** the current hosting topology is sufficient and plans add no inference cost. Starter tasks are deliberately narrow templates, not adaptive curricula. Sources/URLs/outcomes are not independently verified; no readiness percentage, automatic skill endorsement or hiring prediction is added. Real-user validation and release hardening remain open.

## ADR-009 — Grounded job review and bounded embedded resume copies

**Status:** accepted for M3, following owner authorization of the job-tailoring workflow.

Embed up to 20 job versions inside the owner's existing profile, hidden from default profile queries. Each has a server-generated ID, fixed job description, base revision, editable content, its own revision, and a cached review. This avoids a new collection, replica-set/transaction requirement, and orphaned private copies after base deletion on local standalone MongoDB. Creation atomically checks the base revision and array length. Version writes use an owner predicate plus `$elemMatch` containing both version ID and revision; independent array predicates could accidentally match different elements. Only the selected version is projected for load/write operations. Resume content/JD/review together are bounded to 500 KiB JSON per version with headroom for BSON overhead and the base document. This is editable job-specific copies, not immutable history.

The backend sends only the JD to Groq, requesting at most 20 structured requirements. Runtime validation rejects unknown keys, invalid types, invalid categories, missing/truncated output, excessive counts and non-verbatim quotes/skill terms. These checks establish source linkage, not semantic correctness or complete extraction. Context, alternatives, negations and duration-qualified quotes are conservatively unassessed. Candidate text remains on the backend: exact terms and a small explicit alias list locate work-description mentions versus summary/skill/technology-list claims. Resume mentions remain self-reported evidence. No semantic score or hiring probability is generated; equivalence/negation heuristics have known limits.

Generate safe ordering suggestions locally by moving complete existing relevant lines first, retaining all lines. A proposal includes source ID/label, original, proposed and reason. The user can accept into the draft, edit wording, or reject; no automatic save/export of proposals. Applying checks current source text and label to avoid replacing a newer unsaved section. Accepted text remains dirty until explicit save, which invalidates cached analysis. Free-form generated rewrites and numeric/entity heuristics are deliberately deferred: preserving existing lines provides a stronger factual boundary for this release.

One review uses one provider request with a 25-second timeout and no automatic retries, one active review per account/process, rate limiting and a revision cache. Token usage is retained/logged alongside bounded event categories, never JD/resume/provider payloads. Currency cost stays unknown. A completed review is written only if the same owned version/revision still exists; concurrent edits/deletion discard it with 409. Distinguish provider authentication/model/rate/timeout/output failures using safe codes and operator logs. Recovery does not overwrite resume data. The Groq SDK timeout class is checked using `instanceof` because its `name` is simply `Error` in the installed SDK.

**Consequences:** no new infrastructure or production dependency; editing and export still work when AI is unavailable. The same Vercel/Render/Mongo deployment topology can serve this workflow after release approval. Future high-volume versions should use a separately justified storage/retention design; arbitrary version counts are not supported. ADR-010 adds user-confirmed gap plans; real-user validation and production release gates remain open.

## ADR-008 — A saved base resume before job-specific intelligence

**Status:** accepted, owner approved editor-first direction on 2026-11-17.

Keep the current stack and hosting topology. One owner has one base profile. Add manual creation and a complete, runtime-validated content update. Allow only declared fields, bounded strings/arrays and credential-free HTTP(S) links. Unknown fields and supplied ownership fail validation. Extraction maps absent optional null strings to empty strings, then uses the same content contract; unknown keys, missing arrays and invalid types fail. This validates shape, not factual accuracy.

Use an explicit integer revision and an atomic `{_id, userId, revision}` update with `$inc`. Legacy documents without revision start at zero. Stale edits return 409 and remain in browser memory until explicit discard/reload. PDF imports create a profile only; the unique owner index prevents concurrent import/manual creation from overwriting existing edits. Replacing an existing resume by upload is deliberately unavailable. Successful correction removes legacy raw resume text.

The editor has one draft and a saved snapshot. Save is explicit, inputs are disabled during a save, and export is disabled while dirty. Fetch a PDF for the known saved revision, then use one private blob URL for both preview and download. Revoke URLs on replacement/unmount. A server-side revision check rejects stale export requests. Downloading an already generated PDF is downloading that snapshot. Preserve user-entered skills instead of requiring normalization on every save; manual editing/export performs no model work.

Regenerate a single PDFKit layout rather than promising exact-source PDF layout editing. Bundle OFL Noto Sans fonts for reproducible common Unicode output. Full writing-system coverage and complex pagination remain release checks. Remove unused preview-only/fake-verification and score-dashboard components. The legacy optimizer API remains for compatibility but is not exposed in the editor; replace its unchecked score/rewrite contract before job review is reintroduced.

**Consequences:** the existing Vercel/Render/Mongo/Qdrant setup is sufficient for this milestone; no new paid service is added. Playwright is a development test dependency. Sessions and unsaved drafts still live only in memory; refresh/login expiry can lose unsaved edits. This is a working editor milestone, not completion of SaaS release gates. M3 must preserve the base resume and explicitly approve changes in separate owner-scoped job versions.

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
