# FutVerse Pro Club Persistence Contract V1 - Freeze

Status: FROZEN FOR READ-ADAPTER IMPLEMENTATION

Baseline:
- branch: `feat/pro-club-persistence-architecture-v1`
- base SHA: `b84ba3cf55fd067734e34b4e5cf10fa0afda4ccf`

## 1. Purpose

This contract freezes the first Pro Club persistence boundary before Firestore Rules,
mutation APIs, SuperAdmin integration, Match integration, UI, or deployment.

V1 is deliberately read-only. It creates no production write path and grants no new authority.

## 2. Canonical paths

The only authoritative V1 paths are:

- `proClubs/{clubId}`
- `proClubs/{clubId}/members/{uid}`
- `proClubs/{clubId}/staff/{uid}`

The Firestore document path is canonical identity. Stored Pro Club, membership, and
staff payloads must not duplicate `id`, `clubId`, `uid`, or `userId`.

Exact-path reads only. No payload-identity query may replace a missing canonical path.

## 3. Exact identity

Requested `clubId` and `uid` must be exact Firestore document IDs.
Empty, padded, slash-containing, cross-club, cross-user, or mismatched path identities fail closed.

## 4. Read operations

The future adapter may expose equivalents of:

- `getProClub(clubId)`
- `getProClubMembership(clubId, uid)`
- `getProClubStaffAssignment(clubId, uid)`
- `resolveProClubAuthoritySnapshot(clubId, uid)`

Each operation reads the exact canonical document path.
V1 must not query collections to recover a missing canonical document.

## 5. Authoritative reads

Security-sensitive reads must use authoritative server Firestore reads.
Cached UI state is not tenant authority.

Authority must never be synthesized from:
- `users.role`
- requested or legacy account role
- Academy role
- staff assignment alone
- SuperAdmin presentation state

## 6. Post-read validation

Every existing document must be validated through the frozen domain validators:

- `validateProClub`
- `validateProClubMembership`
- `validateProClubStaffAssignment`
- `hasActiveProClubMembershipAuthority`
- `resolveActiveProClubStaffRole`

Unknown fields, malformed roles/statuses, or duplicated canonical identity fields fail closed.

## 7. Result states

The persistence boundary must distinguish:

- `FOUND`
- `MISSING`
- `PERMISSION_DENIED`
- `INVALID_DATA`
- `ERROR`

`MISSING` must not become an empty valid membership.
`PERMISSION_DENIED` must not be converted to `MISSING`.
Existing malformed data resolves as `INVALID_DATA`.

## 8. Authority snapshot

Membership authority requires:
1. exact Pro Club exists and is `ACTIVE`;
2. exact membership exists and is `ACTIVE`;
3. club/UID path identities match;
4. authorization role is `OWNER`, `ADMIN`, or `MEMBER`.

A functional football staff role additionally requires the exact staff document to be `ACTIVE`
for the same club and UID. Staff assignment alone never grants tenant membership authority.

## 9. Academy preservation

Academy persistence and authorization remain unchanged.
Pro Club must not copy Academy legacy payload identity fields such as `academyId` and `userId`.
There is no Academy fallback for missing Pro Club membership, and a Pro Club is not an Academy.

## 10. Firestore Rules boundary

Firestore Rules remain the final production authorization authority.
No authoritative Pro Club Rules are connected in this contract slice.
This contract does not change `firestore.rules`.

The read adapter must not be connected to a production consumer until a dedicated
Pro Club Rules slice and emulator security tests are implemented and approved.

## 11. Mutation boundary

Persistence Contract V1 is read-only.

Unavailable in this slice:
- create
- set
- update
- delete
- status transition
- membership activation or revocation
- staff assignment mutation
- batch or transaction writes

No Pro Club `setDoc`, `updateDoc`, `deleteDoc`, batch write, or transaction write
may be introduced by the read-adapter implementation slice.

## 12. Lifecycle preservation

Membership states remain `ACTIVE`, `INACTIVE`, `LEFT`, and `REVOKED`.
`LEFT` and `REVOKED` remain terminal in V1.

No status-changing write may be connected until a separate mutation contract freezes
audited transition evidence and preservation-by-default history rules.
Staff lifecycle mutation is deferred for the same reason.

## 13. Integration boundaries

SuperAdmin remains `NOT_CONNECTED` for Pro Club authority until canonical persistence,
Rules, emulator tests, an authoritative Organization adapter, and regression validation exist.

Pro Club Match persistence is outside this contract.
The existing shared Match domain and Starting XI remain unchanged.

No dashboard, club-management, coach, player, or other UI may consume this contract in V1.

## 14. Allowed files

This freeze slice is limited to:

- `docs/PRO_CLUB_PERSISTENCE_CONTRACT_V1_FREEZE.md`
- `tests/proClubPersistenceContractFreeze.test.ts`

Explicitly out of scope:
- Firestore repository implementation
- Firestore Rules or indexes
- production data
- mutation APIs
- lifecycle mutation
- SuperAdmin connection
- Match or Starting XI
- Academy authority
- UI
- deployment
- commit
- push
- merge

Next approved implementation slice: read-only Pro Club persistence adapter.
