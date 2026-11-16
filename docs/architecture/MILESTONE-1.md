# Milestone 1: authenticated profile ownership and privacy boundary

Date: 2026-11-16. Branch: `feat/career-passport-v2`. Implementation and verification were AI-assisted. No production deployment or main-branch merge is part of this work.

## What was wrong

The baseline allowed anyone to overwrite the shared hardcoded user's resume and to optimize/export another profile using its ID. Public slug links returned contact details without opt-in. Projects extracted by the model were dropped during persistence, and the UI implied that local edits and selected PDF themes affected export when they did not. Raw resume/model content and database connection strings could enter storage/logs. Runtime dependency audits also reported vulnerable versions.

## Changes and rationale

- Added registration/login/logout using salted scrypt hashes and opaque 256-bit sessions, stored only as SHA-256 hashes in MongoDB. Sessions last one hour; expiry is checked in the query and logout deletes the session. This supports immediate revocation without JWT complexity.
- Protected every private profile route before parsing files. Upload owner comes from the session; export/optimization/deletion use an `{ _id, userId }` database predicate. Foreign/missing profiles return the same 404. Extra multipart ownership fields are rejected.
- Added owner profile retrieval/deletion, persisted and returned extracted projects, and verified the real Mongo write/read/export path.
- Disabled legacy public links. Removed automatic raw-text writes, unset raw text on re-upload, removed persistent browser profile caching and redacted sensitive logs. Existing data is not silently migrated or purged.
- Added basic API/credential/account request limits, fixed upload byte/part/field limits, MIME/signature checks, extracted-text/JD bounds, safe error responses, no-store responses and explicit frontend CORS configuration. PDF parser resources are released in a finally block.
- Connected frontend registration/login/logout/profile reload and authenticated blob downloads/deletion. Session tokens live only in memory. Session changes abort outstanding authenticated requests, and stale profile callbacks are guarded. Refresh requires signing in again. Browser interaction verification remains pending.
- Removed unimplemented export theme/share controls; labeled preview edits unsaved and the current AI score unvalidated. Existing fake skill-verification/status indicators are identified in the audit for the UX milestone; they are not considered evidence of correctness.
- Applied compatible security updates without forced direct-dependency major upgrades. Direct runtime versions now include Mongoose 9.12.1, Multer 2.5.0, FastEmbed 2.1.1 and Axios 1.21.1. Lockfile transitive/build dependency changes were reviewed. Both full npm audits report zero known vulnerabilities at verification time; this is not a guarantee that no vulnerabilities exist.
- Added one development-only database-test dependency, `mongodb-memory-server-core`. It starts a disposable MongoDB process on demand in the integration suite; ordinary npm install has no automatic MongoDB download hook. No new production framework or database was introduced.
- Replaced exaggerated README claims and template documentation with actual feature status/setup. Added the audit, decisions and measurable phase gates.

## How access works

1. Login verifies the supplied password against a versioned scrypt hash and issues a random bearer token.
2. The browser retains that token in memory and attaches it to API requests.
3. Middleware hashes it, looks up an unexpired session, and supplies the authenticated owner to the route. Mongo TTL cleanup is not relied upon for access expiry.
4. Routes include that owner in profile queries; knowing a profile ID never grants access.
5. Logout revokes the token in Mongo and clears browser state; new browser sessions cannot reclaim old shared-ID records by asserting a resume email.

## Verification results

All fixtures are synthetic. No production database, candidate resume, paid inference request, taxonomy reset or live deployment was used.

| Check | Result |
| --- | --- |
| Backend `npm run typecheck` | Pass |
| Backend `npm run typecheck:tests` | Pass; tests and source checked under strict backend TypeScript configuration |
| Backend `npm run build` | Pass |
| Backend `npm test` | 14 passed, 0 failed |
| Backend `npm run test:integration` | 8 passed, 0 failed, real disposable MongoDB and real PDF generation/parsing |
| Frontend `npm run lint` | Pass |
| Frontend `npm run build` | Pass |
| Backend and frontend `npm audit` | Zero reported vulnerabilities in each full dependency graph at verification time |
| `node scripts/check-secrets.mjs` | Pass; common credential/private-key/credentialed-Mongo-URL patterns in current tracked/intended files; ignored environment files excluded |
| `git diff --check` | Pass; Windows line-ending conversion notices are not whitespace failures |
| Visual/browser journey | Not verified: no connected browser is available in this session |

The HTTP suite exercises real Express middleware, credential hashing, routing, multipart processing and negative authorization checks with database/service doubles. The integration suite separately verifies unique users, hidden password hashes, hashed sessions/TTL metadata, owner predicates, project persistence/re-login, saved-profile PDF content, raw-text removal on re-upload, corrupt-PDF safety, expiry/logout and owner deletion against real MongoDB.

The first upload test run caught a multipart boundary limit that rejected a valid one-file upload. It was fixed and verified with valid, extra-field, multi-file and oversized requests. Test source typechecking also caught unchecked `Response.json()` values; typed envelope assertion helpers now make test expectations explicit.

## Remaining work and material limitations

This milestone verifies the API/database security boundary; it does not complete Phase 1 or certify production readiness. Browser account/download/expiry behavior, responsiveness and accessibility have not been observed in a browser. Live Groq, Qdrant and FastEmbed inference were not invoked; offline tests do not prove model quality or embedding/provider compatibility after dependency patches.

Next priorities are runtime AI/profile schemas, persistent owner-only review/save, deterministic evidence-based matching, truthful approved rewrites, parsing resource isolation and stronger cost/concurrency limits. Current model scores remain unvalidated. Profile deletion does not delete an account or erase provider/backups. Existing raw-text records require a separate reviewed cleanup. Email verification/recovery, account deletion, consent-based sharing, versioning, CI and hardened production configuration remain open.

Request limiters are per process, reset at restart and require a shared strategy before horizontal scaling. Default proxy trust remains off, so a hosted proxy may aggregate users under one IP until deployment-specific trust is reviewed. File signatures and text limits do not sandbox malicious/compressed PDFs or enforce parse time/memory limits. Missing AI keys do not prevent authentication/startup, but AI requests will fail safely.

## Owner interview notes

- Authentication answers who is making a request; authorization determines whether that user owns this resource. Client-supplied IDs establish neither.
- A random token is a secret; its hash can identify the session without storing the usable token. Absolute expiry must be checked even while an expired row awaits TTL deletion.
- JSON mode and TypeScript types do not validate model facts or runtime structure. This is why schema/evidence work remains a separate gate.
- A mocked repository test proves request behavior under controlled responses; a real Mongo test additionally proves actual casting, indexes and persistence. A PDF parse-back check proves selected saved content reaches export, not that layout/accessibility is perfect.
- Security dependency scans are evidence about reported versions, not an application penetration test. Honest limitations make the engineering story defensible.
- Describe this as a project improved with AI assistance, with decisions and test results you can explain; do not claim personal authorship of every generated line.

## Commit and push receipt

This report is included in the milestone commit. Its identity can be retrieved with `git log -1 --format="%H %s" -- docs/architecture/MILESTONE-1.md`. The actual SHA and development-branch push result are reported to the owner after committing; they are not guessed in advance. Production publication remains separately authorized work.
