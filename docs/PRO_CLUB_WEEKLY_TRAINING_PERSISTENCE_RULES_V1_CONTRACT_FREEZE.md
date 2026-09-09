# Pro Club Weekly Training Persistence / Rules V1 — Contract Freeze

## Status

Foundation only. This slice does **not** deploy Firestore Rules, call production HTTP endpoints, or write production data.

`firestore.rules` remains unchanged in this foundation slice. Security behavior is proven first against an isolated Firestore Emulator rules fixture. Production-rules integration is a separate reviewed slice.

## Canonical paths

Weekly plan:

`proClubs/{clubId}/weeklyTrainingPlans/{planId}`

Current technical authority snapshot:

`proClubs/{clubId}/technicalGovernance/current`

Canonical membership and staff evidence remain:

`proClubs/{clubId}/members/{uid}`

`proClubs/{clubId}/staff/{uid}`

Academy paths and repositories MUST NOT be reused for Pro Club weekly training.

## Identity and authority invariants

1. `clubId`, `planId`, and actor UID are path/request identities. A client payload must not be trusted to grant authority.
2. A Weekly Training write requires all of the following at the exact same `clubId`:
   - signed-in actor;
   - `users/{uid}.status` is `ACTIVE` or `Active`;
   - canonical membership exists and has `status == ACTIVE`;
   - canonical staff assignment exists and has `status == ACTIVE`;
   - actor staff role is `HEAD_COACH` or `TECHNICAL_DIRECTOR` where the action requires that role;
   - current technical authority is read only from `technicalGovernance/current`.
3. Staff assignment alone never grants tenant authority.
4. Global `users.role`, Academy authority, and SUPERADMIN labels do not bypass Pro Club tenant authority.
5. `technicalGovernance/current` is a trusted authority snapshot. V1 client create/update/delete is denied.
6. Rules MUST NOT attempt to infer AUTO authority by listing the club staff collection.

## Foundation write boundary

This foundation proves only the safest persistent write:

- `HEAD_COACH` may create their own `DRAFT` weekly plan.
- The author may update content while the stored and requested status both remain `DRAFT`.
- Cross-author edits are denied.
- Cross-club evidence is denied.
- Inactive account, membership, or staff evidence is denied.
- Staff-only users without ACTIVE canonical Membership are denied.
- Client transition away from `DRAFT` is denied in this foundation.
- Client delete is denied.

Technical Director co-authoring and lifecycle transitions (`SUBMITTED`, `IN_REVIEW`, `NEEDS_REVISION`, `APPROVED`, `PUBLISHED`) remain intentionally closed until the atomic transition + historical provenance contract is connected.

## Weekly plan V1 stored envelope

A draft document contains only:

- `schemaVersion: 1`
- `authorUid`
- `status: DRAFT`
- `weekStartDate`
- `squadLabel`
- `mainObjective`
- optional `secondaryObjective`
- optional `headCoachNote`
- `sessions`
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`

Path identity is canonical, so the document does not duplicate `clubId` or `planId`.

The domain parser in `src/lib/proClubWeeklyTraining.ts` remains authoritative for deep session/block shape validation before repository writes. Firestore Rules independently enforce tenant/actor authority, immutable creator identity, lifecycle state, allowed top-level keys, timestamps, and bounded top-level values. Deep arbitrary-array iteration is not treated as an authorization mechanism.

## Timestamp contract

On create:

- `createdAt == request.time`
- `updatedAt == request.time`
- `createdBy == request.auth.uid`
- `updatedBy == request.auth.uid`

On DRAFT update:

- `createdAt`, `createdBy`, `authorUid`, and `schemaVersion` are immutable;
- `updatedAt == request.time`;
- `updatedBy == request.auth.uid`.

## Read boundary

Foundation read access requires ACTIVE canonical Membership in the exact club. Relationship evidence rules elsewhere remain unchanged; weekly technical work is not readable merely because an inactive historical relationship document exists.

## Repository boundary

`src/lib/firestore/proClubWeeklyTrainingPersistence.ts` is a path/envelope foundation only. It must:

- construct Pro Club paths only;
- reject padded/path-like identifiers;
- build a path-derived DRAFT envelope from a domain-valid weekly plan;
- never call Academy repositories;
- contain no production HTTP or deployment behavior.

## Deferred

Deferred to later reviewed slices:

- integration into root `firestore.rules`;
- canonical governance snapshot writer/control-plane;
- TD co-author writes;
- submit/review/revision/approve/publish atomic transitions;
- append-only historical action evidence;
- production repository write adapter;
- editable UI wiring;
- production rollout.

## Production safety

- `PRODUCTION_DEPLOYED=NO`
- `PRODUCTION_HTTP_CALLED=NO`
- `PRODUCTION_DATA_WRITTEN=NO`
