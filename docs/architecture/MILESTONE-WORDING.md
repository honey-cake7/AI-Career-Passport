# Reviewable wording improvements

Date: 2026-11-18. Branch: `feat/career-passport-v2`. AI-assisted implementation extending the existing editor; no main merge or production deployment is included.

## Problem and scoped behavior

Job review previously offered complete-line ordering only. Users could edit manually, but could not request a proposed wording change against one job requirement. Unrestricted rewriting could invent technologies, metrics, responsibility or outcomes. A similarity score or a second uncalibrated model would not establish factuality.

This milestone adds conservative concision proposals for existing project/experience mentions. For example, “Utilized React in order to build 3 screens with a teammate” can become “Used React to build 3 screens with a teammate.” The model is not allowed to invent missing experience or freely paraphrase. Other lines, including qualifications and negation, are copied by the server. Missing/listed-only skills prompt the user for their own contribution, approach and supportable outcome; the existing plans support practice before making new claims.

Open a saved job version with reviewed requirements. Under **Make an existing example clearer**, choose a section/requirement, inspect the exact description to be sent, consent, then request wording. Compare original/proposed text and job quote. Edit or reject the proposal; factual confirmation is required before acceptance and resets after manual edits. Acceptance changes only the editor draft. **Save changes** persists the text and locally recalculates coverage; saved PDF preview/download uses it without another AI call. Base resumes and other job versions remain independent.

## Runtime contract and trust limits

POST `/api/profile/:profileId/versions/:versionId/wording` accepts only `{revision, reviewedAt, sourceId, requirementId, consent: true}`. Revision and analysis timestamp must match. Both resource owners are enforced before provider work. Source/quote come from Mongo, not client text. Recompute evidence; only an included skill with a positive work mention in that source qualifies. Summary, missing skills, claims without examples, uncertain/negated wording, excluded rows and descriptions over 4,000 characters fail before inference.

The provider receives the chosen description's lines and one term/source quote, with a 20-second timeout, no retries, JSON mode and at most 2,048 completion tokens. It does not receive contact fields, section title/company, full JD, other sections or full profile. The selected description or quote may itself contain private information: no automatic PII redaction or provider-side deletion guarantee is claimed. Per-request UI consent is required. Testing uses synthetic text and provider doubles, never real resume data or paid inference.

Strict output permits zero or one complete-line replacement. Unknown fields, invalid indices, multiple edits, multiline replacements, unchanged text, malformed/truncated JSON and unsupported wording are rejected. Compare ordered word tokens after a small explicit phrase-equivalence normalization and article removal. Preserve quantities, units and meaningful symbols separately. Unsupported/new factual words and removed factual words fail; original factual word order stays intact. Copy all surrounding lines rather than letting the model regenerate them. The allowlist is in `backend/src/services/wording.ts` and includes “utilized → used” and “in order to → to”; it is deliberately small, not semantic retrieval or a proficiency model.

These are conservative lexical checks, not a proof that source claims are true or that wording retains every implication. Punctuation, articles and context still need human judgment. No blanket fabrication-prevention rate is claimed. Arbitrary paraphrases are usually rejected. Manual edits remain user-authored claims and require review. A no-suggestion result is valid, and manual editing/export remains available during provider outages.

## Persistence, concurrency and operation

Proposals are read-only. There is no new Mongo field, collection, migration, production dependency or service. The response contains revision/review timestamp, generation time, related requirement, optional original/proposed/source/reason and provider token usage. It is not stored as approval history. Only accepted text saved through the existing resume PUT reaches persistence and PDF export. Rejecting/empty/invalid/failed requests leave the saved document untouched.

Use the existing owner-scoped AI limiter (10 requests per 15 minutes/account in the version router) and admission set shared with JD review. Concurrent paid work for that account returns 429. After inference, recheck the owner, version revision and review timestamp; late results after saves/deletion return 409. No upsert or late mutation occurs. Parent/child ownership stays mandatory. Failure paths release admission. Events log only duration, result count, token counts and safe failure code.

Pending proposals participate in unsaved-navigation protection. Busy requests lock resume inputs and competing review/plan actions. Rejection keeps unrelated resume drafts. Acceptance checks current source text/label again and refuses to overwrite a changed local section. Stale request recovery explicitly reloads the complete saved job version with confirmation before discarding drafts. Unmounted views ignore late UI responses; this is not provider cancellation. Quotas and admission remain per-process, so the documented single-active-backend restriction still applies.

## Acceptance and verification

- Unit/provider fixtures check accepted concision, copied context, invented technologies/metrics/ownership, dropped qualifiers/negation, altered units/currency/signs, reordered agency, unknown keys/indices, truncation, prompt-injected outputs, safe errors, bounded calls and minimized payloads.
- Real isolated MongoDB/session tests check anonymous/foreign parent/version access, strict consent/input, stale review/doc versions, read-only proposals, absent configuration, no-suggestion/failure recovery, competing requests, deletion during inference and actual per-account limits.
- A real PDF is generated/parsed before and after explicit acceptance/save, verifying saved content, retained qualification, no review metadata and base preservation. Local coverage remains unchanged by copy cleanup alone.
- Desktop/mobile Chromium checks consent and original comparison, busy-input locks, edit/confirmation reset, explicit accept/save/reopen/export, pending navigation, stale local-source protection, rejection preserving drafts, empty/invalid/stale results, explicit reload and real-evidence focus without a provider call. Screenshots are visually inspected; a complete accessibility audit remains open.

The first browser attempts exposed two fixture mistakes: a broad API mock intercepted a Vite source import, and the sign-in heading locator included nonexistent punctuation. The mock now filters `/api/` paths and waits for the actual labeled login screen. These failures are not counted as successful verification. Final counts/build/lint/typecheck/secret/whitespace and CI results are recorded with the milestone commit report.

Verified locally: **99 backend unit/HTTP tests, 60 MongoDB/PDF integration tests and 42 desktop/mobile browser tests passed (201 total)**. Backend/frontend builds and test typechecks passed; frontend lint passed with warnings denied. Provider/native inference is doubled; these checks do not establish live model usefulness or semantic factuality. Browser screenshots were inspected at desktop/mobile sizes. GitHub Actions repeats the checks after the development push; its actual result accompanies the commit report.

## Owner and interview notes

The distinction to explain is **proposing text versus approving facts**. JSON mode gives syntax; runtime validation narrows permitted changes; neither establishes truth. Exact source/quote provenance and owner/revision checks keep proposals grounded and prevent overwrites. User approval then changes a local draft; a separate save persists it, and export consumes only saved content. Missing facts are gathered from the user instead of manufactured by the model.

Open work: held-out quality/usefulness and rejection-rate evaluation, live provider behavior, broader language/wording support, actual-host budgets, full accessibility, immutable approval history, shared quotas and release hardening. General rewrites require a separately justified factuality design and evaluation. No overall engineering phase is declared complete.
