# FutVerse — Pro Club Weekly Training Production Persistence Foundation V1 Design/Audit

## Status

`DESIGN_STAGE=FEASIBILITY_PROBE_ONLY`
`RUNTIME_ACTIVATION=NOT_AUTHORIZED`
`PRODUCTION_DEPLOY=NOT_AUTHORIZED`
`PRODUCTION_DATA_WRITE=NOT_AUTHORIZED`
`MERGE=NOT_AUTHORIZED`

This design is stacked from the independently verified Production Activation V1 contract HEAD:

- exact parent: `9ac3596ab091a534d11a43523a65760a0d939c6f`
- implementation branch: `feat/pro-club-weekly-training-production-activation-v1-foundation`
- parent contract: PR #152
- exact-head verification: PR #153 / verification run `34667340005` PASS

The goal of this slice is to prove or reject a Spark-compatible persistence foundation before any product/runtime source or production Rules are changed.

## Frozen product boundary

Only this user action is in scope:

> active Pro Club Head Coach creates one fresh Weekly Training DRAFT.

Still forbidden:

- edit an existing DRAFT;
- reconcile by overwriting an existing DRAFT;
- delete/archive;
- submit/review/approve/publish;
- Technical Director co-authoring;
- generic Pro Club function-backed production enablement;
- Academy changes;
- unrelated Pro Club module changes.

## Baseline findings

### Trusted path today

The accepted callable service provides strong semantics:

- Admin SDK transaction;
- schema-v2 plan/session/block hierarchy;
- trusted `sessionCount` / `blockCount`;
- server-side request receipt;
- stable request identity and payload fingerprint;
- exact actor/club authority checks;
- atomic hierarchy creation;
- safe same-request retry;
- changed payload under the same request fails closed.

That callable is intentionally unavailable in the Spark production browser build. Enabling the generic `FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE` switch is forbidden because it would widen unrelated Pro Club production capability.

### Direct browser Rules today

The existing root Rules browser-write contract is schema v1. It is not schema-equivalent to the accepted schema-v2 Saved-DRAFT read contract and cannot be activated for production by only changing a UI gate.

The legacy v1 Rules also contain update authorization. This foundation does not use that v1 surface and does not widen it. The new production path must be schema-v2 create-only so a persisted schema-v2 DRAFT cannot be edited through this path.

### Saved-DRAFT integrity today

The read/detail adapter already fails closed when persisted cardinality disagrees with trusted metadata:

- plan `sessionCount` must equal the number of session documents;
- each session `blockCount` must equal the number of block documents;
- session ordering must be contiguous;
- schema-v2 audit binding must match the plan;
- malformed detail returns `INVALID_DATA`.

This behavior remains authoritative and must not be weakened.

## Candidate architecture

### 1. Dedicated production capability only

Future runtime wiring must introduce a Weekly-Training-specific capability, for example:

`PRO_CLUB_WEEKLY_TRAINING_FRESH_DRAFT_PRODUCTION_AVAILABLE`

It must not modify the meaning of `FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE`.

Production default remains false until the exact Firestore Rules version for this path has been separately deployed and verified.

### 2. Deterministic logical save identity

The client-generated UUID-v4 request ID becomes the `planId` for the Spark production path.

Consequences:

- one logical request has one deterministic plan path;
- an ambiguous retry cannot choose a second plan path;
- a changed payload cannot overwrite the original because schema-v2 update is denied;
- reconciliation can read exactly one known plan ID.

`PLAN_ID=requestId`

### 3. One atomic batch for the legitimate application path

A legitimate fresh save writes one Firestore `WriteBatch` containing:

1. one immutable create-request manifest;
2. one schema-v2 plan;
3. 1–14 schema-v2 sessions;
4. 1–12 schema-v2 blocks per session.

Maximum accepted domain shape:

- plan: 1
- sessions: 14
- blocks: 168
- create-request manifest: 1
- total maximum batch documents: **184**

The existing accepted hierarchy itself remains 183 documents maximum; the manifest is outside the Saved-DRAFT hierarchy.

The application must not split a legitimate fresh save across multiple commits. If any write in the batch is denied or fails, the entire legitimate application commit must fail.

### 4. Same-batch manifest

Candidate path:

`proClubs/{clubId}/weeklyTrainingDraftCreateRequests/{planId}`

The manifest is not a user-facing DRAFT document. It is immutable create-only control data.

Minimum fields:

- `schemaVersion: 1`
- `requestId: planId`
- `planId`
- `actorUid`
- `weekStartDate`
- `sessionCount`
- `documentCount`
- `createdAt`
- `createdBy`

Manifest creation performs the expensive canonical authority checks:

- authenticated user is ACTIVE;
- Pro Club is ACTIVE;
- actor membership is ACTIVE;
- actor staff is ACTIVE HEAD_COACH;
- technical governance is ACTIVE;
- governance authority membership/staff binding is ACTIVE and role-consistent;
- projected plan exists in the same batch and matches actor/week/session count.

Every schema-v2 plan/session/block create must bind to the projected manifest with `getAfter()` and require:

- same `planId`;
- same authenticated `actorUid`;
- manifest `createdAt == request.time`;
- document audit `createdAt == updatedAt == request.time`;
- document `createdBy == updatedBy == request.auth.uid`.

A later request therefore cannot append to or mutate the accepted schema-v2 DRAFT through this path because the old manifest timestamp cannot equal the new request time, while update/delete remains denied.

### 5. Schema-v2 only

The production candidate writes exactly the already-accepted schema-v2 hierarchy produced by `buildProClubWeeklyTrainingDraftWrite`:

- plan has `sessionCount`;
- sessions have `blockCount`;
- deterministic session and block paths are retained by the application builder;
- Technical Director note remains forbidden for Head Coach fresh create;
- optional-field presence semantics remain unchanged.

No schema-v1 production fallback is allowed.

### 6. Create-only security behavior

For the new schema-v2 browser path:

- `create`: only via the fresh-save manifest contract;
- `update`: denied;
- `delete`: denied.

This is a security boundary, not only a UI choice.

The legacy schema-v1 update surface is not selected by the dedicated production client and is not expanded by this foundation. Any later decision to remove legacy v1 update authority is a separate compatibility/hardening slice.

## Idempotency and ambiguous-result protocol

The production client must keep one request ID locked to one normalized payload.

### First attempt

1. Parse/normalize the draft using the accepted domain parser.
2. Build the schema-v2 persistence bundle.
3. Set `planId = requestId`.
4. Commit manifest + full hierarchy in one batch.
5. On success, return `COMPLETED`.

### Ambiguous or rejected commit

Do not generate a new request ID automatically.

Read the deterministic Saved-DRAFT detail for `{clubId, actorUid, planId}`.

- `FOUND` and canonical payload exactly equals the locked normalized payload -> return `COMPLETED`.
- `FOUND` but canonical payload differs -> `FAILED_PRECONDITION`; never overwrite.
- `INVALID_DATA` -> fail closed; never overwrite.
- `PERMISSION_DENIED` -> fail closed and surface authority loss.
- `MISSING` after a transport-ambiguous result -> retain the same request ID and permit an explicit/safe retry of the same create batch.

A second commit against an already-created schema-v2 plan/manifest is expected to be denied as an update; reconciliation, not overwrite, converts that outcome into idempotent success.

## Tenant and actor authority

The production client must never accept a free-form actor UID.

- `actorUid` comes from Firebase Auth / resolved organization authority.
- `clubId` comes from the resolved active Pro Club runtime.
- the draft payload `authorUid` is not trusted as authority by itself;
- Rules bind author/audit to `request.auth.uid`;
- wrong-club or non-Head-Coach callers fail closed.

SUPERADMIN status alone does not grant this Head Coach write authority.

## Atomicity and partial hierarchy

For the official application path, all hierarchy writes occur in one atomic batch. A failed legitimate commit cannot leave only part of that batch committed.

The Saved-DRAFT detail reader remains a second integrity boundary: any out-of-contract/malformed hierarchy whose stored cardinality does not match children is `INVALID_DATA` and must never be loaded into the composer as a valid DRAFT.

### Explicit browser-adversary limitation

Firestore Rules cannot enumerate an arbitrary child collection or directly assert the total number of writes in a batch. Therefore this client-only design does **not** claim that Rules can mathematically prove that a malicious already-authorized Head Coach included every declared child document merely from the plan metadata.

The security guarantee is instead:

- unauthorized actors/tenants cannot use the path;
- schema-v2 accepted documents are create-only;
- the official client performs one atomic full-hierarchy batch;
- malformed/partial detail fails the existing Saved-DRAFT cardinality/integrity reader.

If the threat model later requires Rules to prove full cross-collection completeness against a malicious authorized Head Coach, this single-batch design is insufficient; use a trusted server or a separately reviewed multi-stage proof-tree protocol. Production activation must not misrepresent this limitation.

## Firestore feasibility constraints to prove

The design is not accepted by prose alone. An isolated Emulator feasibility probe must prove:

1. maximum `14 x 12` shape commits with 184 writes;
2. same-batch `getAfter()` Rules remain within actual Rules access-call budget;
3. actor ACTIVE + membership ACTIVE + HEAD_COACH + governance binding are enforced;
4. inactive club is rejected;
5. Assistant Coach and SUPERADMIN outsider are rejected;
6. wrong audit/actor child causes the entire batch to roll back;
7. schema-v2 plan/session/block update and delete are denied;
8. a later attempt cannot append a child using an old manifest;
9. duplicate same-request commit cannot overwrite the existing hierarchy;
10. changed payload under the same request cannot overwrite the existing hierarchy.

Any failure means this candidate architecture is rejected before runtime implementation.

## Request-size and write-count guard

The app must enforce existing domain bounds before constructing the batch. The feasibility suite must build the exact max domain shape.

The implementation must additionally retain a conservative client-side document-count guard:

`hierarchyDocumentCount <= 183`

`batchDocumentCount <= 184`

No new unbounded collection fan-out is permitted.

## Production rollout sequence

Even after Emulator feasibility PASS, production stays fail-closed.

Required sequence:

1. design/feasibility exact-head review;
2. implement dedicated schema-v2 batch client + reconciliation while production capability remains false;
3. independent exact-head implementation review;
4. separately authorize and deploy the exact Firestore Rules revision;
5. verify deployed Rules with production-safe read-only/denial evidence;
6. only then flip the dedicated Weekly Training production capability;
7. run one controlled real Head Coach fresh-DRAFT smoke;
8. existing-DRAFT edit remains closed.

Because `firebase.spark.json` is Hosting-only, this slice does not silently add Functions or another billed production service.

## Rejected alternatives

### Flip generic function-backed capability

Rejected: unrelated Pro Club modules could become production-enabled.

### Use existing schema-v1 browser writes

Rejected: incompatible with schema-v2 Saved-DRAFT authority/cardinality contract and regresses the accepted persistence model.

### Multiple ordinary writes without an atomic boundary

Rejected: transport/process failure could leave a partial hierarchy from the official application path.

### New request ID after ambiguous result

Rejected: can create duplicate logical DRAFTs.

### Client-provided digest as a security proof

Rejected: a client-calculated hash is useful for comparison but is not a trusted server-side proof when the same client controls both payload and digest.

## Five-question design gate

- INPUT: PASS candidate — normalized bounded schema-v2 input; plan/request identity deterministic and validated.
- AUTHORIZATION: PASS candidate — canonical ACTIVE account/club/membership/HEAD_COACH/governance binding in manifest Rules; children same-batch-bound to that manifest.
- SECRET: PASS — no credential or secret required by this architecture.
- DEPENDENCY: PASS/N-A — uses existing Firebase Web SDK and Emulator tooling; no dependency change required.
- FAILURE_BEHAVIOR: PASS candidate — official path atomic; ambiguous result reconciles deterministic immutable plan; mismatch/invalid data fails closed.

These statuses remain **candidate**, not final, until the max-shape Emulator feasibility test passes on exact HEAD.

`DESIGN_ACCEPTANCE=REQUIRES_EMULATOR_PASS`
