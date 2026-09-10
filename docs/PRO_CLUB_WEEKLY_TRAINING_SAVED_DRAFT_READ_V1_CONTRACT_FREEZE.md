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

## Optional plan-field absence semantics

Trusted fresh-save omits optional plan text fields when no value exists. Therefore persisted schema-v2 snapshots MUST preserve exact presence semantics:

- absent `secondaryObjective` means the field is not stored at all;
- absent `headCoachNote` means the field is not stored at all;
- if either field is present, it must be a non-empty canonical string with no leading/trailing whitespace and within its existing length bound;
- present empty strings, whitespace-only strings, `null`, or values that require normalization are corrupted persisted state and fail closed;
- read validation and idempotent retry must agree on the same absence/presence contract.

## Idempotent retry integrity

A retry using the same actor/request ID MUST NOT return `COMPLETED` merely because the server-only request receipt still exists.

Before returning the original result, the trusted server revalidates the deterministic receipt-bound hierarchy against the same validated request:

- receipt identity, actor, club, request fingerprint, document count, timestamp, and plan ID remain canonical;
- plan schema, football payload, `sessionCount`, author/status, optional-field presence, and fresh-save audit metadata still match the original request;
- sessions read is bounded to `expected session count + 1` and must contain exactly the deterministic session IDs from the request;
- each session must match schema v2, order, football payload, `blockCount`, and fresh-save audit metadata;
- each blocks read is bounded to `expected block count + 1` and must contain exactly the deterministic block IDs from the request;
- each block must match schema v2, order, football payload, coaching points, optional drill reference, and fresh-save audit metadata;
- missing, extra, altered, malformed, normalized-drift, or audit-drift hierarchy state fails closed as `FAILED_PRECONDITION`.

This extra integrity read path runs only for an idempotent retry. The normal fresh-save path retains the existing atomic write behavior and document count.

## Runtime audience

V1 read UI is eligible only when the resolved Pro Club authority is all of:

- organization type `PRO_CLUB`;
- organization status `ACTIVE`;
- membership status `ACTIVE`;
- canonical membership authority resolved active;
- effective staff role `HEAD_COACH`.

In addition, production mounting requires the explicit saved-DRAFT index capability described below. The list is constrained to DRAFT plan documents authored by the current resolved Head Coach UID. The UI never accepts a free-form club ID or actor UID.

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
- authoritative server ordering: `updatedAt DESC`, then Firestore document ID DESC;
- cursor: exact `(updatedAt.seconds, updatedAt.nanoseconds, planId)` from the twentieth query document when a sentinel exists;
- next page: `startAfter` the exact cursor;
- UI action: explicit `Load more saved drafts`;
- refresh: resets cursor and reloads the first page;
- append: de-duplicates by `planId` to avoid duplicate display after retries/races.

The browser MUST preserve the Firestore query order. It MUST NOT re-sort page results with locale-sensitive or independently implemented document-key comparison before deriving the cursor. Every visible plan still passes strict schema-v2 validation before rendering, but validation must be order-preserving.

## Exact persisted payload parity

The domain parser remains responsible for domain validity, but schema-v2 saved documents must also be canonical persisted snapshots. Read-time validation MUST compare parsed canonical output back to the raw stored values for every persisted football field.

This includes, at minimum:

- plan required text plus exact optional-field presence/absence;
- session `sessionDate`, `startTime`, `location`, `objective`, `phaseOfPlay`, `plannedLoad`, `durationMinutes`;
- block `blockType`, `title`, `durationMinutes`, optional `drillReference`, and every `coachingPoints` item.

A value that would only become valid after trimming or other parser normalization is corrupted persisted state and must fail closed as `INVALID_DATA`. The detail-read path and idempotent-retry path must therefore agree on canonical payload integrity.

## Firestore index contract

The paginated history query requires a declared composite index for collection `weeklyTrainingPlans`:

1. `authorUid ASCENDING`
2. `status ASCENDING`
3. `updatedAt DESCENDING`
4. `__name__ DESCENDING`

The index is version-controlled in `firestore.indexes.json`, and `firebase.json` references that file.

## Production index activation gate

The approved Spark production release remains Hosting-only by design. `firebase.spark.json` MUST NOT be expanded to deploy Firestore resources merely to make this feature work.

Therefore Saved-DRAFT history is fail-closed in production until a separate, explicitly authorized production index operation has completed. The activation sequence is:

1. merge/review the index definition without enabling production Saved-DRAFT history;
2. under a separate production authorization, deploy the reviewed `firestore.indexes.json` to the pinned project `futverse-d7872`;
3. verify that the exact composite index reports ready/serving and that a read-only production query verification succeeds;
4. only after steps 2–3 succeed, make a separate reviewed source change setting `PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED` to `true`;
5. only then may the normal Hosting-only release publish a production build that mounts `WeeklyTrainingSavedDrafts`.

The capability is intentionally source-controlled and cannot be enabled by a Vite/runtime environment variable. In DEV/emulator it remains available for testing. When the production capability is false, the Head Coach workspace renders an informational pending card and does not mount or execute the saved-DRAFT history query.

This PR does **not** deploy the index and keeps `PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED == false`.

## Detail semantics

An exact detail request is accepted only for a plan ID selected from the Head Coach's own saved-DRAFT list. The adapter independently re-reads the plan and re-validates author/status/audit before loading children.

The adapter reads sessions with a hard query limit of `sessionCount + 1`. If the returned count is not exactly `sessionCount`, it fails closed before any block fan-out.

Every session is validated, including fresh-save audit parity and exact persisted payload parity, before block reads. Blocks are read with a hard query limit of `blockCount + 1`; each returned block collection must match trusted cardinality, canonical payload, and audit parity exactly.

The pure read model additionally requires:

- schema version `2` at every hierarchy level;
- canonical field sets only;
- immutable fresh-save audit parity;
- exact raw-to-canonical payload parity;
- exact optional plan-field presence/absence;
- valid Firestore document identities;
- deterministic session IDs (`YYYY-MM-DD-HHmm`);
- deterministic contiguous block IDs (`block-01` ... `block-12`);
- contiguous `orderIndex` values with no gaps or duplicates;
- exact trusted session/block cardinality;
- complete reconstruction through `parseProClubWeeklyTrainingDraft`.

Malformed, oversized, truncated, partial, normalized-drift, or audit-divergent hierarchy data fails closed as `INVALID_DATA`; the UI must not render a partial or silently normalized football plan as valid.

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
- History queries are bounded and cursor-paginated using authoritative Firestore order.
- Browser list validation is order-preserving and does not implement a second document-key comparator.
- Production Saved-DRAFT history remains unavailable until the reviewed index has been deployed and independently verified.
- Spark Hosting-only deployment cannot bypass the source-controlled index capability.

## Explicitly out of scope

- loading a persisted DRAFT into an editable composer;
- existing-DRAFT update/reconciliation;
- delete/archive;
- submit/review/approve/publish lifecycle;
- Technical Director co-authoring/review UI;
- today's-session derivation/launcher;
- new Firestore Rules;
- new callable/function entrypoints;
- production index deployment;
- production capability activation;
- production deployment or production data mutation.

## Production safety

`FIRESTORE_RULES_CHANGED=NO`
`FIRESTORE_INDEX_CONFIG_CHANGED=YES_BRANCH_ONLY`
`FIREBASE_CONFIG_CHANGED=YES_BRANCH_ONLY`
`FUNCTIONS_ENTRYPOINT_CHANGED=NO`
`RUNTIME_CAPABILITY_CHANGED=YES_BRANCH_ONLY_FAIL_CLOSED`
`PRODUCTION_SAVED_DRAFT_READ_ENABLED=NO`
`PRODUCTION_INDEX_DEPLOYED=NO`
`PRODUCTION_DEPLOYED=NO`
`PRODUCTION_CALLABLE_INVOKED=NO`
`PRODUCTION_DATA_WRITTEN=NO`
`BILLING_PLAN_CHANGED=NO`
`FORCE_PUSH=NO`
`DIRECT_MAIN_EDIT=NO`