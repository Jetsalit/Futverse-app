# FutVerse Organization Runtime Selection V1 - Contract Freeze

Status: FROZEN FOR PURE MODEL IMPLEMENTATION

Baseline:

- branch: `feat/organization-runtime-selection-v1-contract`
- base SHA: `639a81aa051e1de09609ab7f6c4dba9fb07b9578`

## 1. Purpose

Organization Runtime Selection V1 defines the shared runtime selection
boundary for FutVerse organizations.

V1 supports exactly:

- `ACADEMY`
- `PRO_CLUB`

The fundamental invariant is:

`SELECTION != AUTHORITY`

Selecting an organization means only that the authenticated account is
attempting to operate in that organization.

Selection alone never grants tenant access.

Canonical organization authority must be resolved independently before any
tenant-scoped capability becomes authorized.

## 2. Selection identity

A selection contains equivalent meaning for:

- `organizationType`
- `organizationId`

The pair:

`[organizationType, organizationId]`

is the complete selection identity.

`organizationId` alone is insufficient because Academy and Pro Club use
separate canonical namespaces.

Unknown or malformed organization types fail closed.

Malformed organization IDs fail closed.

The selection layer must not repair, guess, normalize, or search for another
organization when identity is invalid.

## 3. Selection is runtime intent only

Organization Runtime Selection is runtime intent.

It is not:

- Membership authority
- organization ownership
- tenant authorization
- football staff authorization
- account-wide organization inventory

A selected organization remains unauthorized until canonical authority has
succeeded for the exact authenticated account and exact selected organization.

## 4. Account metadata is not tenant authority

Global or legacy account metadata must not become generic organization
authority.

The following fields do not grant tenant access by themselves:

- `users/{uid}.role`
- `users/{uid}.tenantRole`
- `users/{uid}.academyId`
- `users/{uid}.activeAcademyId`
- `users/{uid}.linkedPlayerId`
- `users/{uid}.assignedClients`
- requested-role metadata
- presentation-role text

Existing legacy fields may remain for existing compatibility behavior, but
they must not become the shared Organization Runtime authority source.

`ACCOUNT ROLE != TENANT ROLE`

## 5. No new persisted authority pointer

V1 must not introduce:

- `activeProClubId`
- persisted `activeOrganizationId`
- persisted `activeOrganizationType`
- persisted generic organization role
- persisted generic tenant authority

V1 does not modify the `users/{uid}` schema.

A new user-document pointer must not become an organization authorization
grant.

## 6. Runtime persistence boundary

The first V1 implementation is in-memory and pure.

It must not persist selection to:

- Firestore
- `localStorage`
- `sessionStorage`
- cookies
- production data

URL or browser state may never become authority merely because it identifies
an organization.

Any future resume/persistence mechanism requires a separate architecture and
security review.

Even a future persisted selection may represent intent only and must be
re-authorized before use.

## 7. Authentication binding

Runtime selection is bound to the current authenticated account.

A selection created under UID A must never become authorized runtime context
for UID B.

Authentication UID change must clear:

- selected organization
- resolving state
- authorized organization context
- authority results belonging to the previous account
- pending stale authority acceptance

Logout must clear Organization Runtime Selection state.

## 8. Runtime authority flow

Conceptual flow:

`Authenticated Account`

-> `Organization Selection Intent`

-> `Canonical Organization Authority Resolution`

-> `Authorized Runtime Context`

Only canonical organization authority may transition runtime state to
`AUTHORIZED`.

Selection must never fabricate or infer authority.

## 9. Runtime states

A shared runtime model may expose equivalent states:

- `UNSELECTED`
- `SELECTED`
- `RESOLVING`
- `AUTHORIZED`
- `REJECTED`
- `ERROR`

These are runtime lifecycle states, not authorization sources.

`SELECTED` is never equivalent to `AUTHORIZED`.

`AUTHORIZED` is valid only when the current authenticated UID and exact
selection still match the authority result.

## 10. Academy preservation

Academy authority remains unchanged in V1.

Existing Academy Membership authority remains authoritative for Academy
tenant access.

V1 must not modify:

- `AcademyContext`
- Academy Membership persistence
- Academy Firestore Rules
- Academy support/workspace behavior
- Academy lifecycle behavior
- Academy Match authority

Legacy `activeAcademyId` may continue to select the existing Academy path where
already required, but it does not become generic organization authority.

No Pro Club compatibility shortcut may use Academy canonical paths.

## 11. Pro Club preservation

Pro Club authority remains owned by the frozen Pro Club authority stack.

Future `PRO_CLUB` runtime integration must compose:

`resolveProClubOrganizationAuthority(clubId, uid, ops?)`

which already composes:

`resolveProClubAuthoritySnapshot(clubId, uid)`

Runtime Selection must not duplicate Pro Club authority logic.

It must not independently reinterpret:

- `proClubs/{clubId}`
- `proClubs/{clubId}/members/{uid}`
- `proClubs/{clubId}/staff/{uid}`

The existing Pro Club Organization Adapter remains a read-only authority
projection boundary.

## 12. Pro Club role separation

Pro Club authorization roles remain separate:

- `OWNER`
- `ADMIN`
- `MEMBER`

Football staff roles remain separate:

- `HEAD_COACH`
- `ASSISTANT_COACH`
- `FITNESS_COACH`
- `ANALYST`
- `PHYSIO`
- `TEAM_MANAGER`
- `STAFF`

Runtime selection contains neither category as authority.

`MEMBER` must not become `COACH`.

`OWNER` must not be collapsed into generic `ADMIN`.

A football staff role alone must not grant tenant membership authority.

## 13. Fail-closed authority preservation

Security-significant authority states must not be erased.

For Pro Club, existing result states include:

- `FOUND`
- `MISSING`
- `PERMISSION_DENIED`
- `INVALID_DATA`
- `ERROR`

The runtime layer must not convert:

- `PERMISSION_DENIED` into authority
- `INVALID_DATA` into `MISSING`
- `ERROR` into successful access
- inactive membership into active authority

Academy membership failures must likewise remain fail closed.

## 14. Multi-organization behavior

FutVerse must not assume one account belongs to only one organization.

An account may be related to:

- multiple Academies
- multiple Pro Clubs
- both Academy and Pro Club organizations

V1 represents one selected runtime organization at one moment.

Changing the runtime selection does not delete, overwrite, terminate, or
collapse other organization relationships.

Selection is not account-wide organization discovery.

## 15. Discovery boundary

V1 receives one known organization selection.

V1 must not introduce:

- account-wide Pro Club discovery
- collection-group membership discovery
- speculative Academy/Pro Club union queries
- an `organizations` collection
- cross-tenant fallback search

Organization inventory/discovery requires a separate architecture review
covering Rules, pagination, scale, tenant isolation, malformed evidence,
partial coverage, conflicts, and history.

## 16. Organization switching

Switching from organization A to organization B must invalidate A runtime
authority before B may become authorized.

Required conceptual transition:

`A AUTHORIZED`

-> clear A authority

-> select B

-> resolve B

-> `B AUTHORIZED` or fail closed

The runtime must never display B while still carrying A authority.

No cross-organization authority carryover is permitted.

## 17. Stale asynchronous result protection

Future authority resolution may be asynchronous.

If selection changes while an older selection is resolving, the older result
must never reactivate stale organization authority.

Before accepting an authority result, implementations must confirm that:

- authenticated UID still matches
- organization type still matches
- organization ID still matches
- the resolution still belongs to the current runtime generation

Equivalent generation tokens, request keys, cancellation, or deterministic
comparison mechanisms are acceptable.

## 18. SuperAdmin boundary

Existing SuperAdmin support/workspace lifecycle remains unchanged.

V1 must not modify:

- `SuperAdminSupportContext`
- Academy workspace entry
- Work As Staff
- durable support audit
- durable support session markers
- authority revalidation
- support presentation

SuperAdmin `proClubAuthority` remains `NOT_CONNECTED`.

No `PRO_CLUB` relationship is injected into the current Academy-connected
SuperAdmin inventory in this slice.

SuperAdmin Pro Club integration requires a separate dedicated slice.

## 19. Match boundary

Current Match Workspace remains Academy-specific.

V1 must not:

- change Match tenant authority
- pass Pro Club runtime selection into Match
- modify Match persistence paths
- modify Match Firestore Rules
- modify Starting XI authority

Pro Club Match support requires its own future contract.

## 20. Player and FUTID preservation

V1 does not modify:

- FUTID
- Player Identity
- Academy Player
- Pro Player
- Player Profile
- Player role/style
- Parent association
- Scout access
- training
- fitness
- medical
- attendance

FUTID remains cross-organization continuity identity, not runtime tenant
authority.

## 21. Pure implementation slice

After Contract Freeze approval, the first implementation candidate is limited
to:

- `src/lib/organizationRuntimeSelection.ts`
- `tests/organizationRuntimeSelection.test.ts`

The pure model may define equivalent:

- organization type
- selection intent
- exact selection validation
- selection identity/key
- pure lifecycle transitions
- stale-result comparison
- clear/reset behavior

The pure implementation must not import or call:

- React
- React Context
- Firebase Auth
- Firestore
- `AcademyContext`
- `SuperAdminSupportContext`
- UI components

It must perform no network I/O and no persistence.

## 22. Provider and integration boundary

No shared React provider is approved in this Contract Freeze.

Specifically, this slice does not approve:

- `OrganizationProvider`
- `OrganizationRuntimeProvider`
- provider-tree changes
- `App.tsx` wiring
- `main.tsx` wiring

Authority integration requires a later separate architecture slice after the
pure runtime model is verified.

## 23. Firestore boundary

This Contract Freeze does not modify:

- `firestore.rules`
- Firestore indexes
- Firebase configuration
- production Firestore data

No Rules deploy is required.

## 24. UI boundary

No UI is introduced.

Unavailable in this slice:

- organization switcher
- club selector
- Academy/Pro Club selector
- Dashboard wiring
- Command Center wiring
- SuperAdmin wiring
- Coach UI wiring
- Player UI wiring
- Parent UI wiring
- navigation changes

UI integration requires a later dedicated slice.

## 25. Contract Freeze allowed files

This Contract Freeze is limited exactly to:

- `docs/ORGANIZATION_RUNTIME_SELECTION_V1_FREEZE.md`
- `tests/organizationRuntimeSelectionContract.test.ts`

No existing production source file may change during Contract Freeze.

## 26. Acceptance criteria

Contract Freeze is acceptable only when:

1. branch remains on the approved baseline;
2. only the two Contract Freeze files are changed;
3. contract tests pass;
4. TypeScript passes;
5. `git diff --check` passes;
6. no production source changes exist;
7. no Firestore Rules changes exist;
8. Team 2 independent review passes;
9. no push, merge, or deploy occurs before approval.

## 27. Next candidate slice

After independent Contract Freeze approval:

`ORGANIZATION RUNTIME SELECTION V1 — PURE MODEL IMPLEMENTATION`

That implementation remains:

- non-React
- non-Firestore
- non-UI
- non-persistent

Authority/provider integration remains a later separate slice.
