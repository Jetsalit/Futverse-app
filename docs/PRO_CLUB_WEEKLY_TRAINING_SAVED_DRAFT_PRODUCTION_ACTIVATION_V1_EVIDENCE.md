# FutVerse — Pro Club Weekly Training Saved-DRAFT Production Activation V1 Evidence

## Purpose

This document records the reviewed production evidence required to activate Weekly Training Saved-DRAFT read/list/detail capability for Pro Club Head Coaches.

## Source baseline

- Repository: `Jetsalit/Futverse-app`
- Accepted main before activation PR: `baa2dde7309704ce94b990e7491733ff124b0896`
- Activation branch: `feat/pro-club-weekly-training-saved-draft-production-activation-v1`
- Index configuration blob: `000f54996ed441addfca1967ccbce8091692dbd8`
- Production project: `futverse-d7872`
- Database: `(default)`

## Production composite index deployment evidence

The reviewed `firestore.indexes.json` was deployed under separate explicit production authorization with target scope limited to `firestore:indexes`.

Production index:

- Index ID: `CICAgOjXh4EK`
- Collection group: `weeklyTrainingPlans`
- Query scope: `COLLECTION`
- State after build: `READY`
- Fields:
  - `authorUid ASCENDING`
  - `status ASCENDING`
  - `updatedAt DESCENDING`
  - `__name__ DESCENDING`

No Firestore Rules, Functions, or Hosting deployment was included in the index deployment operation.

## Independent read-only production query verification

After the index reported `READY`, a read-only Firestore `runQuery` probe was executed against a unique non-persisted sentinel path while preserving the exact first-page query shape used by the production Saved-DRAFT adapter:

- `authorUid == actorUid`
- `status == "DRAFT"`
- `updatedAt DESCENDING`
- document ID DESCENDING
- limit `21` (20 visible + 1 sentinel)

Verification result:

- HTTP query: PASS
- Index serving query: YES
- Query response items: 1
- Documents returned: 0
- Read time present: YES
- Production documents created: NO
- Production documents updated: NO
- Production documents deleted: NO

## Activation decision

The production infrastructure gate required by the Saved-DRAFT Read V1 contract is satisfied:

1. Reviewed index definition merged.
2. Exact index deployed to `futverse-d7872` under explicit production authorization.
3. Exact index verified `READY`.
4. Exact production read-only query shape verified successfully.
5. No production data mutation occurred during verification.

Therefore the source-controlled capability may be changed from:

`PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED = false`

to:

`PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED = true`

This activation remains subject to normal source review, independent review, regression testing, merge authorization, and a separately controlled Hosting release.

## Safety boundary

- Firestore Rules changed by activation PR: NO
- Firestore index config changed by activation PR: NO
- Functions changed by activation PR: NO
- Hosting config changed by activation PR: NO
- Production data mutation by activation PR: NO
- Production deployment by activation PR: NO
- Capability activation source change: YES
- Direct main edit: NO
- Force push: NO
