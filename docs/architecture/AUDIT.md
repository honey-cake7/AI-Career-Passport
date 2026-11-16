# AI Career Passport V2 technical audit

Date: 2026-11-16 (Asia/Calcutta). Baseline: `8e9b6fcb42cc8267865594f1913acd17bd1e8335`.
Branch: `feat/career-passport-v2`. This is a source and local verification audit, not a penetration test or an assessment of the live deployments.

## Assessment

The repository is a working prototype with useful extraction/export building blocks. At baseline it cannot safely separate users, and it does not provide a reliable review-to-export journey. Successful compilation is not proof that its AI or persistence works correctly. The first development milestone addresses access control and immediate privacy/correctness failures; no phase is declared complete by this audit.

Scores below describe the baseline, before the milestone. Scale: 0 absent; 2 prototype with serious gaps; 5 functional with material limitations; 8 production-oriented and verified; 10 exceptional evidence and operations. Scores are engineering judgments, not measured benchmarks.

| Area | /10 | Reason |
| --- | ---: | --- |
| Product usefulness | 4 | Resume extraction, matching suggestions and PDF generation exist, but corrections do not persist. |
| UI/UX | 3 | Responsive component classes exist; misleading verification/status labels, inaccessible inputs, excessive animation and nonfunctional theme selection reduce trust. No baseline browser accessibility audit performed. |
| Frontend architecture | 4 | Small component tree and API client, but split/mutated state, `any`, ignored types and persistent private browser data. |
| Backend architecture | 4 | Services separate concerns, but routes mix orchestration/persistence, import AI infrastructure eagerly and lack consistent boundary validation. |
| Database design | 4 | Typed subdocuments and unique user profile index, but incomplete writes, unowned legacy records, raw text retention and no versions. |
| Security and privacy | 1 | Private endpoints have no authentication or authorization; public links expose contact details by default. |
| AI reliability | 2 | JSON parsing without structural validation; unconstrained scoring/rewrites and no evidence or evaluations. |
| Performance | 3 | Batched concurrency exists, but inference grows with skill count and has no application-level budget or cache. No load benchmark run. |
| Testing | 0 | No checked-in automated tests or test scripts at baseline. |
| DevOps | 3 | Docker and Vercel config exist; mutable database images, broad exposed ports, no CI or reproducible production image. |
| Documentation | 2 | Startup guide exists but claims near-perfect extraction, optimized exports and production quality without evidence. |
| Maintainability | 4 | Compact TypeScript codebase, but missing contracts/tests and drift between model, UI and README. |

## Inspected scope and baseline checks

Read both manifests and lockfile metadata, all backend modules (entry points, routes, models, services, configuration and taxonomy seed), frontend components/types/API/entry points/styles, TypeScript/Vite/Tailwind configuration, Docker/Compose/ignore files, both READMEs and environment templates. The local `.env` was not printed or used to contact production services. Tracked-file inventory confirms it is untracked/ignored. Git began clean on the authorized branch with matching origin tracking at the baseline commit. Git Credential Manager is configured; `gh` is unavailable. A read-only remote check succeeded; write authentication is established only by an actual push.

Baseline checks passed: backend `npm run typecheck`, backend `npm run build`, frontend `npm run lint`, frontend `npm run build`. No baseline automated test suite existed. Docker CLI is installed, but the Docker Desktop Linux engine is unavailable. No live resumes, paid LLM requests, destructive taxonomy seeding, production database mutations or deployments were used for the audit.

## Actual baseline workflows

### Resume upload and profile display

1. `frontend/src/App.tsx` reads `passport_profile` from localStorage with unchecked JSON parsing. Otherwise it displays `ResumeUpload`.
2. `ResumeUpload.tsx:54–60` posts a PDF and hardcoded `507f1f77bcf86cd799439011` as `userId`. Every browser uses the same ID.
3. `backend/src/routes/profile.routes.ts:43–79` accepts that ID without authentication, checks only the declared MIME type and buffers up to 10 MB. `pdfParser.service.ts` extracts PDF text, without guaranteed cleanup on every exception.
4. `profileExtractor.service.ts` sends the entire text to Groq. It parses a JSON string using a TypeScript assertion; nested strings, arrays and object fields are not runtime validated.
5. `skillNormalizer.service.ts` sends the resume again for skill extraction. For each skill it embeds locally with FastEmbed BGE Small EN v1.5 (384 dimensions), queries Qdrant for three candidates, and usually asks Groq to select a name. Only similarity above 0.95 bypasses this call. Batches contain five skills, but there is no total skill/call budget, alias lookup or cache. A selected name is not checked against the offered candidates. Individual failures silently drop skills.
6. The upload route upserts by supplied user ID and stores raw text, personal info, experience, education and skills. It omits `projects` despite an extractor and Mongo schema supporting them. Its response omits projects as well.
7. `ProfileViewer.tsx` copies the profile into child state. Edits shallow-copy the root and mutate nested objects; there is no save API. App localStorage, the viewer, optimizer and MongoDB disagree about the current profile.

### Job matching and export

1. `OptimizerTerminal.tsx` posts a job description to `/:profileId/optimize`.
2. The route fetches `Profile.findById` without authentication or ownership checks. It passes saved experience, projects and skills to `profileOptimizer.service.ts`; frontend corrections are absent.
3. Groq supplies a 0–100 matchScore, missing skills, recommendations and rewritten bullets. JSON-object response mode ensures neither schema correctness nor truth. There are no explicit weights, evidence citations or calibrated uncertainty. The prompt asks for metric-driven rewrites without a prohibition on invented metrics.
4. The UI displays the score as compatibility. Rewrites remain suggestions; they are neither approved nor persisted, and the recommendations array is not fully represented in the UI.
5. PDF export performs another unauthenticated `findById`, renders the saved document with PDFKit and downloads it. It cannot include local corrections or proposed rewrites. Theme query parameters are ignored. PDF content/layout, unsafe URL schemes, Unicode and multi-page behavior have no baseline regression tests.
6. Public access is automatically enabled through a default nanoid slug. The public route returns personal info including email/phone/location, without consent, expiry, revocation or a field allowlist for contact data. It returns JSON, not a public frontend profile page.

## Findings

Baseline evidence references below use original paths and line numbers at the baseline commit; changed files may have different line numbers now. Verification columns describe the required proof, not a claim that every future fix is complete.

### F01 — Critical: no identity or ownership boundary

- **Evidence:** `backend/src/app.ts:24`; `backend/src/routes/profile.routes.ts:46–50,83–86,151,177`; `frontend/src/components/ResumeUpload.tsx:56`; `backend/src/models/User.ts` has a password field but no auth implementation.
- **Root cause:** a client-provided ID substitutes for authenticated identity; read operations query by ID alone.
- **Fix:** real accounts, hashed passwords, expiring/revocable opaque sessions; derive owner from session and include it in every private query. Never auto-claim legacy profiles using email or the shared demo ID.
- **Impact:** prevents cross-user overwrite, disclosure, export and AI-cost abuse via someone else's profile.
- **Verification:** anonymous/forged/expired/revoked tokens return 401; user B receives the same 404 for A's and missing records; no AI/export/delete effects occur. Verify owner successes and real MongoDB predicates.
- **Milestone:** implemented with automated verification; broader account recovery/deletion remains planned.

### F02 — High: automatic publication and excessive private data retention

- **Evidence:** `Profile.ts:134–142`; `profile.routes.ts:91,200–217`; `frontend/src/App.tsx:11–19`; `config/database.ts:19`; `profileExtractor.service.ts:109`; `skillNormalizer.service.ts:50,117,132,138`.
- **Root cause:** generated sharing slug is treated as consent; raw resumes/profile objects/model output and database URIs are retained or logged without a data policy.
- **Fix:** disable legacy publication; later add explicit allowlisted opt-in sharing with random revocable tokens. Keep session/profile state out of browser persistence, stop raw-text writes and sensitive logs, allow owner deletion. Define a separate reviewed legacy-data cleanup and backup-retention procedure.
- **Impact:** reduces accidental publication and secondary copies of personal data/credentials.
- **Verification:** public links return no data, response DTO excludes internal/raw fields, new uploads omit raw text, log review and deletion tests. Existing records/backups need an explicit cleanup decision; this milestone does not access them.
- **Milestone:** immediate exposure/retention/logging controls implemented; consent-based sharing and account-level deletion pending.

### F03 — High: model output crosses boundaries without validation

- **Evidence:** `profileExtractor.service.ts:92–106`; `profileOptimizer.service.ts:72–76`; `skillNormalizer.service.ts:43–48,100–105`.
- **Root cause:** valid JSON and TypeScript assertions are mistaken for validated data. The schema may cast values after inference, too late to make model output trustworthy.
- **Fix:** runtime schemas with field and array bounds, unknown-field policy, explicit nullable semantics, validated taxonomy membership and recoverable errors. Separate untrusted resume/JD content from instructions; require source evidence and user confirmation.
- **Impact:** prevents malformed profiles/UI crashes, false canonical skills and persistence corruption; makes failures actionable.
- **Verification:** malformed, nested, oversized, unknown-key, prompt-injection and unsupported-claim fixtures; no persistence when validation fails; recovery and user correction tests.
- **Milestone:** request/session/ID/file boundaries addressed; full AI output validation is phase 2 and remains incomplete.

### F04 — High: unsupported match scores and potentially fabricated rewrites

- **Evidence:** `profileOptimizer.service.ts:32–50,73`; `OptimizerTerminal.tsx:142–156,190–197`; README:30–33.
- **Root cause:** one prompt is responsible for extraction, scoring, reasoning and rewriting; no deterministic rubric or factual constraints.
- **Fix:** validated job requirements with evidence; deterministic documented coverage components, explicit unknowns; truthful rewrite proposals referencing original statements, never invented metrics; persist only after approval. Label current estimate honestly while replacing it.
- **Impact:** restores user trust and interview credibility; results become reproducible instead of purported hiring probabilities.
- **Verification:** fixed scoring fixtures with known outputs; evidence pointers; absent experience stays unknown; no new numbers/achievements; approve/reject workflow changes the exported version correctly.
- **Milestone:** current UI estimate labeled unvalidated; scoring and rewrite replacement pending phase 2.

### F05 — High: profile write/read/export mismatch

- **Evidence:** `profile.routes.ts:87–92,109–112` omit projects; `Profile.ts:126–129` and extractor define them; `ProfileViewer.tsx:11–24` never saves edits; `pdfGenerator.service.ts` reads saved profile only.
- **Root cause:** no shared API contract or verified review/persistence workflow.
- **Fix:** persist and return projects immediately; next add typed validated owner-only update API, one immutable frontend source of truth, version snapshots and export of a specified approved version.
- **Impact:** stops lost projects; the subsequent review milestone will make user corrections and exports agree.
- **Verification:** upload → Mongo → response → re-login → export fixtures include projects; edit/save/reload/export and ownership tests for future update endpoints.
- **Milestone:** project persistence/response corrected; preview edits remain explicitly unsaved until review workflow implementation.

### F06 — High: insufficient resource limits and file validation

- **Evidence:** `profile.routes.ts:13–25,146`; no rate limiter in `app.ts`; `pdfParser.service.ts:17–40`; unbounded normalization loop and no application-level AI budget.
- **Root cause:** only MIME and file-byte checks; no authenticated quotas, structured JD input or guaranteed parser cleanup.
- **Fix:** authenticate before buffering, cap files/fields/parts/bytes and extracted text/JD sizes, inspect PDF signature and parse content, add request/account limits and safe parser cleanup. Later isolate parsing with enforced page/time/memory limits, cap inference concurrency and model spend.
- **Impact:** limits trivial abuse and bad requests; full resilience still requires bounded expensive work.
- **Verification:** anonymous uploads do no work; spoofed MIME, additional ownership fields, oversized files/body and invalid JD types fail before model calls; limit/reset tests and parsing failure tests.
- **Milestone:** basic limits and signature checks implemented; parser sandbox/time/page limits and global AI budgets pending.

### F07 — Medium: normalization costs grow with skill count and silently lose skills

- **Evidence:** `skillNormalizer.service.ts:65–105,114–151`; `embedding.service.ts:37–43`; `vectorSearch.service.ts:21–29`.
- **Root cause:** skills re-extracted independently and embedded one at a time; semantic top score treated as truth; no margin/ambiguity policy or failure representation.
- **Fix:** versioned canonical taxonomy/aliases first, deduplication, batch embeddings/search, bounded cache, measured similarity and margin thresholds; preserve unresolved/ambiguous raw skills for review. Avoid one LLM call per skill.
- **Impact:** predictable cost/latency and no false certainty or invisible loss.
- **Verification:** alias/ambiguous/out-of-taxonomy fixtures, provider-call counters, cache hit/miss/expiry tests and measured latency on a fixed corpus. Do not invent savings percentages.
- **Milestone:** planned phase 2.

### F08 — Medium: misleading UI and broken editing architecture

- **Evidence:** `ProfileViewer.tsx:86` decides verification by string length; `Navbar.tsx:29` always says System Online; `ExportControls.tsx:12,23,36–38` selects ignored themes; unlabeled inline inputs and click-only expandable rows.
- **Root cause:** demonstration affordances became product claims; preview state was never connected to persistence.
- **Fix:** remove unsupported indicators/controls; show actual processing states, explicit save/review status, accessible labels and keyboard interactions; consolidate profile state and design tokens.
- **Impact:** clear expectations and usable mobile/keyboard workflows.
- **Verification:** browser journey, keyboard audit, accessible names, responsive screenshots at 360/768/1440px; all controls have verified effects.
- **Milestone:** fake themes/public-share control removed and export limitation disclosed; comprehensive UX work pending phase 3.

### F09 — High: no repeatable behavior verification or CI

- **Evidence:** both baseline `package.json` scripts; no test directory or `.github/workflows`.
- **Root cause:** build checks substituted for user/security behavior checks.
- **Fix:** focused authorization, auth lifecycle, ingestion/persistence and AI evaluation fixtures; isolated databases; then browser journeys and CI without production secrets.
- **Impact:** makes access control and correctness regressions detectable.
- **Verification:** reproducible commands and actual results; forbidden operations have no side effects. Keep repository-double and database-integration evidence distinct.
- **Milestone:** security regression and disposable-database tests added; full CI/evaluations remain planned.

### F10 — Medium: deployment configuration is development-oriented

- **Evidence:** Dockerfile `RUN npm install`, root process and development dependencies; Compose `mongo:latest`, `qdrant:latest`, publicly bound database ports and development NODE_ENV; no readiness checks. `server.ts` validates neither port nor production environment.
- **Root cause:** deployment examples mirror local experimentation.
- **Fix:** lockfile-driven multi-stage non-root build, pinned supported images, private DB networking, validated configuration, health/readiness, secret injection and backup/restore exercises. Choose tested proxy trust before deployment; do not blindly trust forwarded IP headers.
- **Impact:** reproducible builds and narrower network exposure.
- **Verification:** clean image build, compose config, readiness/dependency failure tests, container user/network checks and documented restore rehearsal.
- **Milestone:** not deployed or claimed complete; phase 5.

### F11 — Medium: configuration and documentation drift

- **Evidence:** `.env.example` omits QDRANT_API_KEY/FRONTEND_URL; README uses placeholder clone URL and asserts enterprise-grade/near-perfect extraction; frontend README is Vite boilerplate; Groq key is read during eager import; frontend tsconfig lacks strict mode.
- **Root cause:** docs track aspirations and templates instead of verified behavior; environment parsing is scattered.
- **Fix:** honest feature/status matrix, accurate setup/API/security limitations and branch workflow, central validated config, strict frontend types and checked environment examples.
- **Impact:** maintainers can reproduce behavior and explain actual tradeoffs.
- **Verification:** follow fresh setup with examples; missing/invalid configuration fails predictably; CI runs documented commands.
- **Milestone:** README, environment examples and architecture docs corrected; complete strictness/config overhaul planned.

### F12 — Medium: taxonomy seeding is destructive

- **Evidence:** `src/scripts/seedSkillTaxonomy.ts:126–143` deletes an existing Qdrant collection and catches all inspection/deletion errors.
- **Root cause:** a demo reset script is used as a migration mechanism.
- **Fix:** versioned collection, non-destructive idempotent upsert and explicit alias cutover/rollback. Never run against production during an audit.
- **Impact:** avoids accidental collection loss and makes normalization reproducible.
- **Verification:** repeated seed is idempotent, failure preserves the previous collection, version/dimension/model metadata agree.
- **Milestone:** documented danger; implementation planned phase 2/5. Seed was not executed.

### F13 — High: installed runtime dependencies have published advisories

- **Evidence:** local `npm audit --omit=dev` before remediation reported eight backend vulnerable packages (three critical, four high, one moderate) and two high frontend packages. Original lockfiles resolve Mongoose 9.7.x, Multer 2.2.0, FastEmbed 2.1.0, Axios 1.18.x and vulnerable transitive request/archive dependencies.
- **Root cause:** lockfiles had not been refreshed for security fixes; there was no automated dependency check/triage.
- **Fix:** apply compatible updates within existing semver ranges; raise direct dependency minimums for patched security boundaries; review lockfile changes and rerun application tests. Do not force major upgrades automatically.
- **Impact:** removes reported vulnerable dependency versions. Audit severity is package-level evidence, not proof that every advisory is exploitable through this application's routes. For example, proxy trust is disabled and some Axios advisories concern Node adapters rather than this browser client; Multer/body parsing are directly exposed request boundaries.
- **Verification:** repeat audits against updated lockfiles; type/build/security/persistence checks. Live embedding/provider compatibility remains a separate test because those integrations are not invoked by the offline suites.
- **Milestone:** compatible remediation included; exact final audit/check results are recorded in `MILESTONE-1.md`.

## Highest priorities

1. F01: establish account identity and enforce ownership on every private operation.
2. F02: stop unconsented public disclosure and unnecessary private-data copies.
3. F03/F04: validate AI boundaries and replace unsupported scoring/factual rewrites.
4. F05: preserve projects and implement persistent review-to-export correctness.
5. F06/F09: bound expensive work and prove security/correctness with repeatable tests.

## Release limitations

This branch is development work. Authentication controls do not make the whole product production-ready. Full AI validation/evaluation, persistent review/versioning, email verification/recovery, account deletion, consent-based sharing, distributed quotas, parser resource isolation, deployment hardening and CI remain outstanding. See [ROADMAP.md](ROADMAP.md) for phase gates and [DECISIONS.md](DECISIONS.md) for the chosen boundaries.
