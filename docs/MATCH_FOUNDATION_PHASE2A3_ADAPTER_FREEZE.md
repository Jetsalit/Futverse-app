# FutVerse Match Foundation - Phase 2A.3 Repository Adapter Freeze

Status: FROZEN FOR IMPLEMENTATION

Base commit:

dd1182342629ad7d3803f54332c1cd5622b96a04

## 1. Purpose

Phase 2A.3 introduces the first Academy-scoped Firestore repository adapter
for the frozen Match Foundation contract.

This phase connects the transport-neutral Match domain model to Firestore
without activating Match UI or Starting XI persistence.

## 2. Canonical storage

Match:

academies/{academyId}/matches/{matchId}

Roster:

academies/{academyId}/matches/{matchId}/roster/{playerId}

Academy Player:

academies/{academyId}/players/{playerId}

Firestore path identity remains authoritative.

Do not persist academyId, matchId, or playerId as duplicate payload identity.

## 3. Layer boundary

The intended flow is:

UI / authorized AcademyContext
    -> Match Firestore Repository
    -> Match Foundation validators
    -> Firestore
    -> Firestore Security Rules

AcademyContext resolves the client tenant context.

The repository does not create a second Membership authorization system.

Firestore Security Rules remain the final authorization authority.

## 4. Repository location

The adapter belongs at:

src/lib/firestore/matchRepository.ts

Do not introduce a competing src/repositories architecture in this phase.

This follows existing FutVerse Firestore adapter and dependency-injection
patterns.

## 5. Match operations

Phase 2A.3 may expose:

- read one Academy Match
- list Academy Matches
- create Academy Match
- update Academy Match

There is deliberately no Match delete API.

Match creation:

- validates MatchCoreData
- uses canonical Firestore path identity
- derives createdBy and updatedBy from authenticated Firebase Auth UID
- uses serverTimestamp for createdAt and updatedAt

Match update:

- reads current authoritative Match state first
- validates the stored Match
- validates proposed MatchCoreData
- permits same-status correction only for:
  - DRAFT
  - SCHEDULED
  - IN_PROGRESS
- permits only frozen lifecycle transitions
- refuses COMPLETED/CANCELLED mutation
- preserves createdAt and createdBy
- updates updatedAt and updatedBy

Firestore Rules remain authoritative against concurrent-state races.

## 6. Roster operations

Phase 2A.3 may expose:

- read Match roster
- create roster player
- update roster player
- remove roster player

Roster mutation is allowed by the adapter only while Match status is:

- DRAFT
- SCHEDULED
- IN_PROGRESS

Terminal Match roster evidence is locked.

## 7. Canonical Player snapshot source

Roster identity is the canonical Academy Player document ID.

The following roster fields MUST come from the canonical Player document:

- firstName
- lastName
- futId

The UI must not provide those historical identity fields as free text.

FUTID compatibility:

1. Read canonical `futId`.
2. Read legacy `futID`.
3. Missing values become explicit null.
4. If both exist and differ, fail closed.
5. Prefer canonical `futId`.
6. Use legacy `futID` only when canonical `futId` is absent.
7. Never fabricate FUTID.

The following remain Match-specific roster inputs:

- position
- jerseyNumber

They must satisfy the frozen Match roster validator.

## 8. Read integrity

Repository reads must:

- trust document path identity, not stored synthetic IDs
- reject malformed persisted schemas
- reject unsupported fields
- convert Firestore timestamp values to Date for the domain boundary
- validate Match / roster domain data before returning it

Malformed Match evidence fails closed.

## 9. Dependency injection

Production repository operations use Firebase Auth and Firestore.

Repository operations must also accept injected dependencies so unit tests
can verify:

- exact Academy paths
- canonical actor handling
- server timestamp use
- lifecycle behavior
- canonical Player snapshot behavior
- FUTID compatibility
- terminal immutability

without weakening production behavior.

## 10. Protected Phase 2A files

Phase 2A.3 must not modify:

- firestore.rules
- src/lib/matchFoundation.ts
- tests/matchFoundation.test.ts
- tests/firestore.match-foundation.rules.test.ts
- tests/firestore.membership.rules.test.ts

## 11. Out of scope

Do not implement in this phase:

- Match creation UI
- Match selection UI
- Starting XI persistence
- Parent Match observation
- Match statistics
- Pro Club storage
- Team entity migration
- Membership rewrite
- FUTID rewrite
- Match deletion
- Firestore Rules changes

## 12. Exact implementation scope

Allowed files:

1. docs/MATCH_FOUNDATION_PHASE2A3_ADAPTER_FREEZE.md
2. src/lib/firestore/matchRepository.ts
3. tests/matchRepository.test.ts

Any requirement outside this scope requires architecture review before edit.

## 13. Acceptance gate

Phase 2A.3 implementation is acceptable only when:

- repository unit tests pass
- TypeScript passes
- production build passes
- Phase 2A protected files are unchanged
- exact three-file scope is preserved
- no Match delete API exists
- canonical Player snapshot behavior is tested
- FUTID canonical / legacy / missing / conflict behavior is tested
- same-status correction behavior is tested
- terminal Match evidence remains locked
- no commit, push, merge, or deploy occurs before explicit gate approval