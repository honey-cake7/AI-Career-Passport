# Editable requirements and resume coverage

Date: 2026-11-17. Branch: `feat/career-passport-v2`. AI-assisted implementation, with reproducible synthetic checks. This is a scoped development milestone, not completion of the overall release gates.

## What changed

Previously, requirements could not be corrected, and every resume save discarded the review. A user had to repeat AI extraction, potentially receiving different requirements for the same job. There was no numeric breakdown with a defensible denominator.

Job versions now retain requirements across resume edits. Users can correct labels, source quotes, exact skill names, type and priority; explicitly exclude irrelevant rows; and add missing requirements. A manual initial set works without Groq/Qdrant/FastEmbed configuration. Requirements must cite exact text from the saved JD, and named skills must occur as complete names in their quotes. Qualified/alternative requirements remain context/manual checks. Original model definitions are retained when corrected. Existing rows stay visible when excluded; new IDs and provenance come from the server.

Saving requirements or resume content rebuilds evidence, safe line-order suggestions and coverage locally. Refreshing skill-name suggestions also retains these requirements. No new provider call is made for those comparisons. PDF export still uses only the saved resume, with no job requirements, scores, plans or private review metadata added. Base resumes and other job copies remain independent.

## Scoring contract

Coverage version 1 reports **required**, **preferred** and **unspecified** separately. Each distinct assessable skill has equal weight within its priority. There is no combined weighted hiring/readiness score.

| Category | In denominator? | In numerator? |
| --- | --- | --- |
| Mention in a project/experience description | Yes | Yes |
| Listed only in skills, project technologies or summary | Yes | No |
| No mention found | Yes | No |
| Context, qualifications or uncertain work wording | No; counted visibly as unassessed | No |
| Explicitly excluded row | No; retained visibly | No |
| Repeated known alias | Counted once under strongest included priority | Counted once |

`workPercent = round(100 × workMentions / assessed)`; an empty denominator returns JSON `null` and displays **Not available**. Example: three work mentions, one listed-only claim and one missing mention among five required skills gives 60%. Additional unknown conditions remain visible outside that denominator. Known aliases use the existing explicit alias list; strongest priority is required → preferred → unspecified. Every duplicate row points to the counted row in the server response.

The percentage describes the selected requirement set and saved wording. It cannot establish complete extraction, proficiency, truth of a claim, ATS certification, eligibility or hiring probability. Users can change the denominator by correcting/excluding requirements; source quotes, excluded counts and original definitions remain visible. Arbitrary embedding thresholds or LLM-generated percentages are not used.

## API, storage and concurrency

PUT `/api/profile/:profileId/versions/:versionId/requirements` accepts `{revision, reviewedAt, requirements}`. `reviewedAt` must equal the saved analysis timestamp, or be null for a manual first review. Rows accept `{id?, label, quote, kind, term, priority, excluded?}` only. At most 30 rows are allowed. Every existing row must appear once; clients cannot inject IDs for new rows, evidence, source provenance, scores or coverage. The endpoint returns the full updated version.

The existing embedded `analysis` document holds validated definitions, original extraction metadata, current evidence and derived coverage. Older v1 analyses receive coverage on reads; no bulk migration, collection, framework, production dependency or new service is required. Original AI usage describes the extraction and is preserved during local recalculation. This is a current editable set with first-source provenance, not immutable edit history.

Requirement changes advance the document revision. Content/normalization/review/requirement writes guard document revision, plan counter and analysis timestamp or missing state. This prevents late AI work from overwriting a manual set and prevents competing metadata writes bypassing the combined 500 KiB version budget. Anonymous/foreign resources remain 401/404 before work. Stale saves return 409 without replacing saved data.

Plans keep their original requirement and previous assessment. New plans cannot target excluded or duplicate rows. Their assessments may become stale after a requirement or resume revision and must be reassessed explicitly. Draft requirements and plan edits participate in navigation protection. Busy requests block competing editor work; validation/stale errors retain input. Explicit reload refreshes the complete saved editor, including when only review/plan metadata changed at the same resume revision.

## Acceptance and verification

- Source-grounded manual and corrected requirements persist, with original model provenance preserved and server-calculated coverage only.
- Alias deduplication, separate claims, missing mentions, uncertain/context exclusions, priority handling, rounding and zero denominators have deterministic fixtures.
- Resume corrections recalculate against retained requirements without another provider call, and real PDF generation/parsing verifies only saved content is exported.
- Authentication, parent/version ownership, client-forged scores/evidence/provenance, stale review/document snapshots, competing writes and late AI results are checked with real isolated MongoDB.
- Desktop/mobile Chromium covers correcting/adding/excluding, saving/reopening, local recalculation, manual context, dirty navigation, validation/stale recovery and explicit reload. Source controls have accessible labels; browser checks assert no horizontal overflow. A full accessibility audit remains open.

Local verification uses synthetic data and disposable MongoDB. Provider/native services are doubled; no production record, paid inference or live deployment was used. Run backend `npm test`, `npm run test:integration`, build and test typecheck; frontend lint with warnings denied, build, test typecheck and Playwright. Final counts, secret/whitespace checks and CI result are recorded with the commit report. The first new browser run used an exact label-text locator that included select options; selecting by combobox role corrected the test locator. Failed runs are not counted as successful verification.

Verified locally: **93 backend unit/HTTP tests, 52 MongoDB/PDF integration tests and 34 browser tests passed (179 total)**. Backend build/test typecheck and frontend build/test typecheck/lint passed. Desktop/mobile coverage screenshots were inspected. The secret-pattern scan passed for 131 tracked/intended files; changed-line whitespace was checked before committing. GitHub Actions repeats these checks after the development push.

CI follow-up, 2026-11-18: run `44141191285` passed source/backend checks and 33 browser cases, but the mobile skill-review sign-out/sign-in case failed on both attempts. Its trace showed the login email was empty: the test filled the resume editor's identically labeled Email field while logout was still in flight. The helper now waits for the Welcome back heading, verifies the signed-in editor has loaded, and explicitly opens the skill review after re-login. Persistence assertions remain intact; no timeout increase or retry relaxation is used. Follow-up local checks passed: all 34 browser cases, frontend test typecheck/lint, secret-pattern scan and whitespace checks.

## Owner notes and limits

Explain three boundaries in interviews: AI extracts a proposed requirement set; runtime validation links fields to source quotes; deterministic comparison counts saved text, with user correction where interpretation is wrong. Coverage remains sensitive to extraction omissions, alias coverage and wording. Keeping the requirements fixed across edits makes progress comparisons more reproducible and avoids repeated provider cost. Original provenance and explicit exclusion make denominator changes inspectable.

Still open: held-out extraction/semantic evaluation, calibrated retrieval thresholds, broader negation/context handling, extraction source spans, actual-host resource budgets, immutable history, full accessibility checks and production release hardening. The existing one-active-backend-process restriction for account-deletion fencing remains. Main merges and production deployment require separate authorization.
