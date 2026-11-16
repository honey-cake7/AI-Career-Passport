# V2 phased roadmap

Updated: 2026-11-17. Work only on `feat/career-passport-v2`. A milestone is complete only after its scoped checks pass, its diff/secrets are reviewed, and commit/push results are recorded. No overall phase is complete.

## Target product

Help a candidate understand the evidence in their resume, compare it to a job's requirements, correct errors, and export a truthful approved resume. Preserve React/TypeScript, Express, MongoDB and Qdrant unless measured needs justify a change. Use one backend with clear modules; no microservices or agent orchestration is needed.

Owner-approved focus: **a job-focused resume editor**. The editor imports structured content and generates a new PDF layout; it does not edit arbitrary source PDF layouts in place. Manual editing/save/export must work without Groq, Qdrant or native inference. Keep a base resume intact when tailoring; no fake verification badges or model-generated readiness scores.

## Approved milestone order

| Milestone | Scope and measurable acceptance criteria | Status |
| --- | --- | --- |
| M2: persisted editor | Manual creation or PDF import; bounded owner-only corrections; reload and PDF contain saved corrections; stale concurrent saves/duplicate imports cannot overwrite; saved PDF preview/download share bytes; mobile/desktop browser tests and real Mongo/PDF tests pass. | Implemented; verification recorded in MILESTONE-2.md. |
| M3: one-job review and versions | Create owner-scoped job version without mutating base. Validated requirements cite exact JD excerpts; explanations identify profile evidence or unknowns. No hiring score. Reject malformed/injection fixtures. Every proposal has original, proposed, reason and source; accept/edit/reject is explicit and export uses approved saved content. Test stale analyses, version ownership and base preservation. | Next |
| M4: actionable gaps | Distinguish weak wording, unsupported claims, user-confirmed gaps and unassessable requirements. Each chosen gap gets one feasible action with completion criteria; user can add evidence and reassess. Test ambiguity and unsupported claims; run a small user pilot without claiming proven demand. | Planned |
| M5: release hardening | Finish outstanding phase 1/2 security and provider contracts; establish held-out AI evaluations, accessibility checks, parsing/inference resource budgets on the actual host, CI, recovery/deletion and deployment runbooks. No production release before gates pass. | Planned |
| Later | Optional bounded GitHub evidence import, sharing or application tracking only after demonstrated need. | Deferred |

The six engineering phases below remain cross-cutting release gates. Editor progress is not completion of authentication lifecycle, AI reliability or production readiness.

The main journey is account → private upload → structured extraction with evidence → user review/correction → canonical skills → structured job requirements → explainable coverage/gaps → truthful rewrite proposals → approval → resume version → PDF. Optional tracking follows this journey; ongoing profile management supports it.

## Phase 1 — Security and correctness

Status: **in progress**. First milestone M1: account/session and profile access boundary, immediate privacy fixes, extracted project persistence.

M1 acceptance criteria:

- Anonymous/forged/expired/revoked sessions cannot read, upload, optimize, export or delete private profiles.
- Registration hashes passwords; login verifies them; sessions are random, hashed in Mongo, explicitly expire and can be revoked.
- Every private profile query binds the authenticated owner. User-supplied ownership is rejected; cross-user operations return 404 and cause no expensive side effects.
- Existing public links return no data; no resume/profile/token is newly persisted in browser storage. New uploads do not retain raw text.
- One PDF up to 10 MB, PDF signature, text bounds and typed bounded job description are enforced. Invalid request bodies use safe errors; logs omit private content/connection strings.
- Extracted projects survive upload persistence and responses. Owner can retrieve/export/delete the saved profile.
- Frontend account/login/logout/load/download/delete controls are connected to authenticated requests and pass lint/build. Record browser verification separately; unobserved behavior remains a release gate. Sharing/theme controls cannot promise unimplemented behavior.
- Relevant security HTTP tests, real Mongo persistence tests, backend checks and frontend checks pass; results and limitations are recorded in `MILESTONE-1.md`.

Remaining phase-1 gates:

- Runtime schemas validate all profile update and AI boundary data, including unknown/null fields, safe URL schemes and maximum lengths/counts.
- Owner-only review/save API persists corrections; reload, optimizer and PDF agree about saved content. No shallow-state mutation.
- Deletion policy covers account, sessions, profile, versions and provider/backup limitations; exercise deletion/recovery using synthetic records.
- Explicit opt-in public sharing supports a reviewed field allowlist, expiry, random tokens and revocation; old slugs never become public implicitly.
- Email verification/recovery strategy and throttling across account/IP scopes are implemented or signup remains restricted for release.
- PDF resources are always cleaned up; page/time/memory and concurrent work limits are verified. Proxy trust and safe production environment configuration are validated.
- Cross-user tests cover every newly added private endpoint. Review no production deployment occurs before security gates pass.

## Phase 2 — AI pipeline reliability

Status: **in progress**. M2 brings existing main-branch normalization fixes into development and validates extracted content. Evidence provenance, normalization evaluation and trustworthy job review remain open.

Acceptance criteria:

- A versioned extraction schema rejects malformed/oversized/unknown model fields under a documented policy. Source spans/page references accompany extracted facts; unknowns remain unknown. One bounded repair attempt is allowed; failures return a recoverable status without partial writes.
- A versioned taxonomy has stable IDs, aliases and a safe seed/migration. Exact/alias matching precedes semantic fallback; raw unresolved skills and ambiguity are preserved. Threshold and top-candidate margin are selected on labeled fixtures and documented, not assumed from cosine similarity alone.
- Embeddings/search run in bounded batches; repeated aliases reuse bounded cache entries. Fixture instrumentation confirms no per-skill LLM loop, with actual call counts reported.
- Job requirements have source evidence and explicit required/preferred/unknown categories. Scoring is deterministic on validated requirements, with documented weights, components, coverage denominator and unknown handling; UI does not imply hiring probability.
- Rewrite proposals point to actual original statements, contain no fabricated numbers/claims and require approval before saving. Numeric/entity regression fixtures and user rejection/approval tests pass.
- A small provider boundary centralizes configured model, timeouts, bounded retries, token/cost budgets and redacted telemetry. Never retry non-retryable validation/auth failures. Report known token counts and estimated cost with pricing provenance; unknown cost is represented honestly.
- Check in synthetic normal, sparse, malformed, ambiguous and injection fixtures with expected outputs. Deterministic tests run offline. Optional live evaluation is opt-in and reports actual precision/error/unsupported-claim observations without invented accuracy claims.

## Phase 3 — Product UX and frontend

Status: **in progress**. M2 replaces the dashboard with a functional editor and saved-PDF flow. Full job/version journey and accessibility release checks remain open.

Acceptance criteria:

- A coherent typographic/spacing/color/focus system replaces excessive gradients/glass/animation. Real data states and plain copy explain what users can do.
- One typed profile state and explicit save/review status connect extraction, correction, matching and export. Show server validation and retry paths; never silently discard edits.
- All interactive controls have real effects, accessible names, focus/keyboard behavior and loading/error states. Remove fake verification/status badges and ignore unsupported metrics/themes.
- Browser checks cover signup → upload → review/save → job analysis → approval → export → signout/relogin → deletion. Check mobile 360px, tablet 768px and desktop 1440px; no horizontal overflow. Automated accessibility scan has no serious/critical violations; manually verify keyboard order and screen-reader labels.
- Keep private data out of URLs/storage/logs and ensure expired sessions clear visible private state.

## Phase 4 — Advanced career features

Status: **not started**. Start only after the main journey works reliably.

Acceptance criteria:

- Immutable owner-scoped resume versions record user approvals/source provenance and can be compared/restored. Export specifies a version and reproduces its content.
- Skill-gap actions point to missing evidence/requirements and practical exercises; never invent candidate competence or guarantee outcomes.
- If application tracking is implemented: manual CRUD/status/history with owner filtering, input validation and deletion tests. It remains optional and does not trigger unsolicited outreach or scraping.
- Sharing/versioning/tracking APIs preserve the existing authorization test matrix; no cross-user references or internal IDs leak publicly.

## Phase 5 — Testing, performance and DevOps

Status: **not started**. Tests required by earlier milestones land with those milestones.

Acceptance criteria:

- CI reproduces lockfile installs, strict typechecks, lint/build, offline regression/evaluation tests and isolated Mongo integration tests without production secrets. Dependency advisories are triaged with actual reachable impact and documented remediation.
- Define a synthetic load corpus and measure upload/match/export latency, memory, provider calls and failure behavior. Set budgets from observed baseline and product needs; report actual figures and test conditions.
- Bound parsing/inference concurrency, provider requests and request lifetime; cancellation does not corrupt persisted data. Shared quotas are implemented before multiple API instances; no extra datastore without justification (Mongo may suffice).
- Multi-stage non-root image uses `npm ci`, pinned supported dependencies/images, no embedded secrets or dev-only packages in runtime. Databases are private; TLS/CORS/proxy trust are documented and tested.
- Liveness/readiness reflect service availability appropriately; structured event IDs, duration and counts support diagnosis without resume/JD/email/token content. Startup/shutdown/dependency failure tests and backup/restore rehearsal pass.

## Phase 6 — Documentation and release preparation

Status: **not started** (audit/roadmap/decisions are foundations).

Acceptance criteria:

- Fresh-clone setup works from environment templates; feature matrix, API contracts, architecture/threat boundaries, migrations and known limitations match verified implementation.
- Prepare runbooks for keys, sessions, deletion, outages, provider budgets and rollback; confirm data-retention and sharing consent behavior with synthetic records.
- Release checklist links passing CI, evaluations, browser/accessibility checks, dependency review and reviewed changes. No phase is complete based solely on documentation or compilation.
- Owner can explain authentication versus authorization, model validation versus JSON mode, taxonomy ambiguity, evidence-based scoring and versioned approval/export using the code/tests. Record AI assistance honestly.
- Production deployment or merging to main requires separate explicit owner authorization. A push to the development branch does not authorize either.

## Milestone workflow

For each milestone: inspect current work → define a narrow boundary and checks → implement → review diff → run relevant checks → scan secrets → commit → push `origin/feat/career-passport-v2` without force → report SHA, actual push result, evidence and open work before beginning the next milestone.
