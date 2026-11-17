# M3 — One-job review and tailored resume versions

Date: 2026-11-17. Development branch only. AI-assisted implementation authorized by the owner after the persisted editor milestone.

## Result and use

The base editor lacked job context and could not create a tailored copy. The legacy score could not explain a defensible calculation. The new **Tailor for a job** workspace lets a user name a version, paste a job description, and copy the saved base without changing it. Choose **Review this job** to extract requirements and inspect their exact JD quotes. Each requirement displays work-description mentions, listed claims without examples, missing mentions, or inability to assess. No numerical match/hiring score is shown.

Requirements show conditional next actions: add a real contribution example if experience exists, otherwise complete/test/document a small project task before claiming the skill. Missing text does not establish absent competence. Eligibility, duration, ambiguous alternatives and negation need human review. These are initial suggestions, not a personalized learning curriculum or proof of readiness.

Relevant existing lines can be brought first. Review the original, proposal, source and reason; accept into the draft, edit the wording, or reject. The generated suggestion preserves all original lines and introduces no achievements/metrics/technologies. It is deliberately narrower than free-form AI writing. Accepting focuses the affected field and leaves the document unsaved for review. Save explicitly, then preview/download the saved job-version PDF. Reopen/delete versions independently. Base deletion deletes its embedded versions too, with explicit UI confirmation.

## Architecture and correctness

- Reuses React/Express/Mongo/Groq and the current PDF renderer. No new service, framework, production dependency or embedding inference for job review.
- Up to 20 embedded owner-only job copies. Atomic owner/base-revision/capacity checks on creation; ID/revision `$elemMatch` on updates; a 500 KiB JSON budget for each content/JD/review payload leaves BSON/document headroom. Legacy profiles without versions/revision require no bulk migration.
- Only JD text is sent to the provider for job review. Resume comparison and suggestion generation run locally. Contact data is excluded from the provider request by design; upload/extraction still has its separately disclosed resume-processing behavior.
- One provider request, 25-second timeout, no automatic retries, account rate/admission limits and saved-revision caching. Token usage is recorded; currency costs are not guessed. Errors/logs exclude private text/provider payloads.
- Strict runtime validation, verifiable source quotes, bounded output, explicit uncertainty and conservative matching. Saving clears old analysis. Results from an in-flight review cannot attach after version edit/deletion. Provider/validation/size failures leave no partial review or resume overwrite.
- Version export requires its current saved revision. Preview and download share a private object URL; browser session expiry/unmount clears visible private state and revokes URLs.

See ADR-009 in [DECISIONS.md](DECISIONS.md) for tradeoffs.

## Verified checks

On Windows, Node **24.18.0**:

| Check | Actual result |
| --- | --- |
| `backend: npm test` | 53 passed; security, extraction/normalization regressions, PDF, quote/schema validation, four evidence states, exact/alias boundaries, alternatives/negation, no added factual lines, provider privacy, usage, truncation and safe error categories including the actual SDK timeout class. |
| `backend: npm run test:integration` | 19 passed using disposable MongoDB, real HTTP/auth and real PDF generation/parsing. Covers version/base isolation, owner/foreign/anonymous operations, stale concurrent saves, cached review, in-flight review/update conflict, recovery after invalid/oversized output, concurrent 20-version limit, legacy documents and deletion. Also checks that missing AI configuration returns a safe error while editing continues. Provider work is injected or prevented. |
| `backend: npm run build`, `npm run typecheck:tests` | Passed. |
| `frontend: npm run lint`, `npm run build`, `npm run typecheck:tests` | Passed, including static checking of browser tests/config. |
| `frontend: npm run test:e2e` | 10 passed on desktop/mobile Chromium. New job tests cover creation/review, all statuses/quotes/gap actions, reject/reconsider/edit/accept, save/export/download, reopen, base preservation, deletion, failed-review retry, and stale-proposal protection. APIs are synthetic. |
| Visual review | Inspected desktop/mobile screenshots of the real rendered UI. No horizontal overflow in the browser cases. Mobile places job review before document fields. |

The browser and database tests are complementary; they are not claimed as a single live-provider/browser/database production test. Tests never connect to production databases or send real resumes. The normal suites replace provider calls and override credentials through the existing test setup.

One optional **live synthetic smoke check** succeeded using `openai/gpt-oss-120b`: 4 verified-source requirements, statuses `work_mention`, `claim_only`, `unassessed`, `unassessed`; 1 line-order suggestion; **322 input / 209 output tokens**, provider operation **836 ms**. Only the synthetic JD was sent. This is one connectivity/contract example, not a latency benchmark or accuracy evaluation. Reproduce explicitly with `node --import tsx test/manual/review-job.ts --live` from backend; it consumes provider quota.

Diff/secret scans and commit/push results are reported with delivery. No `.env` or candidate data is included in the commit.

An additional fresh-process app-import check with `GROQ_API_KEY` removed succeeded; the new routes do not eagerly initialize AI services, preserving the manual editor's independence from AI configuration.

## Limitations and next work

- Quoted model output can still omit or misinterpret requirements. The alias list is small and not a calibrated semantic matching system. Conservative negation/alternative rules can produce false negatives. Inspect the quoted context; no hiring probability or objective proficiency claim is made.
- Generated edits reorder existing lines only. Free-form AI rewrites, immutable revision history, persisted approval audit trails, renamed/replaced JDs, version comparisons and personalized tracked gap plans are not implemented here.
- Gap recommendations are conditional prompts, not real-user-validated plans. M4 needs user-confirmed gaps, scoped exercises with completion criteria, evidence updates and user research.
- The legacy `/optimize` API remains for compatibility; the new UI does not call its unchecked score/rewrite contract. Retiring it is release work.
- Per-process limits/cache/admission are not distributed. No new measurement was made on the actual 512 MB host. Parsing/inference admission, recovery/deletion policies, accessibility audits, email recovery and deployment hardening remain release gates from the engineering roadmap.
- One-hour memory-only sessions and unsaved-draft limitations remain. A development push is neither a merge to main nor a production deployment.

## Owner interview notes

Explain why an exact quote is provenance rather than proof of a correct interpretation; why “not found” is not “cannot do”; why deterministic line reordering has a stronger factual guarantee than unconstrained rewriting; and why an atomic Mongo `$elemMatch`/revision check prevents writing to the wrong or stale version. Embedding bounded versions in the parent makes deletion atomic on local MongoDB without transactions. Describe the work and tests as AI-assisted, with the limitations above.
