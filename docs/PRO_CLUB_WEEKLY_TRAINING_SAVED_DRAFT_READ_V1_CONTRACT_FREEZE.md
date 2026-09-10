# Pro Club Weekly Training Saved-DRAFT Read V1 — Contract Freeze

## Purpose

Expose persisted Weekly Training DRAFTs to the active Head Coach as a read-only list and detail view, using the canonical Firestore hierarchy already created by the reviewed server-mediated fresh-save flow.

This slice closes the immediate post-save visibility gap. It does **not** add edit/reconcile, delete, submit/review/approve/publish, Technical Director co-authoring, or any new write authority.

## Baseline

- Base `main`: `380050170ad6780c6854925bb6a44d2424fe265b`
- Predecessor: PR #122 merged Weekly Training fresh-DRAFT client/UI save.
- Existing Firestore Rules already allow active Pro Club members to read `weeklyTrainingPlans`, `sessions`, and `blocks`.
- No Firestore Rules change is required by this slice.

## Runtime audience

V1 UI is exposed only when the resolved Pro Club authority is all of:

- organization type `PRO_CLUB`;
- organization status `ACTIVE`;
- membership status `ACTIVE`;
- canonical membership authority resolved active;
- effective staff role `HEAD_COACH`.

The list is further constrained to DRAFT plan documents authored by the current resolved Head Coach UID. The UI never accepts a free-form club ID or actor UID.

## Canonical read paths

Plan list / exact plan:

`proClubs/{clubId}/weeklyTrainingPlans/{planId}`

Sessions:

`proClubs/{clubId}/weeklyTrainingPlans/{planId}/sessions/{sessionId}`

Blocks:

`proClubs/{clubId}/weeklyTrainingPlans/{planId}/sessions/{sessionId}/blocks/{blockId}`

The request registry `weeklyTrainingDraftSaveRequests/{derivedKey}` is server-only idempotency state and is never read by this client slice.

## Read semantics

### List

The Firestore adapter queries the bound club's `weeklyTrainingPlans` collection for the current canonical `authorUid` and `status == DRAFT`.

Every returned plan must pass strict persisted-schema validation before display. The client then sorts valid DRAFT summaries by trusted `updatedAt` descending, with `planId` as a deterministic tie-breaker.

### Detail

An exact detail request is accepted only for a plan ID selected from the Head Coach's own saved-DRAFT list. The adapter still independently re-reads the plan and verifies `authorUid` equals the bound Head Coach UID before loading children.

The adapter reads every session and every block under that plan. The pure read model requires:

- schema version `1` at every level;
- canonical plan/session/block field sets only;
- canonical Firestore audit fields;
- valid Firestore document identities;
- deterministic session document IDs (`YYYY-MM-DD-HHmm`);
- deterministic contiguous block document IDs (`block-01` ... `block-12`);
- contiguous `orderIndex` values with no gaps or duplicates;
- 1–14 sessions;
- 1–12 blocks per session;
- valid trusted timestamps;
- canonical actor IDs in audit metadata;
- complete reconstruction through `parseProClubWeeklyTrainingDraft`.

Malformed or partial hierarchy data fails closed as `INVALID_DATA`; the UI must not render a partial football plan as if it were valid.

## Timestamp boundary

Persisted `createdAt` / `updatedAt` values must expose Firestore-compatible integer `seconds` and `nanoseconds` values. Nanoseconds must be within `0..999,999,999`. `updatedAt` must not precede `createdAt`.

The read model converts only validated timestamp values to ISO strings for display. Raw timestamp objects are not exposed to the UI model.

## Failure states

Read operations normalize to:

- `FOUND`
- `MISSING` (detail only; also used when an exact plan is not authored by the bound Head Coach)
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
- Switching organization/actor invalidates the visible list/detail state and starts a new bounded read.

## Explicitly out of scope

- loading a persisted DRAFT into an editable composer;
- existing-DRAFT update/reconciliation;
- delete/archive;
- submit/review/approve/publish lifecycle;
- Technical Director co-authoring/review UI;
- today's-session derivation/launcher;
- new Firestore Rules;
- new Functions/callables;
- Firestore indexes/config changes;
- production deployment or production data mutation.

## Production safety

`FIRESTORE_RULES_CHANGED=NO`
`FUNCTIONS_SOURCE_CHANGED=NO`
`FUNCTIONS_INDEX_CHANGED=NO`
`FIREBASE_CONFIG_CHANGED=NO`
`RUNTIME_CAPABILITY_CHANGED=NO`
`PRODUCTION_DEPLOYED=NO`
`PRODUCTION_CALLABLE_INVOKED=NO`
`PRODUCTION_DATA_WRITTEN=NO`
`BILLING_PLAN_CHANGED=NO`
`FORCE_PUSH=NO`
`DIRECT_MAIN_EDIT=NO`
