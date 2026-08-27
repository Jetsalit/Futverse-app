# FutVerse Player Identity Foundation V1 — Architecture Freeze

Status: P1A TEST-FIRST FREEZE

Baseline:

- main: 2526451177e7fc808c2a5d3de95721ebf329857f
- implementation branch: feat/player-identity-foundation-v1

## 1. Purpose

Player Identity Foundation V1 introduces the missing lifelong identity
boundary required to preserve one footballer across Academy, Pro Club,
transfers and future career stages.

This phase does not implement Player Profile or Player CV UI.

The invariant is:

1 footballer
=
1 immutable internal playerKey
=
1 canonical FUTID

Academy and Pro records are contextual records and must not become
independent lifelong identities.

## 2. Existing architecture preserved

Existing Academy Player identity remains:

academies/{academyId}/players/{playerId}

Existing Pro Player records remain:

proPlayers/{proPlayerId}

Existing legacy root:

players/{document=**}

remains closed.

P1A must not reopen the legacy root players collection.

Existing Membership, Parent association, Match, Date/Time,
Evaluation, Training and FUTID compatibility behavior must remain intact.

## 3. New identity collections

P1A reserves these collection names:

playerIdentities/{playerKey}

futIdRegistry/{futId}

The registry document ID uses the canonical issued FUTID only because
newly issued FUTIDs are restricted to a path-safe V1 format.

The player identity document ID is playerKey.

playerKey and FUTID are not the same identifier.

## 4. Player Identity document

Exact V1 payload:

schemaVersion
futId
source
createdAt
createdBy

No stored id/playerKey field is allowed in the payload.

The Firestore document path is the only document identity authority.

schemaVersion must equal 1.

source must be exactly one of:

SUPERADMIN_ISSUANCE
LEGACY_MIGRATION

createdAt must equal request.time.

createdBy must equal request.auth.uid.

## 5. FUTID Registry document

Exact V1 payload:

schemaVersion
futId
playerKey
createdAt
createdBy

schemaVersion must equal 1.

The path FUTID and stored futId must match exactly.

playerKey must be an exact Firestore document ID.

createdAt must equal request.time.

createdBy must equal request.auth.uid.

## 6. Issued FUTID V1 format

New FUTIDs must be canonical uppercase path-safe identifiers.

Required grammar:

^FUT-[A-Z0-9]+(?:-[A-Z0-9]+)*$

Maximum length:

64 characters

No normalization is performed during issuance.

Lowercase, whitespace, slash-containing, malformed or oversized
identifiers are rejected.

Legacy futID compatibility is a read/migration concern and must not weaken
new issuance validation.

## 7. Authority

Only an explicitly ACTIVE SUPERADMIN may create a new lifelong identity.

ADMIN, COACH, PLAYER, PARENT, USER and inactive SUPERADMIN accounts
must not issue Player identities.

The React UI is not authorization authority.

Firestore Security Rules are the final authority.

isAdmin() must not be used as the issuance authority because it includes
ordinary ADMIN accounts.

## 8. Atomic pair invariant

Identity creation is valid only when the same atomic operation creates:

playerIdentities/{playerKey}

and

futIdRegistry/{futId}

with mutually matching identity.

Identity without registry must fail closed.

Registry without identity must fail closed.

Mismatched playerKey or FUTID must fail closed.

The registry path provides the uniqueness claim for canonical FUTID.

## 9. Immutability

After successful creation:

playerIdentities/{playerKey}

and

futIdRegistry/{futId}

are immutable in V1.

Generic update is forbidden.

Delete is forbidden.

FUTID correction, duplicate merge and identity repair are outside P1A
and require a future explicit audited repair architecture.

## 10. Reads

P1A may permit ACTIVE SUPERADMIN point reads required for controlled
identity operations.

P1A does not introduce public global identity listing.

Academy/Player/Parent/Pro presentation access is outside P1A and will
use controlled organization bindings in later slices.

## 11. P1A scope

Allowed future implementation files:

- docs/PLAYER_IDENTITY_FOUNDATION_V1_FREEZE.md
- src/lib/playerIdentityFoundation.ts
- src/lib/firestore/playerIdentityRepository.ts
- firestore.rules
- tests/playerIdentityFoundation.test.ts
- tests/firestore.player-identity.rules.test.ts

Any additional production file requires architecture review first.

## 12. Explicitly out of scope

P1A does not:

- modify Academy Player schema
- modify Pro Player schema
- bind Academy players to playerKey
- bind Pro players to playerKey
- migrate production data
- generate Player Profile UI
- generate Player CV UI
- expose FUTID editing
- reopen root /players
- create Firebase Functions
- create a second authorization system
- alter Match FUTID snapshot compatibility
- delete legacy futID fields
- generate a replacement FUTID for missing legacy records

## 13. Acceptance requirements

P1A is not GREEN until executable evidence proves:

1. ACTIVE SUPERADMIN can atomically create one identity + one FUTID registry record.
2. Same FUTID cannot be claimed by two playerKeys.
3. ADMIN cannot issue identity.
4. inactive SUPERADMIN cannot issue identity.
5. identity-only creation fails.
6. registry-only creation fails.
7. mismatched identity/registry pair fails.
8. malformed issued FUTID fails.
9. unknown fields fail.
10. forged createdBy fails.
11. identity update/delete fails.
12. registry update/delete fails.
13. LEGACY_MIGRATION remains SUPERADMIN-only.
14. legacy /players remains closed.
15. existing Match/Membership/FUTID regression remains GREEN.

## 14. Development sequence

P1A.1:
Architecture Freeze + RED security acceptance tests.

P1A.2:
Pure Player Identity contract + unit tests.

P1A.3:
Firestore Rules atomic-pair implementation.

P1A.4:
Repository transaction implementation.

P1A.5:
Independent adversarial tests + regression + diff/security audit.

No Player Profile implementation begins before this foundation is verified.