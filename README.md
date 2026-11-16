# AI Career Passport

Understand what your resume shows—and what a job requires.

An existing React/TypeScript, Express, MongoDB and Qdrant prototype being improved on `feat/career-passport-v2`. This is development work; the full evidence-based career platform is not yet production-ready. AI-assisted changes and their validation are documented so the owner can review and maintain them.

## Current behavior

| Capability | Status |
| --- | --- |
| Account registration/login/logout | Implemented: salted scrypt passwords and one-hour revocable Mongo sessions. Browser token is memory-only; refresh requires login. |
| Private profile ownership | Session-derived owner; owner-scoped upload, retrieval, AI analysis, PDF export and profile deletion. |
| Resume PDF upload | One PDF up to 10 MB, MIME/signature/text bounds. Groq extracts structured fields; FastEmbed/Qdrant help normalize skills. Full model-output validation and parsing resource isolation remain incomplete. |
| Profile persistence | Personal info, experience, education, projects and skills persist. New uploads do not retain raw resume text. |
| Review/edit | Preview edits only. They are **not saved**; analysis/export use the saved uploaded profile. Persistent correction is a priority follow-up. |
| Job analysis | Existing Groq-generated suggestions and an unvalidated model score. It is **not a hiring probability** or a validated scoring system. Review suggestions for mistakes and invented claims. |
| PDF export | One PDFKit layout from the saved profile; projects included. No selectable themes or approved rewrite/version export yet. |
| Public sharing | Disabled: legacy links exposed contact data without explicit consent. |
| Resume versions/application tracking | Planned; not implemented. |

See the [technical audit](docs/architecture/AUDIT.md), [phased roadmap](docs/architecture/ROADMAP.md), [architecture decisions](docs/architecture/DECISIONS.md) and [first milestone report](docs/architecture/MILESTONE-1.md). Roadmap items are not claims of implemented features.

## Run locally

Use Node.js 24 and npm with MongoDB and Qdrant available locally. The repository includes separate backend/frontend lockfiles.

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

The fast HTTP/security suite replaces database methods and expensive services with synthetic doubles. The integration suite creates a disposable local MongoDB process, exercises real persistence and PDF generation/parsing, and replaces only model-dependent extraction/normalization/optimization. First run may download a large MongoDB binary; it never reads `MONGODB_URI` or contacts production databases. No Groq key, Qdrant server, model download or paid inference is needed for these suites. Live AI quality is not established by them.

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

Recorded results and limitations are in the milestone report. There is not yet a complete browser/accessibility/AI evaluation CI pipeline.

## API boundary

Authenticate using `Authorization: Bearer <token>` returned by registration/login. Use TLS outside localhost. No user ID is accepted from the client for ownership.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | `{ email, password }`, password 12–128 characters; returns one-hour session. |
| POST | `/api/auth/login` | Verify credentials and issue a new session. |
| POST | `/api/auth/logout` | Revoke current session. |
| GET | `/api/profile/me` | Current owner's saved profile or `null`. |
| POST | `/api/profile/upload` | One multipart `resume` PDF; extra text/ownership fields rejected. |
| POST | `/api/profile/:profileId/optimize` | Owner-only; `{ jobDescription }` with 1–20,000 characters. |
| GET | `/api/profile/:profileId/export` | Owner-only saved-profile PDF. |
| DELETE | `/api/profile/:profileId` | Delete owner's saved profile, including private fields. |
| GET | `/api/profile/public/:slug` | Always 404; legacy public disclosure disabled. |
| GET | `/api/health` | Process liveness only; does not prove dependency readiness. |

Unauthorized private requests return 401; missing/foreign profiles return the same 404. Responses are no-store. CORS permits only the configured frontend origin (localhost in development by default). Rate limits are per API process and conservative IP/account limits; multi-instance quotas and trusted-proxy configuration remain release work.

## Privacy and release boundaries

New uploads stop retaining raw text and logs omit resume/model content and connection strings. Existing raw-text records, provider retention, backups and browser caches on devices that never open the updated app are not purged by a code change. Legacy shared-ID profiles cannot safely be claimed from resume email; no automatic migration is attempted. Profile deletion is implemented; account deletion, password recovery, email verification and consent-based public sharing remain open.

Development-branch pushes are authorized. Merging to main and production deployment require separate owner approval. No claim of near-perfect extraction, ATS certification, guaranteed hiring outcomes or production security is made.
