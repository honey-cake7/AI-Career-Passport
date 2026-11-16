# M2 — Persisted resume editor

Date: 2026-11-17. Branch: `feat/career-passport-v2`. AI-assisted implementation following the owner's editor-first approval. No production deployment or main-branch merge is included.

## Problem and result

The old preview edited isolated component state, while export and optimization read the originally uploaded database profile. It also displayed fake skill verification based on string length. The new workspace supports manual creation or import, correction of every resume section, explicit save, reload and saved-revision PDF preview/download. The fake verification, decorative dashboard and unvalidated-score UI components were removed, along with their unused animation/icon/utility dependencies.

The save API validates field names/types, text/count bounds, email and safe credential-free HTTP(S) links. Ownership is part of database queries. Revisions are compared and incremented atomically; simultaneous saves with the same revision produce one success and one conflict. An error preserves the draft; conflict resolution requires explicit reload/discard. Import cannot overwrite an existing resume, including a race against manual creation. PDF preview and download share one authenticated, revision-checked file. Existing profiles missing revision are handled as revision zero without bulk migration. Saving strips legacy retained raw resume text.

Manual creation/edit/save/export only require the backend and MongoDB. They do not load Groq, Qdrant or FastEmbed. Existing production normalization fixes from main `fc2ce5c` were selectively brought into development (embedding cache/deduplication, batching, stage deadlines, cancellation signals and constrained canonical selection), without importing main's unauthenticated routes. These are regression-tested with service doubles; performance on the 512 MB Render instance is not newly measured here.

PDF export embeds licensed Noto Sans fonts, preserves common accented names/bullets and stops inventing `Present` for omitted end dates. The source PDF layout is not retained. A synthetic single-page PDF was rendered with PDFium and visually inspected. Desktop/mobile editor screenshots were also inspected. Screenshot and generated PDF outputs remain ignored synthetic test artifacts.

## Verification

Baseline before implementation: 16 backend tests and frontend production build passed. Backend dependencies were restored from the development lockfile with `npm ci`; the initial test typecheck correctly found the missing disposable-Mongo test dependency in the prior installation. No production credentials/data or paid model calls were used.

Final checks passed: **44 backend tests, 10 isolated Mongo/PDF integration tests, 6 desktop/mobile browser tests**, backend build and test typecheck, and frontend lint/build. Dependency installs reported zero advisories. The working-tree diff and secret pattern scan are also reviewed before commit. Commands:

```text
backend: npm test
backend: npm run test:integration
backend: npm run typecheck:tests
backend: npm run build
frontend: npm run lint
frontend: npm run build
frontend: npm run test:e2e
root: node scripts/check-secrets.mjs
```

The Mongo suite uses a disposable MongoDB process, real HTTP/auth/indexes/updates and real PDF parsing/generation. It verifies owner-only creation/update, duplicate prevention, invalid-input rejection, legacy revision upgrade, raw-text removal, concurrent saves and corrected export content. AI operations are injected synthetic services. The browser suite uses the real React UI with synthetic API responses; it checks creation, save, relogin/reload, error retention, explicit conflict resolution, discard, delete, disabled dirty export and preview/download URL identity on desktop/mobile Chromium. This does not claim live provider accuracy or actual-host resource verification.

## Open work and release gates

- M3: job-specific versions, grounded requirements/evidence, reviewed suggestions and accept/edit/reject. Base preservation and stale-analysis tests must precede reintroducing job review in the UI.
- M4: useful gap actions with explicit unknowns and user-confirmed missing experience; validate with real users.
- The legacy optimizer API still exists and is not trustworthy enough for the new workflow. Its unchecked score and rewrite contract must be replaced before use in M3.
- Import still depends on Groq/model/taxonomy availability; structural validation does not establish factual accuracy. Manual entry is available when import fails. Source provenance and bounded recovery remain future work.
- Email verification/recovery, account-wide deletion, per-host parser/inference admission limits, distributed quotas, deployment/session hardening and complete accessibility/AI evaluations remain release gates.
- One-hour memory-only sessions require login on refresh. Expiry discards unsaved edits for privacy. Conflict recovery offers explicit reload, not automatic merge. Resume version history is not yet implemented.
- Bundled fonts cover common Latin/Greek/Cyrillic text, not every writing system. Advanced pagination, all-script rendering and large-document resource budgets are not established by the single-page visual fixture.

## Maintenance and interview notes

Authentication identifies the owner; authorization constrains the query. A Mongoose schema does not replace runtime HTTP validation. The revision comparison must be in the atomic update, rather than a separate read/check/write. A preview is trustworthy only when it uses the same saved content/file as download. Model output validation establishes shape and bounds, not truth. The owner should describe this as AI-assisted engineering and explain these tradeoffs using the tests.

## Delivery

Commit and push outcome are reported to the owner after verification. A development-branch push does not publish this version to the main-connected Vercel/Render services.
