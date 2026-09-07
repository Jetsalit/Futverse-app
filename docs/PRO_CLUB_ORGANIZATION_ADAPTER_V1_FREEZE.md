# FutVerse Pro Club Organization Adapter V1 - Contract Freeze

Status: FROZEN FOR IMPLEMENTATION

Baseline:

- branch: `feat/pro-club-organization-adapter-v1`
- base SHA: `0325b39df9bdcba3eb45cb67ed1b3db3de8cbcc8`

## 1. Purpose

Organization Adapter V1 creates the first normalized read-only organization
authority view for one exact Pro Club and one exact user.

It bridges the already-frozen Pro Club authority and persistence boundaries
toward a future shared Organization layer without changing Academy authority,
SuperAdmin presentation, Match, UI, Firestore Rules, or production data.

V1 is an exact-path authority adapter, not an account-wide organization
inventory and not a mutation surface.

## 2. Canonical source of truth

The only authoritative Pro Club persistence paths remain:

- `proClubs/{clubId}`
- `proClubs/{clubId}/members/{uid}`
- `proClubs/{clubId}/staff/{uid}`

The requested `clubId` and `uid` remain path-derived canonical identities.

Stored payload identity fields must not be introduced.

No Academy fallback, legacy role fallback, global `users.role` fallback,
payload identity query, or cross-club recovery is permitted.

## 3. Required upstream authority resolver

Organization Adapter V1 must compose the existing frozen:

`resolveProClubAuthoritySnapshot(clubId, uid)`

It must not duplicate or independently recreate Pro Club authority logic.

The existing authority snapshot remains responsible for:

- exact club identity
- exact membership identity
- active club validation
- active membership authority
- authorization role validation
- active staff-role resolution
- fail-closed malformed data handling

## 4. V1 public operation

The implementation slice may expose an equivalent of:

`resolveProClubOrganizationAuthority(clubId, uid, ops?)`

The operation resolves exactly one requested club/user pair.

V1 does not enumerate all Pro Clubs for an account.

V1 does not use collection or collectionGroup discovery.

V1 does not create an organization directory or an `organizations` collection.

## 5. Result-state preservation

The adapter must preserve the upstream result states:

- `FOUND`
- `MISSING`
- `PERMISSION_DENIED`
- `INVALID_DATA`
- `ERROR`

The adapter must not convert:

- `PERMISSION_DENIED` to `MISSING`
- `INVALID_DATA` to `MISSING`
- `ERROR` to `MISSING`
- inactive authority to active authority

Only `FOUND` may be mapped into an Organization authority view.

## 6. Organization authority view

A successful V1 organization authority view must expose equivalent meaning for:

- organization ID from canonical `clubId`
- organization type exactly `PRO_CLUB`
- organization name
- optional short name
- Pro Club level `T1`, `T2`, or `T3`
- Pro Club status `ACTIVE` or `INACTIVE`
- exact user ID
- canonical membership authorization role
- canonical membership status
- whether active membership authority exists
- active football staff role, or null

The organization view is read-only projection data.
It does not become a new source of authority.

## 7. Authorization-role preservation

Membership authorization roles remain exactly:

- `OWNER`
- `ADMIN`
- `MEMBER`

The membership authorization role must remain separate from football staff
function.

`MEMBER` must not be silently rewritten as `COACH`.

`OWNER` must not be collapsed into `ADMIN`.

An authorization role alone must not fabricate a football staff role.

## 8. Football staff-role preservation

Functional football staff roles remain exactly:

- `HEAD_COACH`
- `ASSISTANT_COACH`
- `FITNESS_COACH`
- `ANALYST`
- `PHYSIO`
- `TEAM_MANAGER`
- `STAFF`

The Organization view exposes only the effective active staff role resolved by
the frozen Pro Club authority model.

Missing, inactive, invalid, or unauthorized staff evidence must not become an
active staff role.

Authorization role and football staff role must never be collapsed into one
generic role field.

## 9. Membership-state preservation

Membership status remains:

- `ACTIVE`
- `INACTIVE`
- `LEFT`
- `REVOKED`

`LEFT` and `REVOKED` remain terminal V1 relationship evidence.

The Organization adapter performs no lifecycle transition, reactivation,
membership replacement, or status mutation.

`hasMembershipAuthority` remains the effective authority signal and must not be
derived from role text alone.

## 10. Academy preservation

Academy authority remains unchanged.

Organization Adapter V1 must not:

- modify Academy persistence
- modify Academy membership rules
- reinterpret an Academy as a Pro Club
- copy Academy legacy payload identity fields
- add Pro Club evidence to Academy-only validators
- change existing Academy SuperAdmin relationship behavior

No compatibility shortcut may make Pro Club use an Academy canonical path.

## 11. Existing SuperAdmin relationship-model preservation

The current SuperAdmin relationship model is not the Pro Club authority source.

Organization Adapter V1 must not modify or broaden the existing Academy
relationship-role semantics merely to fit Pro Club.

In particular, V1 must not collapse Pro Club:

- `OWNER`
- `ADMIN`
- `MEMBER`
- football staff roles

into the existing generic Academy relationship role field.

No `PRO_CLUB` relationship is injected into `SuperAdminUserRelationshipRow`
in this slice.

## 12. SuperAdmin connection boundary

SuperAdmin `proClubAuthority` remains `NOT_CONNECTED` in this slice.

The current account organization context must continue to fail closed if
unsupported non-Academy relationship evidence is injected into the existing
Academy-connected inventory.

Changing Pro Club coverage from `NOT_CONNECTED` to `AVAILABLE` requires a
separate integration slice with:

1. completed Organization Adapter implementation;
2. adapter tests;
3. current production Firestore Rules coverage;
4. exact discovery/inventory strategy if account-wide inventory is required;
5. SuperAdmin regression validation;
6. explicit UI/presentation wiring approval.

## 13. Inventory/discovery boundary

Organization Adapter V1 resolves one known `clubId` and `uid`.

It deliberately does not define how SuperAdmin discovers every Pro Club
relationship belonging to an arbitrary account.

No collection-group membership discovery is introduced in this slice.

A future account-wide Pro Club inventory must receive a separate architecture
review covering:

- queryability under production Rules
- tenant isolation
- canonical path evidence
- malformed-document behavior
- pagination
- scale
- partial-coverage semantics

## 14. Firestore Rules boundary

The existing Pro Club Firestore Rules remain unchanged.

Organization Adapter V1 performs reads through the already-approved Pro Club
read boundary and creates no client write authority.

This slice does not modify `firestore.rules`.

This slice does not deploy Rules.

## 15. Mutation boundary

Organization Adapter V1 is read-only.

Unavailable:

- create
- set
- update
- delete
- membership mutation
- staff mutation
- lifecycle mutation
- batch write
- transaction write

No `setDoc`, `updateDoc`, `deleteDoc`, batch write, or transaction write may be
introduced.

## 16. Match and player preservation

Organization Adapter V1 does not modify:

- Match
- Starting XI
- Pro Player
- Academy Player
- Player Profile
- FUTID
- Player role/style
- training
- fitness
- medical
- attendance

Those systems remain outside this adapter scope.

## 17. UI boundary

No dashboard, Command Center, club-management, coach, player, parent,
SuperAdmin, or other UI may consume the new adapter in this slice.

No component wiring is permitted.

UI connection requires a later dedicated integration slice.

## 18. Contract-freeze allowed files

This Contract Freeze slice is limited to:

- `docs/PRO_CLUB_ORGANIZATION_ADAPTER_V1_FREEZE.md`
- `tests/proClubOrganizationAdapterContract.test.ts`

No existing production source file may change during Contract Freeze.

## 19. Reserved implementation slice

After this contract is verified, the next implementation slice is reserved for:

- `src/lib/firestore/proClubOrganizationAdapter.ts`
- `tests/proClubOrganizationAdapter.test.ts`

The implementation slice must preserve all existing Pro Club, Academy,
SuperAdmin, Match, player, Firestore Rules, and UI behavior.

Any need to modify existing shared relationship models or UI coverage requires
a separate integration review rather than expanding implementation scope.

## 20. Explicitly out of scope

- Firestore Rules changes
- Firestore indexes
- production data
- mutation APIs
- lifecycle mutation
- account-wide Pro Club discovery
- SuperAdmin inventory integration
- SuperAdmin coverage changes
- shared relationship-role redesign
- Match integration
- Starting XI changes
- UI
- deployment
- commit
- push
- merge

Next approved slice after Contract Freeze:

`PRO CLUB ORGANIZATION ADAPTER V1 — READ-ONLY IMPLEMENTATION`

## 21. Staff Management V1 successor role-set amendment

The historical baseline above froze the legacy seven-role set.
Pro Club Staff Management V1 supersedes only the functional football
staff-role enumeration with the following canonical set of exactly 10 roles:

- `TECHNICAL_DIRECTOR`
- `MANAGER`
- `HEAD_COACH`
- `ASSISTANT_COACH`
- `GK_COACH`
- `FITNESS_COACH`
- `ANALYST`
- `PHYSIO`
- `TEAM_MANAGER`
- `STAFF`

MANAGER and TEAM_MANAGER are distinct.

This successor amendment does NOT change:

- authorization roles: OWNER / ADMIN / MEMBER
- membership authority semantics
- staffRole != authorizationRole
- lifecycle states
- exact-path authority
- default-deny behavior
- historical baseline SHA
- historical implementation scope
