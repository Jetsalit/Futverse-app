# Pro Club Match + Starting XI Persistence V1 Contract Freeze

Status: CONTRACT / PURE DOMAIN ONLY

Parent UI adapter HEAD: `c2800eec3e31708b67896000d10305e0f3ac289e`

## 1. Purpose

Freeze the Pro Club Match identity and Starting XI persistence contract before any Firestore Rules, repository, runtime wiring, merge, deploy or production write.

This is the persistence prerequisite for the approved Pro Club 11v11 Starting XI Command Center.

## 2. Reuse the Match engine, not Academy storage

The existing transport-neutral Match lifecycle remains the conceptual foundation:

- DRAFT
- SCHEDULED
- IN_PROGRESS
- COMPLETED
- CANCELLED

The existing Academy adapter under `academies/{academyId}/matches` is not a Pro Club storage shortcut.

Pro Club receives an exact tenant-scoped adapter contract.

## 3. Canonical Pro Club paths

Authoritative Match:

`proClubs/{clubId}/matches/{matchId}`

Authoritative historical Match roster snapshots:

`proClubs/{clubId}/matches/{matchId}/roster/{playerKey}`

Current pre-match Starting XI plan:

`proClubs/{clubId}/matches/{matchId}/startingXI/current`

Penalty shootout order:

`proClubs/{clubId}/matches/{matchId}/shootout/current`

Future append-only Starting XI audit events:

`proClubs/{clubId}/matches/{matchId}/startingXIAudit/{eventId}`

No standalone/global Starting XI document may be persisted without an authoritative Pro Club Match.

## 4. Why Starting XI and shootout are separate

Starting XI is a pre-match selection artifact and becomes immutable when the Match enters `IN_PROGRESS`.

Penalty shootout order is operationally separate and may still be adjusted while the Match is `IN_PROGRESS`, because the need for kicks from the penalty mark may arise only after normal competition play.

Both become immutable at terminal Match states:

- COMPLETED
- CANCELLED

This avoids reopening the historical Starting XI just to prepare a shootout order.

## 5. Match roster snapshot boundary

Every player used by Starting XI, substitutes, set pieces or shootout must first exist in the authoritative Match roster snapshot.

Roster snapshots are created from the existing canonical Pro Club roster and preserve:

- `playerKey`
- FUTID or `null`
- real first/last name
- real jersey number
- primary position or `null`
- canonical additional positions

No missing FUTID or position may be fabricated.

The Match roster is historical evidence and must not silently follow later edits to the club roster.

## 6. Starting XI plan

The persisted Starting XI plan contains:

- schemaVersion
- formation
- exactly 11 lineup slots
- substitute player keys
- Position Role Assignments aligned to the 11 slots
- Set-Piece Duties
- coach/technical notes

A slot may remain `null` while the plan is a working pre-match DRAFT. A separately reviewed publish/finalize gate may require all 11 slots before match start.

No player may be duplicated between starter slots or substitutes.

All referenced player keys must exist in the Match roster snapshot.

## 7. Shootout plan

The shootout document contains:

- primary takers 1–5
- up to five backups

A player may appear only once.

Every taker must exist in the authoritative Match squad.

The shootout plan is not the same as the ordinary in-match `PENALTY` set-piece duty.

## 8. Football authority

Starting XI / Match-plan authoring target:

- ACTIVE HEAD_COACH
- ACTIVE TECHNICAL_DIRECTOR

with exact-club ACTIVE membership authority.

`OWNER` alone does not grant football authoring. An OWNER may author only when the same user also holds an eligible active staff role.

Tenant authorization remains separate from football staff authority.

## 9. Lifecycle mutation rules

Starting XI mutable:

- DRAFT
- SCHEDULED

Starting XI immutable:

- IN_PROGRESS
- COMPLETED
- CANCELLED

Shootout order mutable:

- DRAFT
- SCHEDULED
- IN_PROGRESS

Shootout order immutable:

- COMPLETED
- CANCELLED

Terminal Match evidence must not be destructively deleted through this V1 contract.

## 10. Audit requirements for future repository activation

Every production write must later preserve actor provenance:

- createdAt / createdBy
- updatedAt / updatedBy
- actor staff role
- exact clubId + matchId path authority

Starting XI change events should be append-only once audit persistence is implemented.

No audit-history hard delete is part of V1.

## 11. Concurrency and stale-write rule

Future repository writes must use an atomic transaction or equivalent compare-and-write guard.

The write must fail closed when the authoritative Match status or expected plan version changed after the user loaded the screen.

A stale client must never silently overwrite another staff member's newer Starting XI.

## 12. Preservation boundary

This contract phase must not modify:

- `firestore.rules`
- Firebase configs
- Academy Match repository
- Academy StartingXIBuilder
- Pro Club production dashboard
- Pro Club production data
- Membership
- FUTID
- Functions
- Hosting

No deploy and no Blaze dependency.

## 13. Next implementation order

1. Firestore Rules + emulator contract for Pro Club Match / roster / Starting XI / shootout.
2. Spark-compatible Pro Club Match repository.
3. Starting XI repository with concurrency guards and audit provenance.
4. Controlled UI wiring to Pro Club dashboard.
5. Exact-head regression.
6. Controlled Firestore Rules deploy.
7. Controlled Spark Hosting deploy.
8. Production smoke.

Each activation remains separately gated. This document does not itself authorize any production write.
