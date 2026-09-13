# Pro Club Weekly Training Existing-DRAFT Edit V1 Contract

Accepted baseline SHA: `96cab027a8f1d8c9db5a95e2912d22bf6c6f891e`

`SCOPE=CONTRACT_AND_TARGETED_TEST_ONLY`

`RUNTIME_IMPLEMENTATION=NOT_AUTHORIZED`

`CAPABILITY_STATUS=CLOSED_NOT_IMPLEMENTED`

`PRODUCTION_WRITE=FORBIDDEN`

`DEPLOYMENT=FORBIDDEN`

## 1. Purpose

This contract freezes the minimum-safe behavior for a future Head Coach flow:

`Saved Weekly Training DRAFT -> open validated existing DRAFT -> edit allowed content -> save updated DRAFT`

Slice A creates governance evidence only. It does not authorize or implement a
Firestore Rules change, persistence writer, update client, editor UI, capability
activation, deployment, or production mutation.

## 2. Exact authority and target binding

Every future Existing-DRAFT Edit V1 attempt MUST require all of:

- `organizationType=PRO_CLUB`
- `organizationStatus=ACTIVE`
- `membershipStatus=ACTIVE`
- `hasMembershipAuthority=true`
- `staffRole=HEAD_COACH`

`AUTHORITY_SCOPE=ACTIVE_PRO_CLUB_ACTIVE_MEMBERSHIP_VALID_MEMBERSHIP_AUTHORITY_HEAD_COACH_ONLY`

The target MUST be an existing Weekly Training plan inside the current Pro Club,
with `authorUid` equal to the current authenticated actor UID, `status=DRAFT`,
and `schemaVersion=2`. The complete stored hierarchy MUST pass the current
canonical Saved-DRAFT validation before it may enter the editor.

`TARGET_DRAFT=CURRENT_CLUB_CURRENT_HEAD_COACH_OWN_SCHEMA_V2_DRAFT`

`DRAFT_STATUS_BEFORE=DRAFT`

`DRAFT_STATUS_AFTER=DRAFT`

The future Rules and persistence boundary MUST enforce the authority and target
binding independently of the UI. Client-supplied organization, actor, role, or
ownership claims never grant authority.

Explicitly denied:

- cross-club edit;
- arbitrary `planId` edit;
- another Head Coach's DRAFT;
- Assistant Coach edit;
- Technical Director edit or co-authoring;
- SuperAdmin bypass or override;
- inactive or rejected/suspended user access;
- inactive club or membership;
- inactive, revoked, invalid, or mismatched staff authority;
- client authority spoofing or tenant bypass.

## 3. Fixed-shape hierarchy

Existing-DRAFT Edit V1 is a fixed-shape content edit only.

`HIERARCHY_SHAPE=FIXED`

`SESSION_CREATE=FORBIDDEN`

`SESSION_DELETE=FORBIDDEN`

`SESSION_REORDER=FORBIDDEN`

`BLOCK_CREATE=FORBIDDEN`

`BLOCK_DELETE=FORBIDDEN`

`BLOCK_REORDER=FORBIDDEN`

`HIERARCHY_APPEND=FORBIDDEN`

`HIERARCHY_CARDINALITY_CHANGE=FORBIDDEN`

Plan, session, and block document identities MUST remain exactly those of the
validated base snapshot. Structural editing is deferred to a separately frozen
future scope.

## 4. Mutable canonical content

Only the following content fields may change. Every value MUST continue to pass
the current canonical Weekly Training validation and storage bounds.

### Plan

- `squadLabel`
- `mainObjective`
- optional `secondaryObjective`
- optional `headCoachNote`

`MUTABLE_PLAN_FIELDS=squadLabel,mainObjective,secondaryObjective,headCoachNote`

### Existing session

- `location`
- `objective`
- `phaseOfPlay`
- `plannedLoad`
- `durationMinutes`

`MUTABLE_SESSION_FIELDS=location,objective,phaseOfPlay,plannedLoad,durationMinutes`

### Existing block

- `blockType`
- `title`
- `durationMinutes`
- optional `drillReference`
- `coachingPoints`

`MUTABLE_BLOCK_FIELDS=blockType,title,durationMinutes,drillReference,coachingPoints`

This permission changes stored references only. It does not authorize Drill
Library mutation or any other module capability.

## 5. Immutable identity, lifecycle, and creation audit

The following MUST remain immutable.

### Tenant and path identity

- `clubId`;
- `planId`;
- every session document ID;
- every block document ID.

### Plan

- `schemaVersion`;
- `status=DRAFT`;
- `authorUid`;
- `weekStartDate`;
- `sessionCount`;
- `createdAt`;
- `createdBy`;
- original Fresh-DRAFT request identity;
- create manifest identity;
- callable receipt identity.

### Session

- `orderIndex`;
- `sessionDate`;
- `startTime`;
- `blockCount`;
- `createdAt`;
- `createdBy`.

### Block

- `orderIndex`;
- `createdAt`;
- `createdBy`.

`IMMUTABLE_CREATION_AUDIT=createdAt,createdBy`

`LIFECYCLE_TRANSITION=FORBIDDEN`

`STATUS_MUST_REMAIN=DRAFT`

`updatedAt` and `updatedBy` MUST NOT be editable form inputs. A future approved
implementation MUST derive them from trusted server/authority state:
`updatedAt` is server-derived and `updatedBy` is the currently authorized Head
Coach UID.

## 6. Optimistic concurrency

The editor MUST open only from a validated Saved-DRAFT snapshot. Its base
concurrency evidence is the exact expected plan `updatedAt` plus coherent audit
metadata across the complete base hierarchy.

`CONCURRENCY_TOKEN=EXPECTED_PLAN_UPDATED_AT`

`BASE_REQUIREMENT=HIERARCHY_WIDE_AUDIT_COHERENCE`

Before any future write, one transaction MUST read current state and establish:

1. the plan is still the same schema-v2 own DRAFT;
2. current plan `updatedAt` exactly equals the editor's expected `updatedAt`;
3. all session/block identities and cardinalities equal the validated snapshot;
4. the current hierarchy audit remains coherent; and
5. the current Head Coach authority remains valid.

If any check is stale, ambiguous, malformed, or incoherent:

`STALE_RESULT=CONFLICT`

`STALE_WRITE_COUNT=0`

`INCOHERENT_RESULT=CONFLICT`

`CONFLICT_BEHAVIOR=FAIL_CLOSED_NO_OVERWRITE`

Slice A does not create a revision or version subsystem.

`REVISION_VERSION_SUBSYSTEM=NOT_AUTHORIZED`

## 7. Future atomic update boundary

A successful future edit MUST update the complete existing hierarchy within the
current canonical storage/cardinality bounds in one atomic transaction:

- update the plan;
- update every existing session;
- update every existing block;
- create no hierarchy document;
- delete no hierarchy document;
- append no hierarchy document;
- preserve all immutable fields;
- modify no Fresh-DRAFT manifest or receipt; and
- apply one coherent update audit across the hierarchy, with server-derived
  `updatedAt` and `updatedBy` equal to the authorized Head Coach UID.

`ATOMIC_UPDATE_SCOPE=THE_COMPLETE_EXISTING_HIERARCHY_WITHIN_THE_CURRENT_CANONICAL_STORAGE_CARDINALITY_BOUNDS`

`HIERARCHY_CREATE=FORBIDDEN`

`HIERARCHY_DELETE=FORBIDDEN`

`HIERARCHY_APPEND_ON_UPDATE=FORBIDDEN`

`CREATE_MANIFEST_MUTATION=FORBIDDEN`

`CALLABLE_RECEIPT_MUTATION=FORBIDDEN`

`UPDATE_AUDIT=HIERARCHY_WIDE_COHERENT_SERVER_DERIVED`

## 8. Ambiguous-result reconciliation

An ambiguous transport result MUST NOT trigger a blind retry or overwrite. The
future client MUST read back and validate the complete hierarchy.

It may classify the edit as committed only when tenant/path identities,
immutable fields, authority binding, every mutable canonical value, hierarchy
identities/cardinalities, and hierarchy-wide updated audit all match the
intended update, and `updatedBy` is the authorized actor.

The client MUST NOT predict the exact server request time. Any state that does
not match the complete intended canonical content MUST fail closed as a conflict
without automatic overwrite.

`AMBIGUOUS_RESULT=READ_BACK_COMPLETE_HIERARCHY`

`AMBIGUOUS_SUCCESS=EXACT_INTENDED_CANONICAL_STATE_ONLY`

`AMBIGUOUS_BLIND_RETRY=FORBIDDEN`

`AMBIGUOUS_AUTOMATIC_OVERWRITE=FORBIDDEN`

## 9. Fresh-DRAFT preservation

Existing-DRAFT edit MUST NOT alter Fresh-DRAFT deterministic request identity,
`planId=requestId`, create manifest, callable receipt, create fingerprint, or
Fresh-DRAFT ambiguous-save reconciliation.

After a legitimate existing-DRAFT edit, retrying the original Fresh-DRAFT
request may no longer match its original payload. That retry MUST fail closed
under the existing contract. Existing-edit logic MUST NOT restore or overwrite
the edited DRAFT with the original create payload.

`FRESH_DRAFT_BEHAVIOR=PRESERVED`

`PLAN_ID_EQUALS_ORIGINAL_REQUEST_ID=PRESERVED`

`ORIGINAL_CREATE_RETRY_AFTER_EDIT=FAIL_CLOSED_ON_PAYLOAD_MISMATCH`

`RESTORE_ORIGINAL_CREATE_PAYLOAD=FORBIDDEN`

## 10. Saved-DRAFT read-model evolution

The current read model treats schema-v2 data as a fresh snapshot whose creation
and update audits have exact parity. A future separately reviewed slice MUST
evolve that model deliberately so that:

- an untouched fresh DRAFT remains valid;
- a legitimately edited schema-v2 DRAFT is valid;
- `createdAt` and `createdBy` remain immutable;
- `updatedAt` and `updatedBy` advance only as one coherent hierarchy audit;
- partial hierarchy audit updates fail closed;
- mixed-actor or mixed-timestamp hierarchy updates fail closed; and
- malformed data or structural drift fails closed.

`READ_MODEL_CHANGE_IN_SLICE_A=FORBIDDEN`

`UNTOUCHED_FRESH_DRAFT_VALIDITY=PRESERVE`

`LEGITIMATE_EDITED_SCHEMA_V2_DRAFT_VALIDITY=REQUIRED_FOR_FUTURE_IMPLEMENTATION`

`PARTIAL_OR_MIXED_UPDATE_AUDIT=FAIL_CLOSED`

## 11. Dedicated capability and activation boundary

Existing-DRAFT Edit V1 requires its own dedicated production capability in a
future slice. It MUST NOT inherit activation from the generic Pro Club
Function-backed capability, Fresh-DRAFT create capability, Saved-DRAFT read
capability, or legacy schema-v1 update capability.

`DEDICATED_EXISTING_DRAFT_EDIT_CAPABILITY=REQUIRED`

`DEDICATED_EXISTING_DRAFT_EDIT_CAPABILITY_STATUS=CLOSED_NOT_IMPLEMENTED`

`CAPABILITY_INHERITANCE=FORBIDDEN`

`FIRESTORE_RULES_IMPLEMENTATION_IN_SLICE_A=FORBIDDEN`

`FIRESTORE_RULES_DEPLOY=FORBIDDEN`

`PRODUCTION_DATA_MUTATION=FORBIDDEN`

## 12. Explicitly deferred scope

This contract does not authorize delete, archive, publish, approve, submit,
finalize, lifecycle transition, session/block structural editing, Technical
Director co-authoring, Assistant Coach editing, SuperAdmin override, Take
Attendance, Drill Library mutation, Match or Player modules, Monthly planning,
dependency changes, global localization work, or unrelated redesign.

`EXISTING_DRAFT_EDIT_V1_SLICE_A=CONTRACT_ONLY`

`IMPLEMENTATION_AUTHORIZATION=NOT_GRANTED`

`COMMIT_AUTHORIZATION=NOT_GRANTED`
