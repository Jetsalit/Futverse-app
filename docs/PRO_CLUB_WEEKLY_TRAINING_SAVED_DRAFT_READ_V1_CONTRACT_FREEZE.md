# Pro Club Weekly Training Saved-DRAFT Read V1 — Contract Freeze

## Purpose

Expose persisted Weekly Training DRAFTs to the active Head Coach as a read-only list and detail view, using the trusted server-written Firestore hierarchy.

This slice closes the immediate post-save visibility gap. It does **not** add edit/reconcile, delete, submit/review/approve/publish, Technical Director co-authoring, or any new write authority.

## Baseline

- Base `main`: `380050170ad6780c6854925bb6a44d2424fe265b`
- Predecessor: PR #122 merged Weekly Training fresh-DRAFT client/UI save.
- Existing Firestore Rules already allow active Pro Club members to read `weeklyTrainingPlans`, `sessions`, and `blocks`.
- No Firestore Rules change is required by this slice.

## Integrity remediation before production

Codex review on PR #123 identified that read-time contiguity alone cannot prove a hierarchy is complete when trailing children are missing. Because the Weekly Training server path has not been deployed to production, this slice upgrades the persisted hierarchy contract before production rather than carrying an ambiguous legacy format forward.

Canonical hierarchy documents use `schemaVersion == 2`:

- plan stores trusted `sessionCount` (1–14);
- each session stores trusted `blockCount` (1–12);
- blocks remain deterministic `block-01` through `block-12`;
- document count is unchanged: maximum 183 hierarchy documents;
- request-receipt schema remains independent and unchanged.

The trusted server computes cardinality directly from the already validated draft inside the same atomic transaction that creates the hierarchy. Client payload cardinality is never trusted.

## Idempotent retry integrity

A retry using the same actor/request ID MUST NOT return `COMPLETED` merely because the server-only request receipt still exists.

Before returning the original result, the trusted server revalidates the deterministic hierarchy bound to that receipt against the same validated request:

- receipt identity, actor, club, request fingerprint, document count, timestamp, and plan ID remain canonical;
- plan schema, football payload, `sessionCount`, author/status, and fresh-save audit metadata still match the original request;
- the sessions collection is bounded to `expected session count + 1` and must contain exactly the deterministic session IDs from the request;
- each persisted session must match schema v2, order, football payload, `blockCount`, and fresh-save audit metadata;
- each blocks collection is bounded to `expected block count + 1` and must contain exactly the deterministic block IDs from the request;
- each persisted block must match schema v2, order, football payload, coaching points, optional drill reference, and fresh-save audit metadata;
- missing, extra, altered, malformed, or audit-drift hierarchy state fails closed as `FAILED_PRECONDITION`.

This extra integrity read path runs only for an idempotent retry. The normal fresh-save path retains the existing atomic write behavior and document count.

## Runtime audience

V1 UI is exposed only when the resolved Pro Club authority is all of:

- organization type `PRO_CLUB`;
- organization status `ACTIVE`;
- membership status `ACTIVE`;
- canonical membership authority resolved active;
- effective staff role `HEAD_COACH`.

The list is further constrained to DRAFT plan documents authored by the current resolved Head Coach UID. The UI never accepts a free-form club ID or actor UID.

## Canonical read paths

- `proClubs/{clubId}/weeklyTrainingPlans/{planId}`
- `proClubs/{clubId}/weeklyTrainingPlans/{planId}/sessions/{sessionId}`
- `proClubs/{clubId}/weeklyTrainingPlans/{planId}/sessions/{sessionId}/blocks/{blockId}`

The request registry `weeklyTrainingDraftSaveRequests/{derivedKey}` is server-only idempotency state and is never read by this client slice.

## Read semantics

### List

The Firestore adapter queries the bound club's `weeklyTrainingPlans` collection for the current canonical `authorUid` and `status == DRAFT`.

Every returned plan must pass strict schema-v2 validation before display. Summaries are sorted by the full trusted Firestore timestamp tuple `(seconds, nanoseconds)` descending; `planId` is only a deterministic tie-breaker. ISO conversion is display-only and never used for integrity ordering.

### Detail

An exact detail request is accepted only for a plan ID selected from the Head Coach's own saved-DRAFT list. The adapter independently re-reads the plan and re-validates author/status before loading children.

The adapter reads sessions with a hard query limit of `sessionCount + 1`. If the returned count is not exactly `sessionCount`, it fails closed before any block fan-out.

Every session is then validated before block reads. Blocks are read with a hard query limit of `blockCount + 1`; each returned block collection must match the trusted `blockCount` exactly.

The pure read model additionally requires:

- schema version `2` at every hierarchy level;
- canonical field sets only;
- canonical Firestore audit fields;
- valid Firestore document identities;
- deterministic session IDs (`YYYY-MM-DD-HHmm`);
- deterministic contiguous block IDs (`block-01` ... `block-12`);
- contiguous `orderIndex` values with no gaps or duplicates;
- exact trusted session/block cardinality;
- valid trusted timestamps at full nanosecond precision;
- canonical actor IDs in audit metadata;
- complete reconstruction through `parseProClubWeeklyTrainingDraft`.

Malformed, oversized, truncated, or partial hierarchy data fails closed as `INVALID_DATA`; the UI must not render a partial football plan as valid.

## Timestamp boundary

Persisted `createdAt` / `updatedAt` values must expose Firestore-compatible integer `seconds` and `nanoseconds`. Nanoseconds must be within `0..999,999,999`.

Integrity comparisons use the tuple directly. `updatedAt` must not precede `createdAt`, including sub-millisecond differences. ISO strings are generated only for display.

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
- Idempotent retries fail closed if the receipt-bound hierarchy no longer exactly matches the original validated request.

## Explicitly out of scope

- loading a persisted DRAFT into an editable composer;
- existing-DRAFT update/reconciliation;
- delete/archive;
- submit/review/approve/publish lifecycle;
- Technical Director co-authoring/review UI;
- today's-session derivation/launcher;
- new Firestore Rules;
- new callable/function entrypoints;
- Firestore indexes/config changes;
- production deployment or production data mutation.

## Production safety

`FIRESTORE_RULES_CHANGED=NO`
`FUNCTIONS_ENTRYPOINT_CHANGED=NO`
`FIREBASE_CONFIG_CHANGED=NO`
`RUNTIME_CAPABILITY_CHANGED=NO`
`PRODUCTION_DEPLOYED=NO`
`PRODUCTION_CALLABLE_INVOKED=NO`
`PRODUCTION_DATA_WRITTEN=NO`
`BILLING_PLAN_CHANGED=NO`
`FORCE_PUSH=NO`
`DIRECT_MAIN_EDIT=NO`
