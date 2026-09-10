# Pro Club Weekly Training Saved-DRAFT Read V1 — Contract Freeze

## Purpose

Expose persisted Weekly Training DRAFTs to the active Head Coach as a read-only list and detail view, using the trusted server-written Firestore hierarchy.

This slice closes the immediate post-save visibility gap. It does **not** add edit/reconcile, delete, submit/review/approve/publish, Technical Director co-authoring, or any new write authority.

## Baseline

- Base `main`: `380050170ad6780c6854925bb6a44d2424fe265b`
- Predecessor: PR #122 merged Weekly Training fresh-DRAFT client/UI save.
- Existing Firestore Rules already allow active Pro Club members to read `weeklyTrainingPlans`, `sessions`, and `blocks`.
- No Firestore Rules change is required by this slice.

## Hierarchy integrity before production

Canonical hierarchy documents use `schemaVersion == 2`:

- plan stores trusted `sessionCount` (1–14);
- each session stores trusted `blockCount` (1–12);
- blocks remain deterministic `block-01` through `block-12`;
- maximum hierarchy size remains 183 documents;
- request-receipt schema remains independent and unchanged.

The trusted server computes cardinality directly from the already validated draft inside the same atomic fresh-save transaction. Client payload cardinality is never trusted.

## Immutable fresh-save audit snapshot

Schema-v2 Weekly Training DRAFT hierarchy is a fresh-save snapshot. Until a separately reviewed edit/reconcile lifecycle exists, every plan/session/block document must retain the exact audit values written by that fresh-save transaction:

- plan `createdBy == updatedBy == authorUid`;
- plan `createdAt == updatedAt` at full Firestore `(seconds,nanoseconds)` precision;
- every session/block `createdBy == updatedBy == plan.authorUid`;
- every session/block `createdAt == updatedAt == plan.createdAt` at full precision.

Any actor or timestamp drift fails closed. The read path and idempotent retry path enforce the same snapshot-integrity contract so the system cannot report a hierarchy as valid in one path and corrupted in another.

## Idempotent retry integrity

A retry using the same actor/request ID MUST NOT return `COMPLETED` merely because the server-only request receipt still exists.

Before returning the original result, the trusted server revalidates the deterministic receipt-bound hierarchy against the same validated request:

- receipt identity, actor, club, request fingerprint, document count, timestamp, and plan ID remain canonical;
- plan schema, football payload, `sessionCount`, author/status, and fresh-save audit metadata still match the original request;
- sessions read is bounded to `expected session count + 1` and must contain exactly the deterministic session IDs from the request;
- each session must match schema v2, order, football payload, `blockCount`, and fresh-save audit metadata;
- each blocks read is bounded to `expected block count + 1` and must contain exactly the deterministic block IDs from the request;
- each block must match schema v2, order, football payload, coaching points, optional drill reference, and fresh-save audit metadata;
- missing, extra, altered, malformed, or audit-drift hierarchy state fails closed as `FAILED_PRECONDITION`.

This extra integrity read path runs only for an idempotent retry. The normal fresh-save path retains the existing atomic write behavior and document count.

## Runtime audience

V1 UI is exposed only when the resolved Pro Club authority is all of:

- organization type `PRO_CLUB`;
- organization status `ACTIVE`;
- membership status `ACTIVE`;
- canonical membership authority resolved active;
- effective staff role `HEAD_COACH`.

The list is constrained to DRAFT plan documents authored by the current resolved Head Coach UID. The UI never accepts a free-form club ID or actor UID.

## Canonical read paths

- `proClubs/{clubId}/weeklyTrainingPlans/{planId}`
- `proClubs/{clubId}/weeklyTrainingPlans/{planId}/sessions/{sessionId}`
- `proClubs/{clubId}/weeklyTrainingPlans/{planId}/sessions/{sessionId}/blocks/{blockId}`

The request registry `weeklyTrainingDraftSaveRequests/{derivedKey}` is server-only idempotency state and is never read by this client slice.

## Saved-DRAFT history pagination

History MUST NOT read an unbounded DRAFT collection.

V1 uses:

- page size: 20 visible DRAFTs;
- sentinel: query limit 21 to detect a next page;
- filters: exact `authorUid` and `status == DRAFT`;
- server ordering: `updatedAt DESC`, then Firestore document ID DESC;
- cursor: exact `(updatedAt.seconds, updatedAt.nanoseconds, planId)` from the last visible item;
- next page: `startAfter` the exact cursor;
- UI action: explicit `Load more saved drafts`;
- refresh: resets cursor and reloads the first page;
- append: de-duplicates by `planId` to avoid duplicate display after retries/races.

Every visible plan still passes strict schema-v2 validation before rendering. The server query ordering and client comparator use the same full-precision timestamp + plan-ID ordering.

## Firestore index contract

The paginated history query requires a declared composite index for collection `weeklyTrainingPlans`:

1. `authorUid ASCENDING`
2. `status ASCENDING`
3. `updatedAt DESCENDING`
4. `__name__ DESCENDING`

The index is version-controlled in `firestore.indexes.json`, and `firebase.json` references that file. This PR does **not** deploy the index. A future production deployment gate must deploy/verify the index before relying on this query in production.

## Detail semantics

An exact detail request is accepted only for a plan ID selected from the Head Coach's own saved-DRAFT list. The adapter independently re-reads the plan and re-validates author/status/audit before loading children.

The adapter reads sessions with a hard query limit of `sessionCount + 1`. If the returned count is not exactly `sessionCount`, it fails closed before any block fan-out.

Every session is validated, including fresh-save audit parity, before block reads. Blocks are read with a hard query limit of `blockCount + 1`; each returned block collection must match trusted cardinality and audit parity exactly.

The pure read model additionally requires:

- schema version `2` at every hierarchy level;
- canonical field sets only;
- immutable fresh-save audit parity;
- valid Firestore document identities;
- deterministic session IDs (`YYYY-MM-DD-HHmm`);
- deterministic contiguous block IDs (`block-01` ... `block-12`);
- contiguous `orderIndex` values with no gaps or duplicates;
- exact trusted session/block cardinality;
- complete reconstruction through `parseProClubWeeklyTrainingDraft`.

Malformed, oversized, truncated, partial, or audit-divergent hierarchy data fails closed as `INVALID_DATA`; the UI must not render a partial football plan as valid.

## Failure states

Read operations normalize to:

- `FOUND`
- `MISSING`
- `PERMISSION_DENIED`
- `INVALID_DATA`
- `ERROR`

The UI shows generic safe failure copy and does not expose raw Firebase error payloads.

## Security / tenant invariants

- Club identity comes only from resolved `ProClubOrganizationAuthority.organizationId`.
- Actor identity comes only from resolved `ProClubOrganizationAuthority.userId`.
- No global/SuperAdmin bypass is added.
- No direct Firestore writes are added.
- No write fallback exists in the read adapter or browser component.
- A selected plan is re-bound to the same club and author before detail children are accepted.
- Switching organization/actor invalidates visible state and in-flight request generation.
- Oversized session results are rejected before block fan-out.
- Idempotent retries fail closed if receipt-bound hierarchy no longer exactly matches the original validated request.
- History queries are bounded and cursor-paginated.

## Explicitly out of scope

- loading a persisted DRAFT into an editable composer;
- existing-DRAFT update/reconciliation;
- delete/archive;
- submit/review/approve/publish lifecycle;
- Technical Director co-authoring/review UI;
- today's-session derivation/launcher;
- new Firestore Rules;
- new callable/function entrypoints;
- production deployment or production data mutation.

## Production safety

`FIRESTORE_RULES_CHANGED=NO`
`FIRESTORE_INDEX_CONFIG_CHANGED=YES_BRANCH_ONLY`
`FIREBASE_CONFIG_CHANGED=YES_BRANCH_ONLY`
`FUNCTIONS_ENTRYPOINT_CHANGED=NO`
`RUNTIME_CAPABILITY_CHANGED=NO`
`PRODUCTION_DEPLOYED=NO`
`PRODUCTION_CALLABLE_INVOKED=NO`
`PRODUCTION_DATA_WRITTEN=NO`
`BILLING_PLAN_CHANGED=NO`
`FORCE_PUSH=NO`
`DIRECT_MAIN_EDIT=NO`
