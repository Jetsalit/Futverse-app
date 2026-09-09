# Pro Club Weekly Training DRAFT Save Callable + App Check V1 — Contract Freeze

## Purpose

Expose the accepted server-mediated Fresh DRAFT Save service through one Firebase callable boundary without weakening the server authorization model proven in PR #120.

## Canonical callable

- Export name: `saveProClubWeeklyTrainingDraftV1`
- Firebase Functions v2 `onCall`
- Region: `asia-southeast1`
- `enforceAppCheck: true`
- Timeout: 30 seconds
- Memory: 256 MiB
- Concurrency: 20
- Max instances: 10

## Trusted identity boundary

- Authoritative actor identity is `request.auth.uid` only.
- Payload `authorUid` is non-authoritative and must never replace authenticated identity.
- Missing authentication fails closed with `HttpsError("unauthenticated")` before service execution.
- Missing/invalid App Check fails closed. The platform-level `onCall({ enforceAppCheck: true })` gate is authoritative for token verification.
- A verified App Check token is not sufficient by itself: the decoded `request.app.appId` must also match the canonical FutVerse production app allowlist before service execution.
- The callable uses the same canonical `FUTVERSE_PRODUCTION_WEB_APP_ID` already used by privileged Pro Club production App Check verification.
- A valid App Check token from a sibling staging, mobile, debug, or otherwise unauthorized Firebase app in the same project must fail closed before service execution.
- An empty or malformed callable app allowlist is an internal configuration failure and must fail closed before service execution.

## Service boundary

The callable must delegate to `createWeeklyTrainingDraftSaveService(...).saveFreshDraft(...)`.

The callable must not reimplement canonical Pro Club authorization. The service remains responsible for:

- active canonical user account;
- active Pro Club;
- active canonical Membership;
- active `HEAD_COACH` Staff assignment;
- active technical governance;
- active matching Membership + Staff evidence for technical authority;
- server-generated plan identity;
- one atomic Firebase Admin SDK transaction for the complete hierarchy.

## Error mapping

`WeeklyTrainingDraftSaveError` maps to callable-safe errors:

- `INVALID_ARGUMENT` -> `invalid-argument`
- `PERMISSION_DENIED` -> `permission-denied`
- `FAILED_PRECONDITION` -> `failed-precondition`

Unexpected errors must be logged without secrets/payload contents and returned as `HttpsError("internal", "An internal error occurred.")`.

## Response contract

Return the service result unchanged:

- `status: "COMPLETED"`
- `clubId`
- `planId`
- `documentCount`
- `createdAt`

No token, raw auth claims, App Check token, submitted training payload, or unauthorized app identifier may be echoed in logs or response metadata.

## Explicitly closed in this slice

- client/UI wiring;
- existing DRAFT editing or reconciliation;
- delete;
- lifecycle transitions;
- Technical Director co-author persistence;
- production Functions deployment;
- production callable invocation;
- production Firestore write;
- billing / Blaze plan change.

## Acceptance gates

Before PR/merge:

1. exact post-PR-#120 main ancestry;
2. exact callable slice scope;
3. callable handler tests for App Check, authorized production app ID, sibling-app rejection, auth, success, domain error mapping, unexpected internal failure;
4. Functions TypeScript build;
5. existing Weekly Training max-shape/rollback regression;
6. root TypeScript and app production build;
7. independent Team 2 security review;
8. Codex review feedback addressed or explicitly accepted with no unresolved blocker;
9. no production deploy/call/write.

## Safety flags

- `PRODUCTION_DEPLOYED=NO`
- `PRODUCTION_CALLABLE_INVOKED=NO`
- `PRODUCTION_DATA_WRITTEN=NO`
- `BILLING_PLAN_CHANGED=NO`
- `FORCE_PUSH=NO`
- `DIRECT_MAIN_EDIT=NO`
