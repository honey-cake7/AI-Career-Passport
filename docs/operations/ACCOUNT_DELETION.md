# Account deletion: scope and recovery

This runbook describes M5B on one active API process. It is not production rollout authorization or a complete retention/backup policy.

## User and API contract

Open **Account**, enter the current password and type **DELETE**. Deletion cannot be undone. The authenticated DELETE `/api/auth/account` body has only `{password, confirmation: "DELETE"}`; ownership always comes from the session. Five attempts per account per 15 minutes include invalid confirmation bodies. Wrong password returns 403 and does not authorize deletion; invalid body returns 400, expired/unavailable account 401, throttling 429.

204 confirms removal from the live account-owned Mongo collections. 202 confirms that access is closed but data cleanup is pending. A timeout, 5xx or unexpected response does not establish either completion or non-occurrence; the UI reports uncertainty rather than success. Do not retry by supplying another account ID or editing account status manually.

Deletion removes the base profile including embedded job versions, reviews and plans, all account sessions (including expired rows), then the user. A resume-only delete keeps the account. Re-registering a fully erased email creates a new owner ID with no connection to old data. Pending accounts cannot log in or re-register that email until the pending row is removed.

## Failure model

1. Password confirmation happens before any deletion marker.
2. The per-account root-write lock serializes profile/session creation and deletion. Creation rechecks active account status immediately before persistence; expensive extraction occurs outside this lock.
3. A persisted `deletionRequestedAt` marker blocks login and all authenticated access, even if sessions remain in Mongo.
4. Cleanup deletes profiles, sessions and finally the marked user. Failure leaves the marker; completed steps can safely repeat.
5. The backend runs recovery at startup and every minute, up to 20 marked users/pass, without overlapping its own recovery passes. Availability and backlog determine completion time; no one-minute completion guarantee is made.

On a database outage, restore normal database connectivity and keep one backend process running. Recovery resumes marked rows automatically. Fixed log events `account_deletion_pending`, `account_deletion_recovery_pending` and `account_deletion_recovery_unavailable` indicate work remains; they intentionally omit IDs/emails/passwords/database exceptions. In an authorized Mongo console, inspect only backlog counts initially:

```javascript
db.users.countDocuments({ deletionRequestedAt: { $exists: true } })
```

If the count persists, investigate database availability/permissions and the failed operation using synthetic reproduction and approved operator access. Do not clear the marker to restore account access. Do not remove the user row before dependent data: the marker is the recovery work record. Repeated cleanup is designed to be safe; deleting arbitrary collections or running the taxonomy seed is unrelated and unsafe for recovery.

## Deployment and retention limits

One active Node API process is required. Do not use clustered workers, multiple backend instances or overlapping rollout processes until root creation and deletion share a database-wide fence. A transaction around deletion alone does not constrain a delayed insert outside it. A distributed design and its concurrency/failure tests must precede scaling.

The purge covers live Mongo records, not backups, provider history, evidence URLs, downloaded files or already delivered browser data. No durable deletion ledger survives removal of the user row. **Do not restore an old backup into a live service without deletion reconciliation**: it can resurrect erased accounts/data. Before a production release, establish approved retention schedules, a deletion-aware restore procedure, operator access controls and recovery evidence. Do not claim regulatory compliance from these code paths.

## Verification

From `backend`, run `npm test`, `npm run test:integration`, `npm run build` and `npm run typecheck:tests`. Tests create disposable standalone MongoDB and synthetic accounts. Failure injection verifies the closed-access marker; a separate Node process reads the same fixture and completes pending work. The helper rejects non-loopback Mongo URIs and never uses production `MONGODB_URI`.

From `frontend`, run `npm run test:e2e -- account.spec.ts` for password/cancel/success/pending/uncertain/session-expiry flows on desktop/mobile. The full CI suite covers existing editor/job/plan regressions too. No production key or real candidate data is required. New collections containing owner data, new root creators, password-change features or multiple backend processes must extend this deletion boundary and its tests.
