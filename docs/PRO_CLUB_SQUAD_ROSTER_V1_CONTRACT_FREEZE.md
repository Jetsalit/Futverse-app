# FutVerse Pro Club Squad Roster V1 — Contract Freeze

Status: FROZEN FOR SPARK-FIRST IMPLEMENTATION

Baseline:
- base SHA: `5cf9c4e693a4d9528409e63266ec8816baf17178`
- production plan: Firebase Spark only

## 1. Purpose

This contract freezes the minimum first-team Squad/Roster boundary required for Pro Club league operations.
It adapts the existing Academy player-management foundations instead of creating a second unrelated player system.

Implementation after this freeze must follow:

`reuse Academy/shared -> add only Pro Club gap -> Rules/domain -> Firestore adapter -> Head Coach Squad UI -> targeted tests -> independent review`

No Cloud Functions or Blaze dependency is permitted.

## 2. Academy-first reuse decisions

V1 MUST reuse or extract shared logic from the existing Academy path for:
- player list/search/filter interaction patterns;
- canonical player position codes;
- additional-position validation;
- canonical document mapping conventions;
- date-only handling where relevant.

V1 MUST reuse the existing lifelong Player Identity / FUTID validation foundation where a FUTID is present.

V1 MUST NOT use root `proPlayers` as the Pro Club tenant source of truth.

Academy persistence remains unchanged. Pro Club does not become an Academy and there is no Academy fallback when a Pro Club roster record is missing.

## 3. Canonical path

The authoritative Pro Club roster path is:

- `proClubs/{clubId}/players/{playerKey}`

`clubId` and `playerKey` are Firestore path identity and MUST NOT be duplicated in the stored payload as `id`, `clubId`, `playerId`, or `playerKey`.

The tenant roster document represents the player's current relationship to that Pro Club. It does not replace the lifelong global Player Identity record.

## 4. Persisted fields

Every V1 roster document contains exactly:

- `schemaVersion: 1`
- `futId: string | null`
- `firstName: string`
- `lastName: string`
- `position: canonical position code`
- `additionalPositions: canonical position code[]`
- `jerseyNumber: integer 0..99`
- `squadLabel: string`
- `status: ACTIVE | INACTIVE | RELEASED`
- `createdAt: timestamp`
- `createdBy: uid`
- `updatedAt: timestamp`
- `updatedBy: uid`

No medical detail, attendance state, match statistics, fitness state, contract terms, derived age, or base64 avatar belongs in this roster document.

## 5. Shared position contract

`position` and `additionalPositions` MUST use the existing shared canonical position model from `src/lib/playerPositionSelection.ts`.

Additional positions:
- remain bounded by the existing shared maximum;
- cannot duplicate the primary position;
- cannot contain duplicates;
- must all be supported canonical positions.

## 6. FUTID binding

`futId` may be `null` for a provisional roster record.

A non-null FUTID MUST:
- satisfy the existing issued FUTID V1 format;
- resolve through `futIdRegistry/{futId}`;
- map to the exact roster document `playerKey`.

An existing non-null FUTID is immutable in V1.
A later update MAY bind `null -> valid FUTID` only when the registry already maps that FUTID to the exact `playerKey`.
Replacing one non-null FUTID with another is forbidden.

V1 does not issue FUTIDs. Existing SuperAdmin-only identity issuance remains authoritative.

## 7. Authority

Read/list requires the same club-scoped authority chain:
- active FutVerse user;
- active Pro Club;
- active Membership for the same `clubId` and authenticated UID;
- active Pro Club staff assignment for that UID.

Create/update in V1 is restricted to an active `HEAD_COACH` for that same club.

No client-side role value, Academy role, root `users.role`, or presentation/support state may substitute for canonical Pro Club Membership + staff authority.

## 8. Lifecycle

Create starts as `ACTIVE`.

Allowed transitions:
- `ACTIVE -> ACTIVE | INACTIVE | RELEASED`
- `INACTIVE -> INACTIVE | ACTIVE | RELEASED`
- `RELEASED -> RELEASED` only

`RELEASED` is terminal in V1.

Physical delete is forbidden. Roster history is preservation-first.

## 9. Audit invariants

Create:
- `createdAt == request.time`
- `updatedAt == request.time`
- `createdBy == request.auth.uid`
- `updatedBy == request.auth.uid`

Update:
- `createdAt` immutable
- `createdBy` immutable
- `updatedAt == request.time`
- `updatedBy == request.auth.uid`

Unknown fields fail closed.

## 10. Spark persistence boundary

The production path is direct Firestore protected by Firestore Rules.

Forbidden for V1:
- Cloud Functions
- Cloud Run
- Blaze-only infrastructure
- root `proPlayers` as tenant source of truth
- delete operations
- client privilege bypass

## 11. Head Coach UI scope

The first Pro Club Squad UI may:
- list the current club roster;
- search/filter locally;
- add a roster player;
- edit roster football fields;
- bind a valid existing FUTID when permitted;
- transition ACTIVE/INACTIVE/RELEASED according to the lifecycle contract.

The UI MUST NOT expose destructive delete.

Other staff roles remain read-only or unavailable until separately reviewed.

## 12. Downstream reuse

Attendance and Match slices MUST reference this canonical Pro Club roster rather than create another player source of truth.

Attendance references `playerKey` and does not duplicate the player profile.

Match roster snapshots may copy only the minimum match-time display fields required by the shared Match model while retaining the canonical Pro Club player reference.

## 13. Preservation

This contract does not modify:
- Academy player paths or Academy authority;
- global Player Identity/FUTID issuance;
- Weekly Training production flow;
- production data;
- Functions source or deployment configuration.

This freeze slice is docs/tests only. Runtime, Rules, deployment, and production writes require later reviewed slices and their own gates.
