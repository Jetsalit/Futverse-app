# Pro Club Weekly Training Server DRAFT Save V1 — Contract Freeze

## Status

Replacement architecture for PR #119 P1, based on `main` commit `0fcd06911a8c6a35929bc2d0ae7ddf0ec5c868f2`.

This slice performs no production deploy, no production HTTP/callable invocation, no production data write, and no billing-plan change.

## Why the client atomic path is rejected

The domain accepts up to 14 training sessions and up to 12 blocks per session. A fully valid normalized draft can therefore require 183 Firestore document writes: one plan, 14 sessions, and 168 blocks.

The real-root Emulator proof for PR #119 demonstrated that a 14-session fresh hierarchy already exceeds Firestore Security Rules evaluation capacity with the client-side atomic approach. Firestore Rules enforce hard per-request expression and document-access budgets, so further client-rule optimization cannot be treated as a reliable contract for every domain-valid draft.

DRAFT Save V1 therefore MUST NOT depend on a browser/mobile client committing the complete normalized hierarchy directly through Firestore Security Rules.

## Authoritative write path

The production persistence boundary is a trusted server callable function using the Firebase Admin SDK.

The callable MUST:

1. require Firebase Authentication;
2. require App Check at the function boundary;
3. derive actor UID from verified callable auth context, never request payload;
4. validate the untrusted draft body on the server;
5. read canonical Pro Club authorization state from Firestore;
6. authorize only an ACTIVE canonical Head Coach in the exact `clubId`;
7. require a valid ACTIVE current technical-governance authority backed by ACTIVE canonical Membership and Staff evidence;
8. generate the fresh `planId` server-side;
9. write the complete normalized plan/session/block hierarchy in one Admin SDK transaction;
10. use trusted server timestamps and actor identity for audit fields;
11. return success only after the atomic transaction commits.

Admin SDK access is trusted server access and therefore does not rely on client Firestore Rules to authorize the write. The service itself MUST mirror or exceed the canonical security boundary before any write is queued.

## Canonical paths

The transaction may write only:

- `proClubs/{clubId}/weeklyTrainingPlans/{planId}`
- `proClubs/{clubId}/weeklyTrainingPlans/{planId}/sessions/{sessionId}`
- `proClubs/{clubId}/weeklyTrainingPlans/{planId}/sessions/{sessionId}/blocks/{blockId}`

No Academy path is permitted.

Session IDs remain deterministic from `sessionDate + startTime`.
Block IDs remain deterministic `block-01` through `block-12`.

## Domain envelope

Server validation MUST preserve the reviewed Weekly Training V1 envelope:

- 1–14 sessions;
- 1–12 blocks per session;
- strict plan week date;
- every session date inside the seven-day plan week;
- strict `HH:mm` start times;
- no duplicate session date/time slot;
- session duration 15–360 minutes;
- block duration 1–180 minutes;
- total block duration cannot exceed session duration;
- canonical phase/load/block-type enums;
- bounded normalized text;
- 1–10 bounded coaching points per block;
- Technical Director note persistence remains closed in this slice.

The maximum normalized hierarchy is 183 writes, below the Firestore transaction/write-batch maximum of 500 writes. A real Firestore Emulator test MUST prove the 14-session × 12-block shape commits atomically through the server service before acceptance.

## Authorization boundary

The actor MUST satisfy all of the following at the exact Pro Club:

- `users/{actorUid}` exists and status is `Active` or `ACTIVE`;
- `proClubs/{clubId}` exists and status is `ACTIVE`;
- `proClubs/{clubId}/members/{actorUid}` exists and status is `ACTIVE`;
- `proClubs/{clubId}/staff/{actorUid}` exists, status is `ACTIVE`, and `staffRole == HEAD_COACH`;
- `proClubs/{clubId}/technicalGovernance/current` exists, `schemaVersion == 1`, status is `ACTIVE`, and authority role is `TECHNICAL_DIRECTOR` or `HEAD_COACH`;
- the authority UID has matching ACTIVE Membership and ACTIVE Staff at the same club;
- authority Staff role exactly matches the governance `authorityRole`.

Global user role, global `SUPERADMIN`, Academy authority, client payload role fields, UI state, or Staff presence without Membership MUST NOT bypass this boundary.

## Fresh-create and audit boundary

- The client MUST NOT choose authoritative `planId`.
- The server MUST generate a fresh plan document reference.
- The actor UID MUST become `authorUid`, `createdBy`, and `updatedBy`.
- `createdAt` and `updatedAt` MUST come from a trusted server timestamp source.
- The plan status is exactly `DRAFT`.
- Existing-plan editing, overwrite, reconciliation, delete, lifecycle transition, and Technical Director co-author writes remain out of scope.

## Failure behavior

The service MUST fail closed for:

- unauthenticated caller;
- invalid App Check at callable boundary;
- invalid draft input;
- inactive/missing actor account;
- inactive/missing Pro Club Membership;
- missing/inactive Staff assignment;
- non-Head-Coach actor;
- missing/invalid technical-governance authority;
- transaction failure.

No sequential fallback is permitted. A failed transaction MUST leave the fresh hierarchy absent.

## P1 closure criteria

PR #119 P1 is considered closed only when a replacement server slice proves all of the following:

1. server validator accepts the maximum domain-valid shape;
2. Admin SDK transaction commits 183 canonical documents atomically in Firestore Emulator;
3. unauthorized actor cases fail before writes;
4. failed transaction leaves no partial hierarchy;
5. Functions TypeScript build passes;
6. no production deployment or live write occurs.

## Deferred

- client callable adapter/UI wiring;
- persisted DRAFT editing/reconciliation;
- lifecycle transitions;
- Technical Director co-author writes;
- production Functions deployment;
- billing/Blaze activation;
- production smoke test.

## Production safety

- `PRODUCTION_DEPLOYED=NO`
- `PRODUCTION_CALLABLE_INVOKED=NO`
- `PRODUCTION_DATA_WRITTEN=NO`
- `BILLING_PLAN_CHANGED=NO`
- `FORCE_PUSH=NO`
