# FutVerse — Pro Club Weekly Training Production Activation V1 Contract Freeze

## Purpose

Freeze the production-activation boundary for **Head Coach fresh Weekly Training DRAFT creation only** before any production write path is enabled.

This slice is contract/audit only. It does not activate production saving, does not deploy anything, and does not authorize production data mutation.

## Exact baseline

- Repository: `Jetsalit/Futverse-app`
- Accepted baseline branch: `main`
- Accepted baseline SHA: `c1742e2437a6e747c236fa49e4da50437b5d873d`
- Baseline includes PR #151 Weekly Training Firestore Rules expression-budget hardening.
- Contract branch: `feat/pro-club-weekly-training-production-activation-v1-contract`

`SCOPE=DOCS_TESTS_ONLY`

Exactly two new files are authorized for this slice:

1. `docs/PRO_CLUB_WEEKLY_TRAINING_PRODUCTION_ACTIVATION_V1_CONTRACT_FREEZE.md`
2. `tests/proClubWeeklyTrainingProductionActivationV1Contract.test.ts`

No other file is authorized in this contract slice.

## Product scope frozen

V1 production activation targets only an already-resolved active Pro Club Head Coach creating one **fresh** Weekly Training DRAFT.

Required runtime audience remains all of:

- organization type `PRO_CLUB`;
- organization status `ACTIVE`;
- membership status `ACTIVE`;
- canonical membership authority active;
- staff role `HEAD_COACH`.

The existing composer must remain a fresh-DRAFT surface. Loading a saved DRAFT into the composer is not authorized.

`HEAD_COACH_FRESH_DRAFT_CREATE=IN_SCOPE`
`EXISTING_DRAFT_EDIT=FORBIDDEN`
`EXISTING_DRAFT_RECONCILE=FORBIDDEN`
`DELETE_ARCHIVE=FORBIDDEN`
`SUBMIT_REVIEW_APPROVE_PUBLISH=FORBIDDEN`
`TECHNICAL_DIRECTOR_COAUTHOR=FORBIDDEN`

## Baseline audit — current production blocker

### 1. Current browser save path is function-backed and production-fail-closed

`src/components/pro-club/operations/WeeklyTrainingDraftComposer.tsx` gates save availability with `FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE`.

`src/lib/proClubWeeklyTrainingDraftSaveClient.ts` calls the callable `saveProClubWeeklyTrainingDraftV1`.

`src/config/runtimeCapabilities.ts` intentionally defines `FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE` from Vite dev-server presence only. Every deployable production build is fail-closed.

That capability is generic Pro Club function-backed browser availability, not a Weekly Training-only switch.

Therefore:

`GENERIC_FUNCTION_CAPABILITY_PRODUCTION_FLIP=FORBIDDEN`

Production activation must not enable unrelated function-backed Pro Club modules as a side effect.

### 2. Spark production release remains Hosting-only

`firebase.spark.json` contains Hosting only. This contract does not authorize adding Functions, Firestore deployment, billing changes, or another production service to that file.

`SPARK_HOSTING_BOUNDARY=PRESERVE`
`BILLING_CHANGE=NOT_AUTHORIZED`
`FUNCTIONS_PRODUCTION_ENABLEMENT=NOT_AUTHORIZED`

### 3. Trusted fresh-save persistence and browser Rules are not currently schema-equivalent

The trusted save service in `functions/src/proClubWeeklyTrainingDraftSave/service.ts` persists Weekly Training hierarchy schema version `2`, including trusted hierarchy cardinality (`sessionCount`, `blockCount`) and a server-only idempotency receipt in `weeklyTrainingDraftSaveRequests`.

Saved-DRAFT read/list/detail V1 treats schema-v2 hierarchy and exact fresh-save audit/cardinality parity as authoritative production data.

The current browser-write Firestore Rules surface in `firestore.rules` validates Weekly Training plan/session/block documents as schema version `1` and does not represent the schema-v2 hierarchy cardinality contract.

Therefore a direct browser write cannot be substituted for the callable merely by changing the UI gate.

`SCHEMA_V1_BROWSER_WRITE_AS_PRODUCTION_PATH=FORBIDDEN`
`SCHEMA_V2_READ_CONTRACT_MUST_BE_PRESERVED=YES`

### 4. Fresh-save retry/failure semantics must not regress

The accepted trusted save path has a stable request identity and server-side idempotency receipt. A production replacement must not create duplicate plans after an ambiguous network result and must not expose a partially-created hierarchy as a valid saved DRAFT.

Before any production write activation, the implementation must prove all of:

- one logical save cannot create two valid DRAFT plans;
- retry after ambiguous transport outcome is safe;
- changed payload under the same logical request fails closed;
- schema-v2 plan/session/block hierarchy remains canonical;
- fresh-save audit parity remains canonical;
- malformed or partial hierarchy is never accepted by Saved-DRAFT read;
- tenant and actor identity remain bound to resolved authority, never free-form UI input.

`IDEMPOTENCY_REGRESSION=FORBIDDEN`
`PARTIAL_VALID_DRAFT=FORBIDDEN`

## Dedicated activation requirement

Production activation must use a **Weekly Training fresh-DRAFT-specific capability/path**. It must not reuse a generic switch that changes other Pro Club modules.

The future implementation branch must introduce the narrowest possible production boundary and keep fail-closed behavior until exact production evidence exists.

`DEDICATED_WEEKLY_TRAINING_PRODUCTION_CAPABILITY=REQUIRED`
`UNRELATED_PRO_CLUB_MODULE_CHANGE=FORBIDDEN`

## Implementation decision gate

This contract intentionally does not authorize implementation yet. Before runtime code changes, an exact-head implementation design must demonstrate a Spark-compatible path that preserves the accepted schema-v2 Saved-DRAFT contract and safe retry/failure behavior.

A proposed implementation is unacceptable if it requires any of the following without a separate explicitly reviewed contract change:

- enabling generic function-backed Pro Club production behavior;
- silently changing saved-DRAFT schema v2 back to schema v1;
- opening existing-DRAFT editing;
- weakening Head Coach / active membership / technical-governance authority;
- allowing partial hierarchy to appear as a valid DRAFT;
- changing Academy behavior or unrelated Pro Club modules.

## Required pre-merge gate

The exact contract HEAD must answer the FutVerse five-question gate:

1. INPUT — contract assertions match current source and do not authorize unsafe free-form actor/tenant input.
2. AUTHORIZATION — Head Coach fresh-DRAFT scope only; no edit-existing or unrelated authority expansion.
3. SECRET — no secret, token, credential, private key, `.env`, or production credential material.
4. DEPENDENCY — `N/A (NO CHANGE)`; no dependency manifest or lockfile change.
5. FAILURE_BEHAVIOR — production remains fail-closed; no deploy/write is performed by this slice.

Any `FAIL`, `UNKNOWN`, or `NOT TESTED` means `MERGE=STOP`.

## Safety boundary

- `src/**`: unchanged
- `functions/**`: unchanged
- `firestore.rules`: unchanged
- `firestore.indexes.json`: unchanged
- `firebase.json`: unchanged
- `firebase.spark.json`: unchanged
- dependency manifests / lockfiles: unchanged
- production deploy: NO
- production HTTP/callable invocation: NO
- production Firestore write: NO
- billing change: NO
- reset: NO
- force push: NO

`RUNTIME_IMPLEMENTATION=NOT_AUTHORIZED`
`PRODUCTION_DEPLOY_AUTHORIZATION=NOT_GRANTED`
`PRODUCTION_DATA_WRITE_AUTHORIZATION=NOT_GRANTED`
`MERGE_AUTHORIZATION=NOT_GRANTED`

## Next slice after acceptance

After exact-head contract verification and independent review pass, the next branch may implement only the minimum **Head Coach fresh-DRAFT production persistence foundation** needed to satisfy this contract. Existing-DRAFT edit/reconcile remains a separate later slice.
