# M5A — Retire unchecked optimization and establish development CI

Date: 2026-11-17. AI-assisted work on `feat/career-passport-v2`. This is the first bounded release-hardening milestone, not completion of M5 or authorization to merge/deploy.

## Problem, change and acceptance

The existing UI used validated job-version review, but the old owner-only `/optimize` endpoint could still send candidate content to an unchecked model prompt and return an invented score or rewritten achievement. Remove that service and dependency. Keep an owner-scoped 410 `endpoint_retired` response so existing clients get an actionable migration message. Authentication/authorization still precede it; no foreign-profile disclosure, model call, write or scoring result is permitted. Manual editing, saved plans, review and PDF export retain their current contracts.

Checks previously relied on the developer running them locally. Add `.github/workflows/checks.yml` with these acceptance criteria:

- Trigger on pushes to `feat/career-passport-v2` and pull requests targeting main/development. Run no deploy, merge, write-token or application-secret step.
- Check current tracked files for known credential patterns and the pushed/PR change range for whitespace errors. The source job fetches history to resolve its comparison base; it does not run a secret scan over history. On initial branch creation, compare the tip to its parent. This does not detect every possible credential.
- Install from each committed lockfile with `npm ci`; use Node 24.18.0 from `.node-version` and Ubuntu 24.04. Integration tests explicitly use MongoDB 8.2.6, matching the installed library's current default, with generated local URIs only.
- Build/typecheck backend and test code; run deterministic security/AI contract tests plus real disposable Mongo/PDF tests. No live Groq/Qdrant/inference service is required. Package, browser/native-library and Mongo binary downloads still require network access; model inference is not performed.
- Run frontend lint with warnings treated as errors, types, build, and desktop/mobile Chromium workflows. In CI, two workers and an eight-minute browser limit bound execution; focused tests and flaky retries fail the run.
- Pin checkout/setup-node/upload-artifact to verified GitHub-owned release commit SHAs. Use read-only repository contents permission, no retained checkout credential and no production secrets. Preserve only synthetic reports/traces for seven days. Cancel superseded runs; backend/frontend jobs have 15-minute bounds.
- Review the actual hosted run after pushing. Local passing tests alone do not establish that GitHub runner setup or clean Linux installs work.

## Verification and limits

Local Windows/Node 24.18.0 evidence:

| Check | Actual result |
| --- | --- |
| Backend `npm test` | 61 passed. Retirement tests cover varied bodies, exact safe response, no output score/rewrite, no writes, and unchanged profiles. Existing unauthorized/foreign-resource tests remain. |
| Backend `npm run test:integration` | 28 passed using real sessions, HTTP and disposable MongoDB/PDF. Owned retirement works with no AI key and preserves stored data; foreign retirement requests remain 404. Existing version/plan/export regressions pass. |
| Backend build and test typecheck | Passed. |
| Frontend lint with `--deny-warnings`, build and test typecheck | Passed. |
| Frontend `CI=true npm run test:e2e` | 16 passed with no retries required; synthetic APIs, desktop/mobile Chromium. CI-mode reporter, worker limit and flaky-test policy are exercised. |
| Hosted GitHub Actions | Result and run URL are reported with delivery after pushing. Inspect the run for the exact commit; no hosted success is inferred from local results. |

The workflow intentionally receives no app secrets, including on trusted pushes. The test preload overwrites provider/database configuration as a second boundary. Browser requests are intercepted with synthetic fixtures; this is separate from real backend integration coverage, not a complete live provider/browser/database test.

The initial hosted run passed clean installs, backend contracts/persistence and frontend static checks, but exposed a source-check configuration error: a depth-one checkout made Git treat the tip as a root commit and report pre-existing whitespace in unrelated files. The source job now fetches history and compares the actual pushed/PR range. The check remains enabled; no unrelated source files were reformatted to hide the configuration problem.

The owner can find the run under **GitHub → Actions → Development checks**. Expected jobs: **Source safety**, **Backend contracts and persistence**, **Frontend and browser workflows**. On failure, inspect the first failing step and reproduce its command in the relevant package. Download `browser-results` for traces/reports; they contain synthetic fixtures only. Fix and push normally; do not bypass checks or deploy a failing revision. Package/browser/Mongo download failures are infrastructure failures, not evidence that application tests passed. Do not add production credentials to make synthetic tests run.

Branch protection/required checks are not changed by a workflow file. After checks have run and the owner decides to protect main, require these check names in repository rules. Actions may require owner enablement or available runner quota. A disabled/billing-blocked run must be reported as unverified, not green. No production merge, hosting setting or deploy is part of this milestone.

## Remaining M5 release gates

1. Held-out extraction/normalization/job-requirement evaluations, with measured errors and source provenance limitations.
2. Accessibility scanning plus keyboard/screen-reader checks; synthetic user pilot from M4 remains open.
3. Parsing/inference concurrency and time/memory budgets measured on the actual host, including the 512 MB environment.
4. Account recovery/deletion, retention and backup/restore rehearsal; shared quota/proxy behavior and environment validation.
5. Dependency-advisory triage, non-root reproducible image and readiness/shutdown/deployment/rollback runbooks.

CI does not make these complete. No numerical hiring probability or competence certification is introduced.

## Owner interview notes

Explain why an unused endpoint remains part of the attack surface; why retirement preserves authentication and ownership checks; why a JSON response is not a validated factual contract; and why CI must prove clean installs on the target runner. Read-only tokens and pinned actions reduce workflow risk but cannot make malicious code or all supply-chain threats safe. Distinguish deterministic contracts, disposable database tests, mocked browser flows, live AI evaluations and actual host performance evidence.

## References checked

- [GitHub workflow hardening](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions): minimal token permissions and full-SHA action pinning.
- [Playwright CI setup](https://playwright.dev/docs/ci-intro): install browser OS dependencies and retain reports.
- Verified official releases: [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0), [upload-artifact v7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2). Full commit pins are in the workflow; updates need review and a passing run.
