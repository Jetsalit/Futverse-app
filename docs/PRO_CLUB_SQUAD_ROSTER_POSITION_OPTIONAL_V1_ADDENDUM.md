# FutVerse Pro Club Squad Roster — Optional Position V1 Addendum

Status: REVIEWED EXTENSION CANDIDATE

Baseline contract: `docs/PRO_CLUB_SQUAD_ROSTER_V1_CONTRACT_FREEZE.md`

## Purpose

Real Pro Club roster entry can have a confirmed player name and jersey number before the coaching staff has confirmed the player's canonical playing position. FutVerse must not invent a football position solely to satisfy the roster form.

## Extension

The existing `position` field remains present in every Pro Club roster document, but its value may be either:

- one canonical position code from the shared `playerPositionSelection.ts` model; or
- `null` while the primary position is not yet confirmed.

`null` is not a canonical football position and must never be represented by fake codes such as `UNKNOWN`, `UNSPECIFIED`, or an empty string in Firestore.

While `position == null`, `additionalPositions` must be an empty array. Additional positions may be recorded only after a canonical primary position is selected.

## Compatibility and preservation

Existing roster records with canonical positions remain valid and unchanged. No migration is required.

The extension does not change:

- the canonical path `proClubs/{clubId}/players/{playerKey}`;
- schema version 1 or the document key set;
- FUTID issuance or binding authority;
- Head Coach mutation authority;
- ACTIVE / INACTIVE / RELEASED lifecycle;
- preservation-first no-delete behavior;
- Academy player storage or authority;
- Attendance or Match persistence contracts.

The Spark production boundary remains direct Firestore protected by Firestore Rules. No Cloud Functions, Cloud Run, or Blaze-only infrastructure is introduced.
