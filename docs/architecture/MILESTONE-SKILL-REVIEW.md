# Reviewable skill normalization

Subsequent behavior: the [coverage milestone](MILESTONE-COVERAGE.md) retains and locally reassesses job requirements on resume saves/skill refresh, superseding the analysis invalidation described below. The original verification remains a historical record.

Date: 2026-11-17. Development branch: `feat/career-passport-v2`. AI-assisted implementation; owner review and understanding remain part of maintaining this project.

## Problem and scope

`selectCanonicalSkills` previously returned only accepted canonical strings. A model selection of null silently removed an extracted skill. Even a successful mapping replaced the raw wording without user review. Embedding/Qdrant failures also failed the entire import after valid extraction. Existing/manual resumes had no way to review mappings without uploading again.

This milestone preserves raw names and separates suggestions from exportable skills. It reuses the existing Groq/FastEmbed/Qdrant batch pipeline and MongoDB records. It adds no production dependency or service. It does not implement a compatibility score, verified proficiency or semantic job matching.

## Acceptance criteria and implementation

| Criterion | Implementation and verification |
| --- | --- |
| No lost unresolved skills | Each extracted string has a snapshot entry, including null selections and empty search results. Uploaded resume skills start with the original strings. Unit and real HTTP/Mongo ingestion tests check this. |
| Explicit, persistent decisions | Keep original, use suggestion or custom wording changes a draft. A normal save writes decisions and skills atomically; reload/sign-in and job reopening retain choices. Real PDF generation/parsing verifies chosen text appears while replaced raw wording is excluded. |
| Server-owned provenance | Snapshot IDs, raw strings, suggestions and method come from the server. Save accepts changed decisions only and validates entry identity, unique IDs, offered choices, custom limits, unknown fields and chosen value in resume content. Forgery fixtures leave Mongo records unchanged. |
| Existing resumes and independent job copies | Explicit saved-name normalization sends only saved skill names, never the contact/experience fields, through this service. Copies inherit the snapshot and keep independent decisions. They do not synchronize with base edits. Old discarded raw names cannot be recovered automatically. |
| Recoverable dependency failure | After successful raw extraction, failed embedding/search/selection or malformed selection produces an unavailable snapshot with every raw skill. Missing optional configuration also preserves names for manual review. Extraction failure still aborts invalid imports. Tests double providers/native inference; no live accuracy claim is made. |
| Authentication and safe concurrent updates | Both endpoints derive owner from active session. Anonymous/foreign/foreign-parent operations fail before provider work. Shared per-account normalization admission returns 429 for overlapping base/copy requests. Revision checks and version plan counters reject stale results with 409. No upsert can recreate a deleted document. |
| Useful editor behavior | One skill per line preserves commas in names. Manual additions survive applying suggestions. Two aliases may share a name without restoring one alias removing the other's chosen name. Save/reload/discard preserve or clear decisions explicitly. Refresh is blocked by unsaved resume/plan edits; errors retain drafts. Review list is collapsible. Desktop/mobile browser checks cover these paths. |
| Bounded storage and inference | Up to 100 extracted or 150 saved skills, each at most 100 characters. Top-three candidates, one embedding pass/Qdrant batch and at most one selection call. Exact candidate names skip selection. Existing deadlines, embedding admission/cache and request rate limits remain. Snapshot size counts toward the 500 KiB job-version budget on create/save/review/plan/normalization mutations. |

## Contract and design

`ResumeContent.skills` remains ordinary user-editable text used by the PDF and literal/alias job comparison. A separate `skillNormalization` snapshot holds `schemaVersion`, `generatedAt`, `status` and entries `{id, raw, suggestion, method, choice, value}`. IDs are stable only within that snapshot. An exact candidate name is a naming suggestion, never proof of competence. Similarity scores are neither shown as confidence nor converted into an invented threshold.

POST `/:profileId/skills/normalize` and `/:profileId/versions/:versionId/skills/normalize` accept `{revision}` only and return the updated owner DTO. They preserve saved skills, replace the previous snapshot and advance the document revision. Job normalization invalidates old analysis; saved plans remain and their assessments may be stale. The UI confirms replacement when a snapshot exists. A snapshot with unavailable suggestions is a successful, explicit fallback, not an empty list or a claim that normalization worked.

PUT accepts optional `skillReviews`: changed decisions `{id, choice}` for original/suggested, or `{id, choice: "custom", value}`. Suggested values are looked up server-side. A later manual removal does not erase historical review metadata; the UI labels the choice as no longer listed. Refresh creates a new snapshot from current names and replaces those decisions. This is not immutable history or an approval audit log. Private raw names remain stored until profile/version/account deletion, and are excluded from PDFs.

## Verification

Local Windows/Node 24 checks use synthetic data, disposable MongoDB and service doubles. No production database, resume, paid model call or live Render/Vercel deployment was used.

- Backend unit/HTTP suite: **87 passed**.
- MongoDB/PDF integration suite: **44 passed**, including eight skill-review integration cases.
- Desktop/mobile Chromium suite: **28 passed**. The first new fixture intercepted a Vite source path containing `/api/`; restricting interception to actual API paths corrected the fixture. No failed test is counted as passing.
- Backend build and test typecheck; frontend build, test typecheck and lint with warnings denied: passed.
- Secret-pattern scan and changed-line whitespace checks: recorded with the commit workflow.
- Synthetic review-panel screenshots inspected at desktop/mobile sizes; browser checks assert no horizontal overflow.

The tests establish contracts, persistence, failure behavior and UI controls. Model/native/Qdrant calls are doubled; they do not establish real model quality, host memory safety or production latency. Existing CI repeats the complete suites without secrets after the push.

## Remaining work and interview discussion

Calibrate retrieval thresholds/margins on labeled examples; version the taxonomy and replace destructive seeding; record extraction source spans and provider usage/cost consistently; measure the real host's native inference budget. Job matching still uses literal/alias evidence in saved content. Editable requirements and a transparent coverage denominator are a separate future milestone. Keep one active backend process until shared account-deletion fencing and quotas exist.

For interviews, explain the distinction between extraction, retrieval, candidate selection and user approval. JSON mode alone does not validate meaning: the runtime contract constrains model output to offered candidates, and user review handles uncertain equivalence. Graceful degradation preserves useful data while clearly exposing unavailable suggestions. Ownership and compare-and-set predicates protect separate concerns: access control and lost-update prevention.
