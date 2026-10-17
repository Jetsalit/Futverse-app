# FutVerse Pro Club Player / Squad V1 — Contract Freeze

## Status

`PHASE=CONTRACT_AUDIT_ONLY`

`DOMAIN=PRO_CLUB_PLAYER_SQUAD_V1`

`SCOPE=DOCS_TESTS_ONLY`

`RUNTIME_IMPLEMENTATION=NOT_AUTHORIZED`

`FIRESTORE_RULES_CHANGE=NOT_AUTHORIZED`

`FUNCTIONS_CHANGE=NOT_AUTHORIZED`

`UI_CHANGE=NOT_AUTHORIZED`

`PRODUCTION_DEPLOY_AUTHORIZATION=NOT_GRANTED`

`PRODUCTION_DATA_READ_AUTHORIZATION=NOT_GRANTED`

`PRODUCTION_DATA_WRITE_AUTHORIZATION=NOT_GRANTED`

`MERGE_AUTHORIZATION=NOT_GRANTED`

This slice freezes the minimum Pro Club player/squad domain boundary needed for a later league-ready implementation. It does not create roster storage, does not change Firestore Security Rules, does not change Pro Player writers, does not add UI, and does not authorize any production operation.

## Exact baseline

- Repository: `Jetsalit/Futverse-app`
- Base branch: `main`
- Accepted baseline SHA: `a983681bc89e93eb8759f583158d314ed772fb7d`
- Feature branch: `feat/pro-club-player-squad-v1-contract`
- Branch created directly from the exact accepted `main` SHA above.

This branch is intentionally independent from the open SuperAdmin Support chain. It must not depend on PR #125, #131, or #134 and must not modify Head Coach Phase 5E-2 work.

## Purpose

Player / Squad V1 provides a canonical future relationship between an existing Pro Player record and an exact Pro Club tenant so FutVerse can later support:

- a club roster;
- join / activation / release lifecycle;
- squad-specific metadata such as squad label and shirt number;
- later Match squad eligibility and Starting XI selection;
- later Player Portal views of current team context;
- preserved career continuity when a player changes clubs.

V1 must not invent a second footballer identity system merely to ship the roster quickly.

## Existing Pro Player identity boundary

The current repository already has `proPlayers/{proPlayerId}` records and a shared Pro Player profile read model.

The current shared read model explicitly states that FUTID or `playerKey` authority does not belong in that presentation/read model. Therefore Player / Squad V1 must preserve that boundary.

`V1_PLAYER_REFERENCE=EXACT_PRO_PLAYER_DOCUMENT_ID`

`FUTID_AUTHORITY=DEFERRED_TO_LIFELONG_PLAYER_IDENTITY`

`FUTID_FABRICATION=FORBIDDEN`

`PLAYER_KEY_FABRICATION=FORBIDDEN`

For V1, `proPlayerId` means the exact document identity of an existing `proPlayers/{proPlayerId}` record. The later implementation must validate the exact identifier and must not derive it from display name, current club text, jersey number, email, phone number, or another mutable profile field.

A future Lifelong Player Identity/FUTID contract may add a canonical identity bridge. That later bridge must preserve historical Pro Club associations rather than rewriting them into a new person.

## Legacy `currentClub` field is presentation only

The existing Pro Player type/read model contains a `currentClub` text field. It is not a canonical Pro Club tenant relationship and must not become authorization or roster evidence.

`LEGACY_CURRENT_CLUB_AS_AUTHORITY=FORBIDDEN`

A later roster implementation must not grant club access, Match eligibility, staff authority, or Player Portal team context merely because the text in `currentClub` matches a club name.

When canonical Pro Club roster data exists, UI may eventually derive display context from that canonical association. Migration or reconciliation of legacy `currentClub` text is a separate reviewed operation.

## Player relationship is separate from Membership and Staff

A football player is not a Pro Club staff assignment and is not automatically a tenant-administration member.

`PLAYER_AS_STAFF=FORBIDDEN`

`PLAYER_AS_OWNER_ADMIN=FORBIDDEN`

`STAFF_ROLE_SYNTHESIS=FORBIDDEN`

The existing canonical paths:

- `proClubs/{clubId}/members/{uid}`
- `proClubs/{clubId}/staff/{uid}`

must remain staff/tenant authority contracts. Player / Squad V1 must introduce a separate player association boundary rather than adding `PLAYER` to `ProClubStaffRole` or treating a player as OWNER / ADMIN / MEMBER administration authority.

A player's future app-account link is also separate from the roster identity.

`PRO_PLAYER_ID_EQUALS_FIREBASE_UID_ASSUMPTION=FORBIDDEN`

`PLAYER_ACCOUNT_LINK=DEFERRED`

The system must not assume `proPlayerId === Firebase Auth uid` unless a separately reviewed canonical account-link contract explicitly establishes that relationship.

## Proposed canonical roster path for implementation

The later persistence slice should use:

`proClubs/{clubId}/players/{proPlayerId}`

The path identities are authoritative:

- `clubId` is the exact canonical Pro Club document ID;
- `proPlayerId` is the exact existing Pro Player document ID.

`ROSTER_DOCUMENT_IDENTITY=CLUB_ID_PLUS_PRO_PLAYER_ID`

The payload must not redundantly store authoritative `clubId` or `proPlayerId` fields. Validators must bind requested IDs to document-path IDs and fail closed on mismatch.

This contract does not create that collection or authorize its production use.

## Roster lifecycle

V1 roster status is exactly one of:

- `ACTIVE`
- `INACTIVE`
- `RELEASED`

`ROSTER_STATUS_V1=ACTIVE_INACTIVE_RELEASED`

Meaning:

- `ACTIVE` — currently part of the club's canonical Pro Club roster;
- `INACTIVE` — relationship retained but temporarily not active in the club roster;
- `RELEASED` — terminal historical club association for this roster period.

`RELEASED_IS_TERMINAL=YES`

A released association must never be deleted merely to allow the player to join another club. Historical evidence must be retained.

Rejoining the same club after release must be represented by a separately reviewed new roster-period/history mechanism. V1 implementation must not silently erase or rewrite the earlier released period.

## Match availability is not roster lifecycle

The following are not roster statuses:

- injured;
- suspended;
- not selected;
- unavailable;
- match-day starter;
- substitute.

`MATCH_ELIGIBILITY_SEPARATE_FROM_ROSTER_STATUS=YES`

Those concepts belong to a later Match Squad / Availability contract. A player can remain `ACTIVE` on the club roster while being unavailable or not selected for a particular Match.

This separation prevents injury/selection decisions from accidentally terminating or changing the player's club association.

## Minimum future roster payload

The later pure domain/persistence slice may introduce only team-context data required for the roster. The intended V1 payload is:

- `schemaVersion` — exactly `1`;
- `status` — exact V1 roster status;
- `squadLabel` — optional exact non-empty trimmed text or null;
- `shirtNumber` — optional integer in an explicitly validated football-shirt range or null;
- `joinedAt` — trusted timestamp for the active roster period;
- `releasedAt` — trusted timestamp only when status is `RELEASED`, otherwise null;
- `createdBy` — trusted actor UID;
- `updatedBy` — trusted actor UID.

`ROSTER_SCHEMA_VERSION=1`

The exact shirt-number numeric range and timestamp representation must be frozen by the pure domain implementation slice before persistence is authorized.

Profile fields such as player name, DOB, nationality, height, weight, preferred foot, position, avatar, phone, social accounts, league, or current club text must not be copied into the roster record as parallel authoritative profile data.

`ROSTER_PROFILE_DUPLICATION=FORBIDDEN`

## Duplicate prevention

Within an exact Pro Club, the deterministic path `players/{proPlayerId}` prevents two simultaneous V1 roster documents for the same Pro Player identity.

`DUPLICATE_PLAYER_WITHIN_CLUB=FORBIDDEN`

V1 also requires the later implementation to fail closed against a second simultaneous `ACTIVE` Pro Club association for the same Pro Player unless a separately reviewed loan/dual-registration policy explicitly permits it.

`MULTI_CLUB_SIMULTANEOUS_ACTIVE_DEFAULT=FORBIDDEN`

The cross-club enforcement mechanism is intentionally deferred to the persistence architecture slice because it may require a deterministic global assignment/index or trusted transaction boundary. This contract does not pretend that a client-side name search can enforce global uniqueness.

## Join / activate / deactivate / release semantics

The later implementation must distinguish lifecycle actions rather than overwriting arbitrary fields.

Expected logical actions are:

- `JOIN` — create the first valid roster period as ACTIVE;
- `ACTIVATE` — move a permitted non-terminal INACTIVE association to ACTIVE;
- `DEACTIVATE` — move ACTIVE to INACTIVE without release;
- `RELEASE` — move a permitted non-terminal association to terminal RELEASED.

`HARD_DELETE_ROSTER_HISTORY=FORBIDDEN`

`ARBITRARY_STATUS_REWRITE=FORBIDDEN`

A later domain model must freeze the exact transition matrix and reject invalid transitions before any persistence implementation is merged.

## Mutation authority boundary

Global account role by itself is not sufficient Pro Club roster mutation authority.

`GLOBAL_ROLE_ONLY_ROSTER_MUTATION=FORBIDDEN`

The later authorization slice must derive mutation authority from the exact Pro Club tenant context and canonical ACTIVE membership/staff records. It must not use display role, Academy role, support presentation, legacy `currentClub`, or client-supplied club identity as authority.

For V1, roster-administration actions are intended to be limited to narrowly reviewed club-side authorities. The exact final matrix for OWNER / ADMIN / HEAD_COACH / TEAM_MANAGER must be frozen in the authorization/rules implementation slice before writes are enabled.

Until that matrix is separately accepted:

`ROSTER_MUTATION_AUTHORITY=NOT_YET_GRANTED`

SuperAdmin Support Mode V1 remains read-only and does not gain roster mutation authority from this contract.

## Player self-service boundary

A Pro Player must not self-attach to an arbitrary Pro Club merely by entering a club ID or club name.

`PLAYER_SELF_JOIN_WITHOUT_CLUB_APPROVAL=FORBIDDEN`

A later claim/invite/approval flow may allow a player to request or accept association, but the club-side authority and exact target must be independently verified. Public registration alone never creates a Pro Club roster association.

## Read boundary

The later roster read contract must preserve tenant separation.

At minimum:

- club staff may read only the roster permitted by canonical Pro Club authority;
- a future linked player account may read its own canonical association only after account-link authority exists;
- no arbitrary cross-club hidden roster discovery is introduced;
- public `proPlayers` profile readability does not imply public Pro Club roster readability.

`CROSS_TENANT_ROSTER_DISCOVERY=FORBIDDEN`

The exact Firestore Rules read matrix is deferred and must be emulator-tested before activation.

## Career continuity / release history

Changing clubs must not create a new footballer merely to represent a new team relationship.

`TRANSFER_CREATES_NEW_PLAYER_IDENTITY=FORBIDDEN`

The Pro Player identity remains the same V1 reference while club associations change over time. Released roster evidence must be retained so a future FUTID/lifelong identity layer can assemble career history without rewriting prior club records.

No transfer history may depend only on mutable `currentClub` text.

## Match Squad integration boundary

Match Squad / Starting XI integration is not implemented by this contract.

`MATCH_SQUAD_IMPLEMENTATION=DEFERRED`

When that later integration is built, selection must reference canonical roster identity and must not create a new Pro Player record from a typed display name.

At minimum, Match Squad selection must require an exact player association that satisfies the future roster/eligibility contract for the same `clubId`.

`FREE_TEXT_PLAYER_CREATION_FROM_MATCH=FORBIDDEN`

## Player Portal boundary

A minimal Pro Player portal can later consume roster/team context only after a canonical account-to-ProPlayer link exists.

This contract does not authorize account linking, role elevation, or authentication changes.

A future Player Portal may display club, squad, shirt number, training schedule, Match schedule, selection state, and player history, but those views must be sourced from canonical records rather than duplicated client profile text.

## Existing architecture that must remain unchanged in this slice

The contract depends on and preserves the current baseline:

1. `src/types/ProPlayer.ts` contains the current Pro Player presentation/data type, including legacy `currentClub` text.
2. `src/lib/playerProfileReadModel.ts` explicitly states that FUTID or `playerKey` authority does not belong in the current shared read model.
3. `src/types/ProClub.ts` keeps tenant Membership roles and football Staff roles separate.
4. `src/lib/proClubModel.ts` provides exact document-identifier validation and current Pro Club Membership/Staff validators.
5. `firestore.rules` currently defines `proPlayers/{proPlayerId}` independently from any future `proClubs/{clubId}/players/{proPlayerId}` roster collection.

No file above is authorized to change in this contract slice.

## Exact changed-file scope

Exactly two new files are authorized:

1. `docs/PRO_CLUB_PLAYER_SQUAD_V1_CONTRACT_FREEZE.md`
2. `tests/proClubPlayerSquadV1Contract.test.ts`

No other file may appear in the final product diff.

Explicitly frozen/out of scope:

- `src/**`
- `functions/**`
- `firestore.rules`
- `firestore.indexes.json`
- `firebase.json`
- `firebase.spark.json`
- `package.json`
- Pro Club onboarding/provisioning/rename
- Pro Club Membership/Staff authority
- Technical Governance
- Head Coach Phase 5E-2
- Weekly Training
- SuperAdmin Support Mode chain
- Match runtime
- Starting XI runtime
- Academy Player storage
- Pro Player writers
- production environment/configuration

## Acceptance gates

Before this contract is considered accepted:

1. Exact ancestry must prove the branch descends from baseline `a983681bc89e93eb8759f583158d314ed772fb7d` with no behind commits.
2. Final changed-file scope must be exactly the two authorized docs/tests files.
3. Player / Squad V1 contract tests must pass.
4. Existing Player Profile read-model tests must continue to pass.
5. Existing Player Position / Player Role-Style foundations must remain unchanged.
6. Existing Pro Club foundation tests must continue to pass where included by the acceptance runner.
7. `git diff --check` must pass.
8. TypeScript must pass.
9. Production build must pass.
10. Independent exact-head review must report no blocking P0/P1/P2 finding.
11. No deploy, production HTTP call, production Firestore read/write, billing change, reset, force push, or merge is authorized by this acceptance process.

## Required sequencing after contract acceptance

Recommended later slices are intentionally small:

1. Player / Squad V1 pure domain model + validators + transition matrix;
2. persistence/repository design including cross-club ACTIVE uniqueness strategy;
3. Firestore Rules + emulator tests and exact mutation-authority matrix;
4. minimal Pro Club roster UI;
5. Match Squad / availability foundation;
6. Player-account link contract and minimum Player Portal;
7. future Lifelong Player Identity / FUTID bridge without rewriting roster history.

Each later slice requires its own exact scope, acceptance, independent review, and production activation decision.

`READY_FOR_INDEPENDENT_REVIEW_AFTER_ACCEPTANCE=YES`
