# M4 — Saved next steps and honest evidence reassessment

Date: 2026-11-17. AI-assisted implementation on `feat/career-passport-v2`, following the owner's approval of the next-step workflow. No main-branch merge or production deployment.

## Problem and result

M3 explained missing resume mentions but its next steps could not be saved, adapted or followed through. The new workflow asks what is true for the candidate: relevant experience already exists, practice is needed, or the requirement needs checking. It saves one focused task with editable completion criteria, status, outcome notes and an optional evidence URL in the selected job version.

Completing a task is explicitly self-reported. It cannot change resume text, add a skill or establish proficiency. A user must write their real contribution in the resume, save it, then choose local reassessment. The result shows what the saved resume mentions and which revision was checked, while preserving the separate task status. Context such as duration or eligibility remains unassessed and receives a manual-check task rather than a coding exercise.

## Use and acceptance criteria

1. Open a saved job version and choose **Review this job** if needed. Expand **Choose a next step** (or **Prepare an example**) under a requirement.
2. Choose the confirmation that fits and **Save a focused plan**. Context requirements offer manual checking only. A duplicate requirement opens its existing plan.
3. In **Your next steps**, adapt the task and 1–5 criteria to your actual project. Save progress and outcome notes. Completion requires every criterion checked and an outcome description. Save a URL only if useful; the app does not fetch or verify it.
4. Choose **Edit resume evidence** to focus the project editor, describe only real work, and save. Saved plans survive the resulting invalidation of the AI review. Choose **Reassess saved resume** to compare the original requirement without an AI call.
5. Reopen the version to recover saved tasks/notes. Conflict errors preserve unsaved text; **Reload saved plans** explicitly confirms discarding it. Deleting a plan keeps the resume. Deleting the version/base removes its embedded plans.

Technical acceptance criteria: owner-only routes, strict mutation schemas, bounded count/content/URLs, current-review creation, immutable requirement identity, atomic concurrent-write rejection, plan/resume draft separation, explicit completion and local reassessment semantics. See ADR-010 for storage/concurrency decisions.

## Verification

Windows with Node 24.18.0; synthetic data only:

| Check | Result |
| --- | --- |
| Backend `npm test` | 60 passed. Adds plan templates, requirement identity, manual-only context handling, strict types/unknown fields, unsafe URLs, completion preconditions, unchanged provenance/assessment, local matching and combined storage budget checks. |
| Backend `npm run test:integration` | 27 passed against disposable MongoDB with real sessions/HTTP/PDF. Adds anonymous/foreign-owner/foreign-version denials, current-review and legacy-counter behavior, invalid writes without partial changes, concurrent plan edits, stale resume counters, independent task/assessment status, in-flight review conflicts, capacity limits and parent deletion. Provider calls are synthetic. |
| Backend build and test typecheck | Passed. |
| Frontend lint, build and test typecheck | Passed. |
| Frontend `npm run test:e2e` | 16 passed on desktop/mobile Chromium. Covers task creation, completion rejection/recovery, saved outcomes/URL, reopen, unchanged resume/base, evidence editing, save/reassess without another review call, stale-note preservation, reload/navigation confirmation, independent drafts, deletion, and resume discard/save behavior. API responses are synthetic. |
| Visual inspection | Inspected rendered desktop/mobile plan screenshots; labels, checkboxes, wrapping and action buttons are readable. Browser checks assert no horizontal overflow in the workflow. Full accessibility audit is still open. |

No paid model request, real candidate upload or production database access was needed. Browser mocks verify UI behavior; separate real database tests verify persistence/ownership. They are not claimed as one live production end-to-end test. Diff/secret checks and actual commit/push results accompany delivery.

## Scope and open work

- Up to 20 plans per version and 20 versions per profile; the combined per-version content/JD/review/plan JSON budget is 500 KiB. Version counts cannot grow indefinitely.
- Practice templates are useful starting points for a scoped project change, not personalized curricula. The user's project context and corrections matter. No external courses, paid resources, GitHub integration or additional database/API was added.
- Matching retains M3's small alias list and conservative unknown handling. A mention does not prove depth, a missing mention does not establish inability, and a completion checkbox does not verify an outcome. Quotes may be incomplete or misinterpreted by extraction.
- Saved notes and links are private to the owner/version and excluded from PDFs/provider calls. Deletion does not promise removal from external sites, provider history or backups. Existing account recovery/deletion, parser isolation, host memory, shared quotas and deployment gates remain open.
- Unsaved drafts remain in browser memory. Confirmation protects normal navigation, not forced tab termination or session expiry.
- **Real-user pilot has not been performed**, so the full M4 milestone is not marked complete. Ask 3–5 target developers to bring a resume and a real role, choose one next step, explain why it fits, and return with an outcome. Observe confusion, task feasibility, whether they add truthful evidence, and whether reassessment helps. Record consent and actual results; do not infer demand from passing tests.

## Owner interview notes

Explain the difference between a resume claim, a work-description mention and independently verified competence. Explain why a task's completion and a resume's evidence have independent state. The separate counter protects private notes without turning every task edit into a new resume revision; `$elemMatch` binds the correct owned version, and snapshot checks prevent stale writes or storage-budget races. Embedded bounded plans make deletion atomic on standalone MongoDB. Describe the implementation as AI-assisted, with offline and live checks distinguished honestly.
