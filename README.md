# AI Career Passport

Understand what your resume shows—and what a job requires.

An existing React/TypeScript, Express, MongoDB and Qdrant prototype being improved on `feat/career-passport-v2`. This is development work; the full evidence-based career platform is not yet production-ready. AI-assisted changes and their validation are documented so the owner can review and maintain them.

## Current behavior

| Capability | Status |
| --- | --- |
| Account registration/login/logout | Implemented: salted scrypt passwords and one-hour revocable Mongo sessions. Browser token is memory-only; refresh requires login. |
| Account deletion | Password and typed DELETE confirmation; removes the signed-in account, every session, base resume and embedded job data. Failed cleanup closes access and retries on server startup/every minute. Supports one active backend process; shared write fencing is required before scaling. |
| Private profile ownership | Session-derived owner; owner-scoped upload, retrieval, AI analysis, PDF export and profile deletion. |
| Resume PDF upload | One PDF up to 10 MB, MIME/signature/text bounds. Groq extracts structured fields; FastEmbed/Qdrant normalize skills. Extracted content is runtime-validated before persistence. Import creates a resume; it cannot replace existing edits. Parsing resource isolation and AI factuality evaluation remain incomplete. |
| Profile persistence | Personal info, experience, education, projects and skills persist. New uploads do not retain raw resume text. |
| Review/edit | Manual creation, editable contact/summary/skills/experience/projects/education, explicit validated save and reload. Atomic revisions prevent lost updates; errors retain the current draft. Editing/save/export need no AI services. |
| Job analysis | “Tailor for a job” extracts requirements with exact JD quotes. Server-side exact/alias matching distinguishes work mentions, listed claims, missing mentions and unassessable context. No hiring/readiness score. Negations and alternatives are conservatively unassessed. Only the JD is sent to Groq for this workflow. |
| PDF export | Saved-revision PDF preview and download use the same file. One PDFKit A4 layout with bundled Noto Sans fonts; original import layout is not preserved. Full multilingual coverage and advanced pagination remain open. |
| Public sharing | Disabled: legacy links exposed contact data without explicit consent. |
| Job-specific resumes | Up to 20 owner-only editable copies of the saved base, each with its own JD, revision and cached review. Accept/edit/reject line-order suggestions; save and export separately. Base changes do not synchronize into copies. This is not immutable edit history. |
| Gap plans | Up to 20 private plans per job version. Confirm existing experience, need for practice, or need for manual checking; adapt a focused task and completion criteria; save status, outcome notes and an optional URL. Completion is self-reported. Reassess the original requirement against saved resume text without another AI call. Personalized curricula and verified proficiency are not provided. |
| Automated checks | GitHub Actions checks source patterns/whitespace, lockfile installs, backend contracts and disposable MongoDB persistence, frontend lint/types/build and desktop/mobile Chromium workflows. Synthetic tests require no production secrets. This is not a production-readiness certification. |
| Application tracking | Planned; not implemented. |

See the [technical audit](docs/architecture/AUDIT.md), [phased roadmap](docs/architecture/ROADMAP.md), [architecture decisions](docs/architecture/DECISIONS.md), [first milestone](docs/architecture/MILESTONE-1.md) and [editor milestone](docs/architecture/MILESTONE-2.md). Roadmap items are not claims of implemented features.

The [job-review milestone report](docs/architecture/MILESTONE-3.md) explains the current workflow, test evidence and limitations. After saving a base resume, choose **Tailor for a job → enter a version name and job description → Create job version → Review this job**. Inspect quotes/evidence and next steps, accept/edit/reject suggestions, save, then preview/download the tailored PDF. Suggestions bring relevant existing lines first and preserve every line; they do not freely generate new achievements. You may rewrite wording yourself before saving. Deleting the base also deletes all its job versions; deleting one version keeps the base.

For [saved gap plans](docs/architecture/MILESTONE-4.md), expand **Choose a next step** beneath a requirement, select what is true for you, and choose **Save a focused plan**. Adapt the task and criteria in **Your next steps**. Record what you actually did before marking completion. Choose **Edit resume evidence**, make factual edits, save the resume, then **Reassess saved resume**. Completing a task never changes the resume or proves proficiency. Saved plans remain available after resume edits invalidate the AI review. Plans and notes are not sent to a model or included in the exported PDF.

## Run locally

Account controls are under **Account** in the header. Deletion requires your current password and typing **DELETE**. **Keep my account** cancels without a request. Successful deletion signs out and clears this page; pending cleanup is described separately. Other sessions are rejected on their next request. Deleting only the resume in the editor keeps your account. See the [deletion milestone](docs/architecture/MILESTONE-5B.md) and [operator runbook](docs/operations/ACCOUNT_DELETION.md) for failure recovery and retention limits.

Use Node.js 24 and npm with MongoDB available locally. Qdrant and Groq are needed for PDF import/normalization; manual creation, editing and export do not use them. The repository includes separate backend/frontend lockfiles. In PowerShell environments that block `npm.ps1`, use `npm.cmd` for the commands below.

```bash
git clone https://github.com/honey-cake7/AI-Career-Passport.git
cd AI-Career-Passport
git switch feat/career-passport-v2
```

Create `backend/.env` from `backend/.env.example` and `frontend/.env` from `frontend/.env.example`. Set your own local MongoDB URI, Qdrant URL/key and Groq key. Set `FRONTEND_URL=http://localhost:5173` and `VITE_API_BASE_URL=http://localhost:3001`. Never commit `.env` files or use production credentials for tests.

```bash
cd backend
npm ci
npm run dev
```

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`, create an account and upload a synthetic resume first. Upload sends extracted resume text to Groq; review the provider's retention terms before using personal data. Text is processed in memory and structured profile data is saved in MongoDB. Local FastEmbed may download its model on first normalization. Seeded taxonomy data is required for useful Qdrant matches.

Job review uses the existing Groq configuration and MongoDB, with no additional service or local embedding inference. Job descriptions, reviewed excerpts and the edited content are saved privately with the version. Provider retention is not controlled by deleting your local version.

The existing `backend/docker-compose.yml` is a **development example**; its images, DB port bindings and backend Dockerfile still need hardening. If using it locally, supply the same Groq/environment values and run `docker compose up --build` from `backend`. No production deployment is part of this milestone.

**Taxonomy seed caution:** `npm run seed:skills` currently deletes/recreates the configured Qdrant collection. Use a disposable local collection only. A non-destructive versioned seed is planned. Do not point this command at shared or production data.

## Checks

Backend:

```bash
cd backend
npm run typecheck
npm run typecheck:tests
npm run build
npm test
npm run test:integration
```

The fast HTTP/security suite replaces database methods and expensive services with synthetic doubles. The integration suite creates a disposable local MongoDB process, exercises real persistence and PDF generation/parsing, and replaces model-dependent extraction/normalization/job review. First run may download a large MongoDB binary; it never reads `MONGODB_URI` or contacts production databases. No Groq key, Qdrant server, model download or paid inference is needed for these suites. Live AI quality is not established by them.

Frontend:

```bash
cd frontend
npm run lint
npm run build
npm run typecheck:tests
npx playwright install chromium
npm run test:e2e
```

Playwright exercises the real editor in desktop/mobile Chromium using synthetic API responses. Mongo integration tests independently verify the real HTTP/database/PDF path. These are complementary checks, not a live-provider end-to-end evaluation. Recorded results and limitations are in the milestone report; complete accessibility/AI evaluation CI remains open.

The [Development checks workflow](.github/workflows/checks.yml) runs on development-branch pushes and pull requests targeting main or development. It uses the Node version in `.node-version`, Ubuntu 24.04, `npm ci` with both lockfiles, and MongoDB 8.2.6 for disposable integration databases. It never deploys. Its token has read-only repository contents access; checkout does not retain credentials, and no application secrets are supplied. Synthetic browser reports/traces are retained for seven days. In CI, an exclusive test or flaky retry fails the browser job. See [M5A verification and troubleshooting](docs/architecture/MILESTONE-5A.md). Branch protection is not configured automatically; passing checks do not prevent merges until the owner requires them in repository rules.

An optional single-call live check uses synthetic data only: from `backend`, run `node --import tsx test/manual/review-job.ts --live`. It uses the configured Groq key/model and consumes provider quota. Automated test suites do not run it. One successful example does not establish extraction accuracy.

## API boundary

Authenticate using `Authorization: Bearer <token>` returned by registration/login. Use TLS outside localhost. No user ID is accepted from the client for ownership.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | `{ email, password }`, password 12–128 characters; returns one-hour session. |
| POST | `/api/auth/login` | Verify credentials and issue a new session. |
| POST | `/api/auth/logout` | Revoke current session. |
| DELETE | `/api/auth/account` | Authenticated owner only; `{password, confirmation: "DELETE"}` with no owner/email fields. 403 for incorrect password, 400 for invalid confirmation/body, 429 after five attempts/account/15 minutes. 204 means live account/data removed; 202 means access closed and cleanup pending. |
| GET | `/api/profile/me` | Current owner's saved profile or `null`. |
| POST | `/api/profile` | Create one private base resume with `{personalInfo, experiences, education, projects, skills}`. Duplicate owner returns 409. |
| PUT | `/api/profile/:profileId` | Save `{revision, content}` using the complete resume content above. Returns updated profile/revision. Invalid fields return 400; stale revision returns 409 without modifying the saved document. |
| POST | `/api/profile/upload` | One multipart `resume` PDF; extra text/ownership fields rejected. Existing profile returns 409 without replacement. |
| POST | `/api/profile/:profileId/optimize` | Retired: authenticated owner receives 410 `endpoint_retired`, with no AI call or profile mutation. Anonymous requests receive 401; foreign/missing profiles receive 404. Use job-version review instead. |
| GET / POST | `/api/profile/:profileId/versions` | List metadata, or create `{label, jobDescription, revision}` from the saved base; atomic 20-version limit. |
| GET / PUT / DELETE | `/api/profile/:profileId/versions/:versionId` | Load, save `{revision, content}`, or delete one owned job version. Saving invalidates its review. |
| POST | `/api/profile/:profileId/versions/:versionId/review` | `{revision}`; verified requirements, literal evidence, next steps and safe line-order suggestions. Cached for the saved revision; failures do not change resume content. |
| GET / POST | `/api/profile/:profileId/versions/:versionId/plans` | Load plans, or create `{revision, plansRevision, requirementId, confirmation}` from a current saved review. Confirmation: `has_experience`, `needs_practice`, or `needs_review`; context requirements allow only `needs_review`. |
| PUT / DELETE | `/api/profile/:profileId/versions/:versionId/plans/:planId` | Update `{revision, plansRevision, plan}` or delete `{revision, plansRevision}`. Editable plan fields: `task`, `criteria`, `checks`, `status`, `notes`, `link`. Status: `planned`, `in_progress`, `completed`. Unknown fields fail. |
| POST | `/api/profile/:profileId/versions/:versionId/plans/:planId/reassess` | `{revision, plansRevision}`; compare the frozen requirement with saved resume text locally. Does not change task status or resume content. |
| GET | `/api/profile/:profileId/versions/:versionId/export?revision=0` | Saved job-version PDF; revision is mandatory and stale requests return 409. |
| GET | `/api/profile/:profileId/export?revision=0` | Owner-only saved-profile PDF; supplied stale revision returns 409. |
| DELETE | `/api/profile/:profileId` | Delete owner's saved profile, including private fields. |
| GET | `/api/profile/public/:slug` | Always 404; legacy public disclosure disabled. |
| GET | `/api/health` | Process liveness only; does not prove dependency readiness. |

Unauthorized private requests return 401; missing/foreign profiles return the same 404. Responses are no-store. CORS permits only the configured frontend origin (localhost in development by default). Rate limits are per API process and conservative IP/account limits; multi-instance quotas and trusted-proxy configuration remain release work.

The legacy score/rewriting service has been removed. Its old `/optimize` path is an authenticated, owner-scoped 410 response; it no longer accepts work for an unchecked AI contract. The current UI uses job-version reviews, which make one bounded provider call (25-second timeout, no automatic retries), log only durations/counts/token usage and admit one active review per account per API process. A version has a combined 500 KiB JSON content/JD/review/plan budget as well as the 20-version cap. Plan mutations return `{gapPlans, plansRevision, revision}`; they increment a separate plan counter, preserving resume revision and cached review. Stale resume or plan counters return 409. Plans use no additional provider calls or infrastructure. Cost in currency is not estimated without verified pricing. Job description/model errors and provider rate limits are recoverable UI states.

## Privacy and release boundaries

New uploads do not retain raw text; saving corrections also removes legacy raw text for that profile. Logs omit resume/model content and connection strings. Other existing raw-text records, provider retention, backups and browser caches on devices that never open the updated app are not purged by a code change. Legacy shared-ID profiles cannot safely be claimed from resume email; no automatic migration is attempted. Profile and account deletion are implemented for owned live Mongo records; backups/provider records/downloaded copies need separate retention policies. Password recovery, email verification and consent-based public sharing remain open. Unsaved drafts remain in memory only and are lost on refresh/session expiry; save before leaving.

Account deletion uses a durable access barrier plus per-account serialization for profile/session creation and cleanup. Keep **one active API process**; multi-instance, clustered or overlapping rolling deployments require a database-wide write fence first. Pending cleanup retries only while the backend and database are available, up to 20 marked accounts per pass. Backup-restore deletion reconciliation is not implemented, so this is not a completed production retention/recovery policy.

Development-branch pushes are authorized. Merging to main and production deployment require separate owner approval. No claim of near-perfect extraction, ATS certification, guaranteed hiring outcomes or production security is made.
