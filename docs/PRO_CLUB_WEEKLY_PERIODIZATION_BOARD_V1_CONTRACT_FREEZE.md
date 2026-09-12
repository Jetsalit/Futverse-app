# Pro Club Weekly Periodization Board V1 — Contract Freeze

## Status and scope

- Accepted baseline SHA: `df831012032a61139a18a401d7c9ba74cbfe5690`
- `SCOPE=CONTRACT_TESTS_ONLY`
- `BOARD_V1=READ_ONLY`
- `BOARD_V1=PRESENTATION_DERIVATION_ONLY`
- `BOARD_IMPLEMENTATION=NOT_INCLUDED`
- `MERGE_AUTHORIZATION=NOT_GRANTED`
- `PRODUCTION_ACTIVATION=OUT_OF_SCOPE`

This freeze defines a future Weekly Periodization Board without implementing it. Board V1 is a read-only presentation and derivation layer over the already validated Saved-DRAFT read result. It creates no runtime capability and owns no persistence.

## Canonical source and reuse boundary

The sole source of truth for Board V1 is `WeeklyTrainingSavedDraftDetail.draft`.

`SAVED_DRAFT_READ_MODEL=REUSE_UNCHANGED`
`SAVED_DRAFT_READ_ADAPTER=REUSE_UNCHANGED`
`FRESH_DRAFT_PRODUCTION_CREATION=UNCHANGED`
`EXISTING_DRAFT_EDITING=CLOSED`

The existing Pro Club Weekly Training Saved-DRAFT read model remains responsible for reconstructing and validating the canonical draft. The future Board must consume that validated value; it must not read around the model, introduce an alternate adapter, or reinterpret persisted documents independently.

The Board may derive or display only these existing draft values:

- `weekStartDate`
- `squadLabel`
- `mainObjective`
- `secondaryObjective`
- `sessionDate`
- `startTime`
- `location`
- `objective`
- `phaseOfPlay`
- `plannedLoad`
- session `durationMinutes`
- training `blocks`
- `blockType`
- block `title`
- block `durationMinutes`
- optional `drillReference`
- `coachingPoints`

`objective` and `phaseOfPlay` may be combined or labeled only as presentation-derived focus. Their canonical meaning and values must remain unchanged, and no derived focus may be written back to persistence.

## Load vocabulary

The canonical `plannedLoad` values remain exactly:

1. `LOW`
2. `MODERATE`
3. `HIGH`

`PLANNED_LOAD_CANONICAL_VALUES=LOW|MODERATE|HIGH`
`NEW_PERSISTED_INTENSITY_OR_LOAD_FIELD=FORBIDDEN`

No new persisted `intensity`, `load`, `trainingLoad`, or equivalent field is permitted.

## Authoritative timeline and Match Day boundary

Actual `sessionDate`, calendar date, and day-of-week are the authoritative V1 timeline.

`V1_TIMELINE=ACTUAL_SESSION_DATE|CALENDAR_DATE|DAY_OF_WEEK`
`AUTHORITATIVE_MATCH_DATE_SOURCE=ABSENT`
`MD_LABELS=FORBIDDEN_WITHOUT_AUTHORITATIVE_MATCH_DATE`
`MATCH_COMPETITION_CALENDAR=FUTURE_SEPARATELY_REVIEWED_CONTRACT`

Board V1 must not synthesize, infer, assume, or hard-code any of `MD-4`, `MD-3`, `MD-2`, `MD-1`, `MD`, or `MD+1`. In particular, it must not derive an MD label from `weekStartDate`, position within a week, a weekday, an assumed Saturday/Sunday match, or any hard-coded match date. An MD notation requires a separately reviewed Pro Club Match / Competition Calendar contract and an authoritative match-date anchor.

## Authority boundary

The Saved-DRAFT read authority remains unchanged. Board V1 is eligible only when the resolved authority has all of:

- `organizationType == PRO_CLUB`
- `organizationStatus == ACTIVE`
- `membershipStatus == ACTIVE`
- `hasMembershipAuthority == true`
- effective role `HEAD_COACH`

`BOARD_AUTHORITY=EXISTING_HEAD_COACH_SAVED_DRAFT_READ_AUTHORITY`
`CLUB_IDENTITY=RESOLVED_ORGANIZATION_MEMBERSHIP_AUTHORITY_ONLY`
`ACTOR_IDENTITY=AUTHENTICATED_RESOLVED_AUTHORITY_ONLY`

Club identity must come from resolved organization/membership authority. Actor identity must come from authenticated/resolved authority. There is no free-form `clubId` or `actorUid` authorization path.

This phase introduces no SuperAdmin bypass, Technical Director access, Assistant Coach access, staff-role expansion, client-side privilege bypass, or alternate authorization route.

`SUPERADMIN_BYPASS=FORBIDDEN`
`TECHNICAL_DIRECTOR_ACCESS_EXPANSION=FORBIDDEN`
`ASSISTANT_COACH_OR_STAFF_ROLE_EXPANSION=FORBIDDEN`
`FREE_FORM_CLUB_ID_OR_ACTOR_UID=FORBIDDEN`

## Read-only and no-persistence boundary

Board V1 must not save, update, patch, edit, reconcile, delete, archive, submit, review, approve, or publish a DRAFT.

`NEW_PERSISTENCE=FORBIDDEN`
`FIRESTORE_SCHEMA_CHANGE=FORBIDDEN`
`FIRESTORE_PATH_CHANGE=FORBIDDEN`
`NEW_WRITE_AUTHORITY=FORBIDDEN`
`EXISTING_DRAFT_UPDATE=FORBIDDEN`
`EXISTING_DRAFT_RECONCILE=FORBIDDEN`
`EXISTING_DRAFT_DELETE_ARCHIVE=FORBIDDEN`
`SUBMIT_REVIEW_APPROVE_PUBLISH=FORBIDDEN`
`NEW_CALLABLE_OR_FUNCTION_MUTATION_PATH=FORBIDDEN`

No Firestore collection, document hierarchy, document, persisted Weekly Training field, write path, callable, Function, HTTP mutation endpoint, or production service integration may be added by this phase. Existing fresh-DRAFT persistence and the Saved-DRAFT read path remain unchanged.

## Future derivation boundary

Any future Board transformation from `WeeklyTrainingSavedDraftDetail.draft` must be pure and deterministic: the same canonical draft produces the same presentation result.

`FUTURE_BOARD_TRANSFORMATION=PURE|DETERMINISTIC|NO_IO`

The transformation must perform no IO. It must not read from or write to Firestore, Storage, Functions, HTTP endpoints, clocks, random sources, browser persistence, or any production service. In particular, it must never write to Firestore, Storage, Functions, HTTP mutation endpoints, or production data.

## Frozen legacy and runtime boundary

`src/components/WeeklyPeriodization.tsx` is frozen. It is not the authoritative Pro Club Weekly Training surface and must not become the persistence owner, receive Pro Club persistence wiring, be migrated, or change placeholder behavior in this phase.

`LEGACY_WEEKLY_PERIODIZATION_COMPONENT=FROZEN_NOT_AUTHORITATIVE`
`PRO_CLUB_PORTAL_RUNTIME_SHELL=NOT_ACTIVATED_OR_EXPANDED`
`RUNTIME_CAPABILITY_FILES=FROZEN`
`FIRESTORE_RULES=FROZEN`
`FIRESTORE_INDEXES=FROZEN`
`FIREBASE_CONFIGURATION=FROZEN`
`CLOUD_FUNCTIONS_AND_CALLABLES=FROZEN`

All existing Pro Club onboarding, membership, organization authority, organization runtime, authentication, authorization, and account-status gating code remains frozen.

## Preserved Weekly Training behavior

This contract changes none of the following:

- schema-v2 Weekly Training hierarchy behavior (`schemaVersion == 2`);
- request-receipt and idempotency behavior;
- tenant and club binding;
- authenticated actor binding;
- immutable fresh-save snapshot behavior;
- Saved-DRAFT canonical reconstruction and validation;
- Saved-DRAFT bounded pagination and authoritative read ordering;
- fresh-DRAFT production persistence;
- Saved-DRAFT Firestore read adapter;
- runtime capability values or production activation boundaries.

`WEEKLY_TRAINING_SCHEMA_VERSION_BEHAVIOR=UNCHANGED_SCHEMA_VERSION_2`
`IDEMPOTENCY_BEHAVIOR=UNCHANGED`
`TENANT_CLUB_BINDING=UNCHANGED`
`ACTOR_BINDING=UNCHANGED`
`IMMUTABLE_FRESH_SAVE_SNAPSHOT=UNCHANGED`
`SAVED_DRAFT_CANONICAL_RECONSTRUCTION=UNCHANGED`
`SAVED_DRAFT_PAGINATION_READ_BEHAVIOR=UNCHANGED`
`RUNTIME_PRODUCTION_ACTIVATION_BOUNDARIES=UNCHANGED`

## Explicitly out of scope

- Board implementation or production UI wiring
- editing, updating, reconciling, deleting, or archiving an existing DRAFT
- submit/review/approve/publish lifecycle
- Technical Director co-authoring
- Today's Session launcher or active-session selection
- attendance or match-preparation persistence
- match repository or competition-calendar persistence
- new Firestore collections, documents, Rules, or indexes
- Firebase configuration changes
- Cloud Functions or callable changes
- Operations shell activation
- production capability activation, deployment, callable invocation, or data mutation

## Safety declaration

`FIRESTORE_RULES_CHANGED=NO`
`FIRESTORE_INDEXES_CHANGED=NO`
`FIREBASE_CONFIG_CHANGED=NO`
`FUNCTIONS_CHANGED=NO`
`RUNTIME_CAPABILITY_CHANGED=NO`
`IMPLEMENTATION_SOURCE_CHANGED=NO`
`DEPLOY_PERFORMED=NO`
`PRODUCTION_CALLABLE_INVOKED=NO`
`PRODUCTION_DATA_WRITE=NO`
