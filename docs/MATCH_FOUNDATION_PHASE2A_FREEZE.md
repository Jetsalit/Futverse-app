# FutVerse Match Foundation - Phase 2A Freeze Contract

Status: FROZEN FOR IMPLEMENTATION
Base production commit: 2870eb788b2eb7ecf6176d16077a85da60a010be

## 1. Purpose

Create the authoritative Match foundation required before:

- Starting XI persistence
- Match Day workflow
- Coach match evaluation
- Parent match observation
- Player match history
- future match statistics

This phase must preserve existing Membership, FUTID, Player,
Parent association, SuperAdmin support, and tenant-security behavior.

## 2. Current-State Decisions

### 2.1 Existing Academy Match path

The current Academy storage boundary remains:

academies/{academyId}/matches/{matchId}

Phase 2A must not create a competing top-level match collection
or migrate existing production data.

### 2.2 Squad / Team identity

Current Academy settings expose squads as string labels.

Therefore:

- squad labels are presentation/context values
- a squad label is NOT a canonical team ID
- Phase 2A must not invent teamId values
- Phase 2A must not create a Team entity only to satisfy Match
- match records may preserve a squadLabel snapshot when useful

A future authoritative Team model may be introduced separately.

### 2.3 Match identity

matchId is the Firestore document ID.

Do not persist an independent synthetic match ID that can drift
from the document path.

### 2.4 Player identity inside a Match

The required Academy-local player reference is:

academies/{academyId}/players/{playerId}

where playerId is the canonical Firestore player document ID.

FUTID:

- may be preserved as an optional identity snapshot when available
- must not replace playerId for Academy tenant authorization
- must not be fabricated when absent
- must not block an existing canonical Academy player from Match use
- remains the long-term cross-organization continuity identity

### 2.5 Match roster

The authoritative Match roster will be scoped under the Match.

Preferred identity boundary:

academies/{academyId}/matches/{matchId}/roster/{playerId}

The roster entry is keyed by the existing Academy player document ID.

Roster data may snapshot display/history fields required to preserve
what was true for that Match, including FUTID when available.

Roster snapshots must not rewrite the source Academy player record.

### 2.6 Starting XI

The existing Starting XI screen is currently local UI state.

Phase 2A must not persist a standalone lineup that is disconnected
from an authoritative Match.

Persistence must require an authoritative selected Match first.

### 2.7 Parent observation

Parent observation is NOT activated in this slice.

It may be enabled only after all of the following exist:

1. authoritative Match
2. authoritative Match roster
3. exact Academy/player identity
4. active Parent -> Player association
5. authoritative observation metric configuration
6. Firestore Rules and emulator coverage

No client-only observation authority is allowed.

## 3. Initial Match Lifecycle

The domain model must be able to represent:

DRAFT
SCHEDULED
IN_PROGRESS
COMPLETED
CANCELLED

Lifecycle transition rules will be implemented and tested explicitly.
UI state alone must not define authoritative Match status.

Terminal-state preservation:

- COMPLETED match evidence must not be silently rewritten
- COMPLETED roster / Starting XI must preserve the historical match snapshot
- CANCELLED must remain an explicit terminal lifecycle state
- reopening or correcting terminal Match evidence requires a separately defined audited correction policy
- Phase 2A must not implement destructive match-history deletion

## 4. Initial Match Metadata Direction

The Match foundation may support:

- schemaVersion
- status
- squadLabel
- competitionName
- opponentName
- kickoffAt
- venueType
- createdAt
- createdBy
- updatedAt
- updatedBy

Exact validation belongs in the model and Firestore Rules implementation.

Do not duplicate academyId or a synthetic id in the Match payload
when the Firestore path already provides that identity unless a later
query requirement is explicitly reviewed.

## 5. Academy / Pro Club Portability

The Match domain model must avoid unnecessary Academy-only semantics.

The first Firestore adapter remains Academy-scoped because that is the
authoritative organization implementation available today.

Phase 2A must NOT:

- invent a Pro Club collection
- migrate Academy matches
- create a speculative organizations collection
- duplicate the Match engine for Pro Club

A future Pro Club adapter should be able to reuse the same Match domain
contract when authoritative Pro Club organization storage exists.

## 6. Security Boundary

Current generic Match permissions are not sufficient as the final
production contract.

Before Match writes are activated through new production UI:

- Match schema must be validated
- allowed fields must be bounded
- actor tenant membership must remain authoritative
- cross-Academy reads/writes must fail closed
- invalid status/data must fail closed
- document identity must be validated
- Rules emulator tests must cover positive and negative paths

Existing Membership authorization must not be rewritten.

## 7. Preservation Rules

Phase 2A must not:

- rewrite existing Academy players
- require migration of existing player records
- fabricate FUTID
- convert squad labels into fake IDs
- rewrite Membership
- rewrite Parent/Player association authority
- rewrite SuperAdmin support controls
- delete production records
- activate Parent observation before its authority exists

## 8. Implementation Order

2A.0 - Match Foundation contract freeze
2A.1 - Pure Match domain types, validators, lifecycle rules, tests
2A.2 - Firestore Match + roster schema Rules and emulator tests
2A.3 - Academy Match repository/read-write adapter
2A.4 - Match creation/selection production UI
2A.5 - Starting XI persistence bound to authoritative Match
2A.6 - Match Foundation regression and production gate

Observation Metrics / Parent Match Observation begins only after
Phase 2A Match Foundation is complete.

## 9. Acceptance Boundary

Phase 2A is complete only when:

- Match identity is authoritative
- tenant isolation remains fail closed
- Match schema is validated
- roster references real Academy players
- missing FUTID remains explicit rather than fabricated
- squadLabel remains a label rather than fake team identity
- Starting XI cannot persist without a Match
- existing production behavior remains preserved
- Rules tests pass
- TypeScript checks pass
- production build passes
- diff contains no unrelated protected-core changes

## 10. Production Rule

Any implementation requirement that conflicts with this contract
must stop for architecture review before changing production data,
identity, Membership, FUTID, or tenant boundaries.