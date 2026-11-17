# M5B — Confirmed account deletion and resumable cleanup

Date: 2026-11-17. AI-assisted implementation on `feat/career-passport-v2`. No production account was deleted, no merge/deploy was performed, and M5 is not complete.

## What changed

Previously a user could delete a resume but not their account or other sessions. There was no access barrier for accounts undergoing deletion, and simply deleting several collections could leave data behind after a failure or late upload/login.

The header now offers **Account**. Review the deletion scope, enter the current password, and type **DELETE**. Cancellation makes no deletion request. The backend accepts no client-supplied owner/email, requires an active session and correct password, and limits attempts. Only owned live records are purged: account, every session, base resume and embedded job versions/reviews/plans. Deleting only a resume remains a separate action.

A durable deletion marker closes access before cleanup. Root profile creation and session issuance recheck active account state inside the same per-account write lock as deletion, preventing late work from recreating data in the supported single-process setup. A failed purge returns 202 with a pending message rather than claiming all data is gone. Startup/minute recovery retries idempotently and removes the user last. See ADR-012 and the [operator runbook](../operations/ACCOUNT_DELETION.md).

## Acceptance and verification

- Active-session/password/typed-confirmation checks; strict fields; account-scoped throttling; foreign-owner injection rejected.
- Successful cleanup removes all owned records and sessions while another account remains unchanged. Old sessions/login cannot restore access; re-registering an erased email creates a new identity with no old data.
- Late upload/root creation cannot recreate a deleted profile/session. Other ordinary version writes do not upsert.
- Failure before the durable marker does not report success. Failure during cleanup retains the access barrier; a fresh process resumes persisted work. Retry after removal of profiles/sessions but before final user removal is safe.
- Browser protects unsaved resume navigation, clears confirmation passwords after submission, distinguishes wrong password/pending/unknown results, and clears private state after deletion or expired sessions. Unexpected HTTP 200 responses never count as deletion confirmation.
- Desktop/mobile layout, builds/types/lint, existing regressions, diff/secret review and hosted CI are checked before delivery.

| Local check (Windows, Node 24.18.0) | Result |
| --- | --- |
| Backend `npm test` | 64 passed: includes strict deletion input and account-lock ordering/recovery, plus existing security and AI/PDF contracts. |
| Backend `npm run test:integration` | 36 passed: includes real sessions/standalone disposable Mongo, owner isolation, all-session removal, late upload, both cleanup failure positions, pre-marker failure, per-account throttling, re-registration and recovery executed in another Node process. |
| Backend build/test typecheck | Passed. |
| Frontend lint with warnings denied, build/test typecheck | Passed. |
| Frontend browser tests | 22 desktop/mobile cases passed, including six new deletion cases. After adding strict deletion-response validation, all six affected account cases passed again; hosted CI runs the full suite. Hosted results/run URL accompany delivery. |
| Visual review | Desktop/mobile account screenshots inspected after rendering; browser checks assert no horizontal overflow. Full accessibility/screen-reader audit remains open. |

All test data is synthetic. The recovery child process accepts only an explicitly supplied disposable loopback Mongo URI; it does not read the application's database URI. Browser APIs are mocked; database tests exercise real HTTP/storage separately. No paid provider call or real account deletion was needed. Do not equate these checks with live deployment validation.

## Important limits

- **One active API process only.** Database-wide fencing is required before multiple workers/instances or overlapping rolling deployments. No production rollout is authorized by a development push.
- Pending cleanup requires a running backend and available database. Recovery attempts up to 20 marked accounts per pass, immediately on startup and every minute. There is no promised completion SLA, public status lookup, cancellation, or account restoration after confirmation.
- Only owned live Mongo records are removed. In-flight processing may finish, though fenced root writes cannot recreate deleted records. The API cannot retract data already delivered to another tab, downloaded PDF, external evidence site, provider record or backup. Backup restore reconciliation and retention schedules remain release gates.
- Session tokens and unsaved drafts remain memory-only. Other sessions are rejected on the next request, not actively pushed offline. Password/email recovery and verification are not implemented here.
- Data deletion does not remove shared taxonomy data from Qdrant; it is not an account-owned store. Live-provider retention is outside this service's control.

## Owner interview notes

Explain authentication versus password re-confirmation; why deleting a session record alone is insufficient for a pending account; why a late upload needs a write-time account check; and why deleting the account last leaves a durable recovery marker. Explain the deliberate standalone-Mongo/single-process boundary and why it must not be claimed as distributed atomic deletion. Keep live-data purge, backup retention and provider retention distinct. Describe implementation and tests as AI-assisted.
