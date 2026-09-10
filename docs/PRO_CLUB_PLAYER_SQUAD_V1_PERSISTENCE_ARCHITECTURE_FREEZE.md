# FutVerse Pro Club Player / Squad V1 — Persistence Architecture Freeze

## Status

`PHASE=PERSISTENCE_ARCHITECTURE_ONLY`

`PARENT_PURE_DOMAIN_HEAD=a7bacbebf6567a25651ebf392e799d2133276fff`

`RUNTIME_PERSISTENCE_IMPLEMENTATION=NOT_AUTHORIZED`

`FIRESTORE_RULES_CHANGE=NOT_AUTHORIZED`

`FUNCTIONS_CHANGE=NOT_AUTHORIZED`

`UI_CHANGE=NOT_AUTHORIZED`

`PRODUCTION_DEPLOY_AUTHORIZATION=NOT_GRANTED`

`PRODUCTION_DATA_READ_AUTHORIZATION=NOT_GRANTED`

`PRODUCTION_DATA_WRITE_AUTHORIZATION=NOT_GRANTED`

`MERGE_AUTHORIZATION=NOT_GRANTED`

This slice freezes the persistence topology and atomicity requirements for Pro Club Player / Squad V1. It does not create Firestore collections, repositories, Functions, Security Rules, UI, migrations, or production data.

## Exact parent

- Repository: `Jetsalit/Futverse-app`
- Parent branch: `feat/pro-club-player-squad-v1-pure-domain`
- Exact accepted parent HEAD: `a7bacbebf6567a25651ebf392e799d2133276fff`
- Feature branch: `feat/pro-club-player-squad-v1-persistence-contract`

The parent Player / Squad V1 Contract and Pure Domain semantics remain unchanged.

## Persistence goals

The persistence design must preserve all of these invariants simultaneously:

1. one exact existing `proPlayers/{proPlayerId}` record is the V1 footballer reference;
2. one exact Pro Club roster record represents the club relationship;
3. a Pro Player cannot be `ACTIVE` in two Pro Clubs at the same time unless a future reviewed dual-registration/loan policy explicitly allows it;
4. release/history evidence is not deleted to make a new club join possible;
5. failed/concurrent operations cannot leave a roster record and global active-club claim out of sync;
6. the global coordination claim is not FUTID, `playerKey`, staff authority, membership authority, or career history.

## Canonical roster document

The future roster document remains:

`proClubs/{clubId}/players/{proPlayerId}`

Path identity is authoritative:

- `clubId` = exact Pro Club document ID;
- `proPlayerId` = exact existing Pro Player document ID.

The payload remains the pure-domain V1 record:

- `schemaVersion`
- `status`
- `squadLabel`
- `shirtNumber`
- `joinedAt`
- `releasedAt`
- `createdBy`
- `updatedBy`

No stored `clubId`, `proPlayerId`, FUTID, `playerKey`, player name, or `currentClub` field becomes authoritative roster identity.

## Global ACTIVE coordination registry

V1 reserves this deterministic collection:

`proClubActivePlayerAssignments/{proPlayerId}`

`ACTIVE_ASSIGNMENT_DOCUMENT_ID=PRO_PLAYER_ID`

This document exists only while the Pro Player has one canonical ACTIVE Pro Club roster association.

Its proposed V1 payload is exactly:

- `schemaVersion` — exactly `1`;
- `clubId` — exact canonical Pro Club document ID;
- `activatedAt` — trusted timestamp;
- `updatedBy` — trusted authenticated actor UID.

`ACTIVE_ASSIGNMENT_IS_COORDINATION_LOCK=YES`

The registry is a uniqueness/coordination claim only. It must not be presented as:

- lifelong Player Identity;
- FUTID registry;
- player profile;
- transfer/career history;
- Pro Club membership;
- Pro Club staff assignment;
- technical authority;
- Match eligibility.

`ACTIVE_ASSIGNMENT_AS_FUTID_AUTHORITY=FORBIDDEN`

`ACTIVE_ASSIGNMENT_AS_CAREER_HISTORY=FORBIDDEN`

## Why the registry is keyed by `proPlayerId`

Player Identity Foundation already reserves `playerIdentities/{playerKey}` and `futIdRegistry/{futId}` for lifelong identity. Pro Club Player / Squad V1 does not yet have a canonical Pro Player-to-playerKey binding.

Therefore the active-club coordination registry must use the exact V1 player reference already frozen by PR #136: `proPlayerId`.

`PRO_PLAYER_TO_PLAYER_KEY_BINDING=DEFERRED`

The future FUTID/playerKey bridge may migrate the coordination mechanism under a reviewed identity-binding contract, but must not fabricate a playerKey or rewrite historical roster evidence.

## Atomic pair invariant for ACTIVE state

A canonical ACTIVE roster association is valid only when the same trusted atomic operation leaves both of these facts mutually consistent:

1. `proClubs/{clubId}/players/{proPlayerId}` has `status == ACTIVE`;
2. `proClubActivePlayerAssignments/{proPlayerId}` exists and has `clubId == clubId`.

`ACTIVE_ROSTER_REQUIRES_MATCHING_GLOBAL_CLAIM=YES`

`GLOBAL_CLAIM_REQUIRES_MATCHING_ACTIVE_ROSTER=YES`

No client may first write one document and later attempt to repair the other.

`SEQUENTIAL_ACTIVE_PAIR_WRITE=FORBIDDEN`

The later persistence implementation must use one trusted Firestore transaction or another reviewed atomic server boundary that provides equivalent all-or-nothing semantics.

## JOIN transaction

Future `JOIN` persistence must atomically:

1. verify exact Pro Club exists and is eligible under the later authorization contract;
2. verify exact `proPlayers/{proPlayerId}` exists;
3. read `proClubActivePlayerAssignments/{proPlayerId}`;
4. fail closed if a claim already exists for another club;
5. create the new ACTIVE roster period according to the later history/rejoin strategy;
6. create the global ACTIVE assignment claim for the same `clubId`;
7. bind audit attribution to trusted authenticated actor identity and trusted server time.

`JOIN_REQUIRES_ATOMIC_ACTIVE_CLAIM=YES`

Concurrent JOIN attempts for different clubs must serialize on the deterministic `proPlayerId` claim and produce at most one successful ACTIVE association.

`CONCURRENT_CROSS_CLUB_JOIN_AT_MOST_ONE_SUCCESS=YES`

## ACTIVATE transaction

Future `INACTIVE -> ACTIVE` persistence must atomically:

1. read the exact INACTIVE roster record;
2. verify the lifecycle transition through the accepted pure-domain model;
3. read the deterministic global assignment claim;
4. fail if another club already owns the active claim;
5. update the roster to ACTIVE;
6. create/update the claim to the same exact club under the reviewed implementation contract.

No activation is valid if the claim and roster disagree after commit.

## DEACTIVATE transaction

Future `ACTIVE -> INACTIVE` persistence must atomically:

1. read the exact ACTIVE roster record;
2. read the global assignment claim;
3. require the claim to exist and match the same `clubId`;
4. update roster status to INACTIVE;
5. delete the active assignment claim in the same atomic operation.

`DEACTIVATE_REMOVES_ACTIVE_CLAIM_ATOMICALLY=YES`

The roster record remains as relationship evidence.

## RELEASE transaction

Future `ACTIVE -> RELEASED` persistence must atomically:

1. read the exact ACTIVE roster record;
2. require the global assignment claim to exist and match the same `clubId`;
3. update the roster to terminal RELEASED with trusted release time;
4. delete the active assignment claim in the same operation.

Future `INACTIVE -> RELEASED` persistence does not require deletion of an active claim, but it must fail closed if a contradictory active assignment claim exists for the same player.

`RELEASE_PRESERVES_ROSTER_EVIDENCE=YES`

`RELEASE_DELETES_HISTORY=NO`

## Claim deletion safety

A global assignment claim may not be deleted merely because a caller wants another club to join the player.

`UNCONDITIONAL_ACTIVE_CLAIM_DELETE=FORBIDDEN`

Claim deletion is valid only as part of an accepted lifecycle transition that proves the matching ACTIVE roster relationship is becoming non-ACTIVE in the same atomic boundary.

## Fail-closed drift handling

If persistence ever encounters contradictory state, it must not guess or silently repair it during an ordinary JOIN/ACTIVATE/DEACTIVATE/RELEASE operation.

Examples of contradictory state:

- ACTIVE roster exists but global claim is missing;
- global claim exists but referenced roster is missing;
- global claim club differs from ACTIVE roster club;
- two ACTIVE roster records exist for the same Pro Player;
- RELEASED roster has an active claim pointing to it;
- claim references malformed/nonexistent club/player identity.

`ROSTER_ASSIGNMENT_DRIFT=FAIL_CLOSED`

Repair/reconciliation requires a separately reviewed trusted repair architecture with durable audit evidence.

`AUTOMATIC_SILENT_DRIFT_REPAIR=FORBIDDEN`

## Rejoin same club and historical periods

The current deterministic roster path alone cannot represent multiple released periods for the same `(clubId, proPlayerId)` without overwriting terminal evidence.

Therefore V1 persistence implementation must not enable a released player to rejoin the same club until a separately reviewed roster-period/history design is frozen.

`REJOIN_AFTER_RELEASE=DEFERRED`

`OVERWRITE_RELEASED_PERIOD_FOR_REJOIN=FORBIDDEN`

A future design may use append-only roster periods/history while retaining a current projection, but that is outside this persistence architecture slice.

## Existing INACTIVE association

An INACTIVE roster record is a current retained association and may be reactivated under the accepted transition matrix, subject to the global ACTIVE claim transaction.

It is not terminal history and does not require creation of a new player identity.

## Cross-club historical records

A Pro Player may have RELEASED historical roster records in multiple clubs over time.

Only simultaneous ACTIVE association is forbidden by default.

`MULTIPLE_HISTORICAL_CLUB_ASSOCIATIONS=ALLOWED`

The active assignment registry intentionally stores only current ACTIVE coordination, not historical transfers.

## Trusted mutation boundary

Because the cross-club uniqueness invariant spans two independent document trees and requires atomic read/write coordination, the future implementation must use a trusted mutation boundary.

Acceptable architecture for the next implementation review is:

- Firebase Admin SDK transaction in a server/trusted operation; or
- another server-mediated Firestore transaction with equivalent trusted actor/authority checks.

`CLIENT_ONLY_CROSS_CLUB_UNIQUENESS_ENFORCEMENT=FORBIDDEN`

A UI query such as “search all clubs first, then write” is not a concurrency-safe invariant and is forbidden as the authority boundary.

## Spark / cost boundary

This contract does not authorize enabling billing or deploying new Functions.

`BILLING_CHANGE_AUTHORIZATION=NOT_GRANTED`

If the later trusted mutation implementation requires infrastructure unavailable under the currently accepted production plan, that activation must be handled as a separate explicit infrastructure/production decision. The domain contract must not be weakened to avoid that gate.

## Security Rules role

Firestore Security Rules remain the final client authorization boundary for any direct client reads/writes that are later allowed.

However, if Admin SDK performs the roster transaction, the trusted service must independently enforce all authorization and validation because Admin SDK bypasses client Security Rules.

`ADMIN_SDK_VALIDATION_PARITY_REQUIRED=YES`

The later server validator must preserve parity with:

- exact IDs;
- pure-domain schema;
- lifecycle transitions;
- ACTIVE claim invariant;
- trusted actor identity;
- exact Pro Club authority matrix;
- no FUTID/playerKey fabrication.

## Mutation authority remains separately frozen

This persistence topology does not grant any role permission.

`ROSTER_MUTATION_AUTHORITY=NOT_GRANTED_BY_PERSISTENCE_CONTRACT`

The later authorization slice must freeze the exact action matrix for OWNER / ADMIN / HEAD_COACH / TEAM_MANAGER before production writes are enabled.

SuperAdmin Support Mode V1 remains read-only and does not become roster work-as authority through this registry.

## Read topology

The future club roster list reads from:

`proClubs/{clubId}/players`

The global active assignment registry is not a general player-search or club-discovery endpoint.

`GLOBAL_ACTIVE_ASSIGNMENT_ENUMERATION_FOR_NORMAL_USERS=FORBIDDEN`

Point reads of the assignment may be used by trusted mutation/reconciliation logic where necessary. Broader operational visibility requires an explicit reviewed read contract.

## No legacy `currentClub` synchronization authority

Successful roster mutation must not depend on or trust `proPlayers/{proPlayerId}.currentClub`.

`LEGACY_CURRENT_CLUB_WRITE_PARITY=DEFERRED`

Whether that legacy text is later updated for presentation compatibility is a separate migration/projection concern and must not be included in the atomic uniqueness authority.

## No Player Identity collision

The reserved collections remain semantically distinct:

- `playerIdentities/{playerKey}` — lifelong identity;
- `futIdRegistry/{futId}` — FUTID uniqueness registry;
- `proClubActivePlayerAssignments/{proPlayerId}` — temporary Pro Club ACTIVE-association coordination;
- `proClubs/{clubId}/players/{proPlayerId}` — club roster relationship.

No collection may be substituted for another.

## Exact changed-file scope

Exactly two new files are authorized in this slice:

1. `docs/PRO_CLUB_PLAYER_SQUAD_V1_PERSISTENCE_ARCHITECTURE_FREEZE.md`
2. `tests/proClubPlayerSquadV1PersistenceContract.test.ts`

No other file may change.

Explicitly frozen:

- parent contract/pure-domain files;
- `firestore.rules`;
- `src/lib/firestore/**`;
- `functions/**`;
- `src/components/**`;
- Pro Player writers/profile;
- Player Identity Foundation;
- Pro Club Membership/Staff/Technical Governance;
- Weekly Training;
- Match/Starting XI;
- SuperAdmin Support chain;
- production configuration and deployment.

## Acceptance gates

Before this persistence architecture contract is accepted:

1. branch merge-base must be exact parent HEAD `a7bacbebf6567a25651ebf392e799d2133276fff`;
2. final diff must contain exactly the two authorized files;
3. persistence contract tests must pass;
4. parent Player / Squad pure-domain tests must pass unchanged;
5. parent Player / Squad contract tests must pass unchanged;
6. Player Identity Foundation regression must remain unchanged/passing where executed;
7. TypeScript and production build must pass;
8. `git diff --check` must pass;
9. independent exact-head review must report no blocking P0/P1/P2;
10. no Firestore Rules, Functions, repository implementation, UI, deploy, production HTTP, production Firestore read/write, billing change, reset, force push, or merge is authorized.

## Required next slice after acceptance

The next implementation slice must remain separately reviewed and may implement only a trusted persistence/service foundation with emulator-backed atomicity proof.

It must prove at minimum:

- JOIN creates roster + active assignment atomically;
- concurrent cross-club JOIN yields at most one success;
- DEACTIVATE/ACTIVE RELEASE removes claim atomically;
- contradictory claim/roster state fails closed;
- no partial writes on forced transaction failure;
- exact Pro Player and Pro Club existence checks;
- no authorization expansion beyond the separately frozen action matrix;
- no production activation by merge alone.

`READY_FOR_TRUSTED_PERSISTENCE_IMPLEMENTATION_AFTER_ACCEPTANCE=YES`
