# FutVerse Pro Club Attendance V1 — Contract Freeze

Status: FROZEN FOR SPARK-FIRST IMPLEMENTATION

Baseline:
- base SHA: `9673aacd14a9bf8dc2ab423152e91952e933459b`
- production plan: Firebase Spark only
- upstream roster contract: `docs/PRO_CLUB_SQUAD_ROSTER_V1_CONTRACT_FREEZE.md`

## 1. Purpose

This contract freezes the minimum First Team training-attendance boundary required for Pro Club operations.

Attendance V1 MUST reuse the canonical Pro Club roster and existing Pro Club authority foundations. It MUST NOT create a second player source of truth, duplicate the player profile, or depend on Cloud Functions / Blaze infrastructure.

Implementation after this freeze follows:

`contract -> pure domain -> Firestore adapter + Rules -> Head Coach Attendance UI -> targeted tests -> independent review -> production activation`

This freeze slice is docs/tests only.

## 2. Reuse decisions

The current repository has no standalone Attendance runtime that can be safely reused as-is. Attendance V1 therefore reuses the reviewed shared foundations instead of inventing parallel identity or authorization systems:

- canonical Pro Club roster: `proClubs/{clubId}/players/{playerKey}`;
- canonical Pro Club Membership + staff authority;
- strict date/time conventions already used by Weekly Training;
- preservation-first audit conventions;
- direct Firestore protected by Firestore Rules on Firebase Spark.

The roster remains the source of truth for player identity and current squad membership.

## 3. Canonical Firestore paths

Attendance V1 uses:

- session: `proClubs/{clubId}/attendanceSessions/{attendanceSessionId}`
- player record: `proClubs/{clubId}/attendanceSessions/{attendanceSessionId}/records/{playerKey}`

Path identities MUST NOT be duplicated in stored payload fields as `clubId`, `attendanceSessionId`, `playerId`, or `playerKey`.

Attendance MUST NOT write attendance fields into `proClubs/{clubId}/players/{playerKey}`.

## 4. Stable attendance-session identity

V1 is First Team training attendance only.

`attendanceSessionId` is deterministic from the strict local training slot:

`training_{YYYY-MM-DD}_{HH-mm}`

Example:

`training_2026-09-15_17-30`

The corresponding stored `sessionDate` and `startTime` MUST represent the same slot.

A club MUST have at most one V1 First Team training-attendance session for the same exact date/time slot. Creating the same deterministic session twice is treated as the same session, not a second attendance event.

## 5. Session document contract

A V1 session document contains exactly:

- `schemaVersion: 1`
- `sessionDate: string` in strict `YYYY-MM-DD`
- `startTime: string` in strict 24-hour `HH:mm`
- `squadLabel: "First Team"`
- `sessionType: "TRAINING"`
- `createdAt: timestamp`
- `createdBy: uid`

The session identity fields are immutable after creation in V1.

Session update is not exposed in V1. Physical delete is forbidden.

## 6. Player attendance record contract

A V1 record document contains exactly:

- `schemaVersion: 1`
- `status: PRESENT | LATE | ABSENT | EXCUSED`
- `createdAt: timestamp`
- `createdBy: uid`
- `updatedAt: timestamp`
- `updatedBy: uid`

The record MUST NOT duplicate:

- player first/last name;
- FUTID;
- jersey number;
- position;
- squad label;
- medical or injury detail;
- free-text absence reason.

Player display data is resolved from the canonical roster by the path `playerKey`.

## 7. Canonical roster eligibility

Creating a new attendance record requires an existing canonical roster document at:

`proClubs/{clubId}/players/{playerKey}`

At record creation time the roster player MUST:

- exist in the same Pro Club;
- have `status == ACTIVE`;
- have `squadLabel == "First Team"`.

The Attendance UI candidate list MUST come from the same ACTIVE First Team roster. It MUST NOT fall back to Academy players, root `proPlayers`, or a global player search.

After an attendance record exists, later roster transition to INACTIVE or RELEASED does not erase historical attendance. Existing attendance may still be corrected by an authorized Head Coach because roster history is preservation-first and roster documents are not physically deleted.

## 8. Attendance status semantics

V1 freezes four operational states only:

- `PRESENT` — attended as expected;
- `LATE` — attended but arrived late;
- `ABSENT` — did not attend and no V1 excused marker is recorded;
- `EXCUSED` — did not attend and is operationally marked excused.

V1 deliberately stores no medical diagnosis, injury detail, or free-text reason in the attendance record.

Additional attendance categories require a separately reviewed additive contract.

## 9. Authority

Read/list requires the same canonical club-scoped chain used by Squad Roster V1:

- active FutVerse user;
- active Pro Club;
- active Membership for the same `clubId` and authenticated UID;
- active Pro Club staff assignment for that UID.

Session create and attendance-record create/update in V1 are restricted to an active `HEAD_COACH` for that same club.

Other active Pro Club staff are read-only in V1.

No client-side role value, Academy role, root `users.role`, support presentation state, or cached UI state may substitute for canonical Pro Club Membership + staff authority.

## 10. Preservation and audit invariants

Session create:

- `createdAt == request.time`
- `createdBy == request.auth.uid`

Session update: forbidden in V1.

Attendance-record create:

- `createdAt == request.time`
- `updatedAt == request.time`
- `createdBy == request.auth.uid`
- `updatedBy == request.auth.uid`

Attendance-record update:

- only `status`, `updatedAt`, and `updatedBy` may change;
- `schemaVersion`, `createdAt`, and `createdBy` are immutable;
- `updatedAt == request.time`;
- `updatedBy == request.auth.uid`.

Physical delete of either sessions or records is forbidden.
Unknown fields fail closed.

## 11. Weekly Training boundary

Weekly Training currently models sessions inside a plan by `sessionDate + startTime` and does not expose a stable per-session document identity that Attendance V1 can safely adopt.

Therefore V1 MUST NOT use a Weekly Training array index, mutable draft position, or client-only object identity as `attendanceSessionId`.

Attendance V1 may use the same date/time slot entered in Weekly Training, but it remains an independent canonical attendance record. V1 does not modify Weekly Training drafts and stores no reverse write into Weekly Training.

A future reviewed slice may add a stable linkage once Weekly Training exposes an appropriate immutable session reference.

## 12. Spark persistence boundary

Production persistence is direct Firestore protected by Firestore Rules.

Forbidden for V1:

- Cloud Functions;
- Cloud Run;
- Blaze-only infrastructure;
- root `proPlayers` as a roster fallback;
- Academy player-path writes;
- physical delete;
- client privilege bypass.

## 13. Head Coach UI scope

The first Attendance UI may:

- create/open a First Team training-attendance session for a strict date/time slot;
- list ACTIVE First Team roster players;
- mark each listed player PRESENT, LATE, ABSENT, or EXCUSED;
- update an existing attendance status;
- read historical attendance sessions and records.

The UI MUST NOT expose destructive delete.

Other staff roles remain read-only.

## 14. Match boundary

Attendance V1 does not modify Match Foundation or create match statistics.

The subsequent Pro Club Match slice MUST continue to use the same canonical roster `playerKey`. Attendance history may be consumed later for reporting, but Match V1 does not become a dependency of Attendance V1.

## 15. Preservation of existing production paths

This contract does not modify:

- Academy player paths or Academy authority;
- Pro Club Squad Roster production data;
- Player Identity / FUTID issuance;
- Weekly Training production flow;
- Match Foundation;
- Firestore Rules;
- Functions source or deployment configuration;
- production data.

This freeze slice is docs/tests only. Runtime, Rules, UI, deployment, and production writes require later reviewed slices and their own gates.
