# Pro Club Weekly Training DRAFT Save Client + UI V1 — Contract Freeze

## Purpose

Connect the accepted `saveProClubWeeklyTrainingDraftV1` callable to the Pro Club Head Coach workspace and make fresh-DRAFT creation safe under real retry conditions, including lost responses, concurrent retries, cross-tenant request reuse, and storage-bound validation failures.

## Exact baseline

- Base `main`: `bf4f22446753cb9cdc56909f6acacc4790b5d201`
- PR #120 server-mediated fresh-DRAFT save foundation is already merged.
- PR #121 callable + App Check + production app-ID binding is already merged.

## Write transport boundary

- The only browser write transport is Firebase callable `saveProClubWeeklyTrainingDraftV1` in `asia-southeast1`.
- The browser must not write Weekly Training plan/session/block documents directly to Firestore.
- There is no direct-write fallback when the callable is unavailable or fails.
- `FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE` must be checked before the default browser callable is constructed or invoked.
- The existing production capability gate is unchanged: function-backed Pro Club browser actions remain DEV/emulator-only and production web remains fail-closed.
- This slice does not change `src/lib/firebase.ts`, `src/config/runtimeCapabilities.ts`, `firestore.rules`, Firebase config, billing, or deployment configuration.

## Authority binding

- The UI receives a resolved `ProClubOrganizationAuthority` from the existing Pro Club workspace authority bridge.
- `clubId` is bound to `authority.organizationId` and is not user-editable.
- client `authorUid` is bound to `authority.userId` and is not user-editable.
- The UI fresh-save surface is enabled only for `staffRole === "HEAD_COACH"` with active resolved workspace authority.
- The callable binds server actor identity only from `request.auth.uid`.
- The trusted service rechecks canonical active account, Pro Club, Membership, Head Coach staff assignment, technical governance and authority evidence on every execution.
- Technical Director fresh-DRAFT writes remain closed.

## Idempotency contract

One logical fresh-DRAFT save has one stable UUID v4 `requestId`.

- The browser generates `requestId` once immediately before the first transport attempt.
- The callable accepts only the exact envelope `{ requestId, draft }`.
- The trusted service validates `requestId` again.
- The service computes a SHA-256 fingerprint over the authenticated actor plus the canonical validated draft.
- Request identity is **actor-global, not tenant-scoped**.
- The server derives a top-level control-document key as SHA-256 over `[operationType, actorUid, requestId]` and reads `weeklyTrainingDraftSaveRequests/{derivedRequestKey}`.
- Raw actor UID is therefore not required in the control-document path; the stored receipt still records and verifies `actorUid`, `requestId`, `clubId`, operation type and canonical payload fingerprint.
- On a first save, the complete plan/session/block hierarchy and this actor-global idempotency receipt are created in the same Admin Firestore transaction.
- The receipt records request identity, authenticated actor, club, canonical request fingerprint, resulting `planId`, hierarchy `documentCount`, and trusted creation time.
- The top-level request-registry collection is server-control metadata. No client Firestore Rules grant access to it.
- A retry with the same `requestId`, same authenticated actor, same club and same canonical payload returns the existing receipt/result and does not create another hierarchy.
- The same actor cannot reuse one `requestId` in a second club, even when that actor is an active Head Coach in both clubs; changed tenant is rejected with `FAILED_PRECONDITION`.
- A retry with the same request identity but a different actor, tenant, payload, malformed receipt, missing plan, or inconsistent plan state fails closed.
- Concurrent same-actor/same-request invocations aimed at different clubs contend on the same actor-global registry document and at most one tenant can commit.
- Concurrent identical retries converge through the same registry-document transaction conflict and resolve to one committed hierarchy.
- A different `requestId` is a distinct logical fresh save.

The maximum football hierarchy remains 183 documents:
- 1 plan;
- up to 14 sessions;
- up to 168 blocks.

A maximum fresh save therefore performs 184 atomic writes total when the server-only idempotency receipt is included. This remains below the Firestore transaction write ceiling.

## Drill-reference storage-bound contract

`drillReference` represents one Firestore document-ID segment and therefore has a storage boundary, not merely a UI character limit.

Canonical rules:
- exact non-empty string with no leading/trailing whitespace;
- no `/` path separator;
- not `.` or `..`;
- not a reserved `__.*__` identifier;
- maximum **1,500 UTF-8 bytes**.

The 1,500-byte boundary must be enforced consistently:
- shared browser/domain validation uses `TextEncoder` byte length;
- Head Coach UI prevents edits/pastes that exceed the same UTF-8 byte budget and shows current byte usage;
- trusted Functions validation independently rechecks the same 1,500-byte storage contract using server UTF-8 byte length before any Firestore transaction write.

`maxLength` in the UI is only a convenience guard and must not be treated as the authoritative storage check because JavaScript character/code-unit length is not UTF-8 byte length. Multibyte Unicode inputs must be covered explicitly.

A storage-unsafe `drillReference` is a definitive validation failure and must surface as `INVALID_ARGUMENT` / editable validation feedback before the write transport or transaction boundary. It must not be misclassified as ambiguous `NETWORK`, and must not lock the draft into an impossible retry loop.

## Ambiguous client result handling

`NETWORK` and `INVALID_RESPONSE` are treated as ambiguous because the server may have committed successfully even though the browser did not receive a verifiable response.

When the result is ambiguous:
- the draft remains in memory;
- the same `requestId` is retained;
- all draft fields are locked so the payload cannot drift;
- the UI offers `Retry same save`;
- retry submits the same request identity and unchanged payload;
- success is shown only after the server returns the verified receipt-backed `COMPLETED` result.

For explicit precondition/auth/permission/validation failures, including storage-bound validation failures, the pending request identity is cleared because the response is definitive and no ambiguous committed state should be assumed.

## Fresh DRAFT only

This slice supports creating a new Weekly Training DRAFT only.

Explicitly closed:
- edit/reconcile an existing DRAFT as a football workflow operation;
- overwrite or upsert by client-supplied plan ID;
- delete;
- submit/review/approve/publish lifecycle transitions;
- Technical Director co-author persistence;
- Technical Director note persistence.

The accepted domain shape remains:
- 1–14 sessions per plan;
- 1–12 blocks per session;
- canonical field limits and duplicate-slot rules from `src/lib/proClubWeeklyTraining.ts` / trusted server parity validator.

## Client validation

Before transport, the client must:
1. validate canonical UUID v4 request identity;
2. bind canonical club and workspace actor context;
3. run `parseProClubWeeklyTrainingDraft`;
4. reject storage-unsafe `drillReference` values, including ASCII and Unicode byte overflow, before network invocation;
5. reject invalid canonical data before network invocation;
6. reject runtime Technical Director note smuggling before transport.

Callable errors are normalized to safe client codes. Raw backend errors, auth tokens, App Check tokens, request fingerprints, or submitted payloads must not be logged or rendered.

## Completion boundary

The UI may report success only after the callable returns a validated result containing:
- `status === "COMPLETED"`;
- the exact submitted `requestId`;
- the expected `clubId`;
- a canonical non-empty server `planId`;
- hierarchy `documentCount` exactly equal to `1 + sessions + blocks`;
- a canonical server `createdAt` ISO timestamp.

Any malformed or mismatched response is ambiguous/fail-closed and must not be presented as a saved DRAFT.

## Acceptance gates

Before merge:
1. exact ancestry from `bf4f22446753cb9cdc56909f6acacc4790b5d201`;
2. exact reviewed scope, including trusted service/core and shared domain validation changes required by Codex remediation;
3. no Firestore Rules, runtime-capability, Firebase config or production deployment change;
4. no browser Firestore Weekly Training writer/fallback;
5. client tests for request identity, authority binding, pre-network validation, response validation and ambiguity classification;
6. storage-bound tests proving ASCII 1,500 bytes accepted / 1,501 rejected;
7. storage-bound tests proving multibyte Unicode exactly 1,500 bytes accepted / overflow rejected;
8. shared/domain and trusted-server storage-bound parity;
9. UI wiring proof that byte length, not `maxLength` alone, controls drill-reference input;
10. callable tests for exact envelope, authenticated actor and existing App Check allowlist boundary;
11. emulator proof that same request + same payload returns the same plan and only one hierarchy exists;
12. emulator proof that same actor + same request ID cannot cross from Club A to Club B;
13. emulator proof that concurrent cross-tenant attempts with the same actor/request commit at most one tenant;
14. emulator proof that same request + changed payload fails closed;
15. emulator proof that rollback also removes the actor-global idempotency receipt;
16. Rules-emulator proof that client read/write of the top-level request registry is denied;
17. full 14×12 / 183-document football hierarchy remains supported;
18. root TypeScript and production Vite build pass;
19. existing Weekly Training domain/callable/parity regressions pass;
20. independent Team 2 adversarial review;
21. Codex exact-current-head re-review with no unresolved P1/P2 blocker;
22. no production deploy/call/write/billing change.

## Safety flags

- `PRODUCTION_DEPLOYED=NO`
- `PRODUCTION_CALLABLE_INVOKED=NO`
- `PRODUCTION_DATA_WRITTEN=NO`
- `BILLING_PLAN_CHANGED=NO`
- `FIRESTORE_RULES_CHANGED=NO`
- `RUNTIME_CAPABILITY_CHANGED=NO`
- `FORCE_PUSH=NO`
- `DIRECT_MAIN_EDIT=NO`
