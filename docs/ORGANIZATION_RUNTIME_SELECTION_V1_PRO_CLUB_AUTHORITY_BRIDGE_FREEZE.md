# FutVerse Organization Runtime Selection V1
# Pro Club Authority Bridge Contract Freeze

Status: FROZEN FOR BRIDGE IMPLEMENTATION

Baseline:

- base branch: `main`
- base SHA: `6944dfe1fbb9082d9002cc49e85e94a5a75056d3`
- contract branch: `feat/organization-runtime-selection-v1-pro-club-authority-contract`

## 1. Purpose

This contract defines the exact boundary between:

`Organization Runtime Selection`

and

`Pro Club canonical authority`

for the first Pro Club Organization Runtime integration.

The fundamental invariant remains:

`SELECTION != AUTHORITY`

This slice does not create a React provider, UI selector, account-wide
organization inventory, persisted organization pointer, or Academy runtime
replacement.

## 2. Existing authority ownership

Organization Runtime Selection does not own Pro Club authority.

Pro Club authority remains owned by:

`resolveProClubOrganizationAuthority(clubId, uid, ops?)`

which composes the frozen Pro Club authority stack.

The future bridge must not duplicate, reinterpret, or independently recreate
the Pro Club authority model.

It must not independently read:

- `proClubs/{clubId}`
- `proClubs/{clubId}/members/{uid}`
- `proClubs/{clubId}/staff/{uid}`

The existing Pro Club Organization Adapter remains the canonical read-only
projection boundary.

## 3. Future bridge API boundary

Future implementation file:

`src/lib/organizationRuntimeProClubAuthorityBridge.ts`

Future implementation function:

`resolveProClubRuntimeAuthority(request, ops?)`

The bridge receives a trusted `OrganizationResolutionRequest` created by
Organization Runtime Selection.

The bridge must not fabricate an Organization Runtime authorization result.

It must use:

`createOrganizationResolutionResult(request, status)`

so Organization Runtime request provenance and generation protection remain
owned by `organizationRuntimeSelection.ts`.

An untrusted, malformed, stale, or unsupported request must fail closed.

## 4. Organization type boundary

This bridge supports exactly:

`PRO_CLUB`

A request whose `organizationType` is not exactly `PRO_CLUB` must fail closed.

The Pro Club resolver must not be called for an `ACADEMY` request.

The bridge must not create an Academy compatibility shortcut.

## 5. Authenticated identity boundary

The authenticated actor is the real Firebase authenticated account.

Future runtime ownership must bind Organization Runtime Selection to:

`actualUser.uid`

where `actualUser` is derived from the Firebase Auth UID.

`currentUser.uid` must not automatically become authenticated actor authority
because `currentUser` may represent a SuperAdmin support-presented user.

The bridge itself must not import React, `AuthContext`, or presentation state.

It receives the UID only through the trusted Organization Runtime request.

Support presentation must never replace the real Firebase actor identity.

## 6. Exact request / authority identity

For a `PRO_CLUB` request, the bridge calls:

`resolveProClubOrganizationAuthority(request.organizationId, request.uid, ops?)`

A successful upstream result must still match the exact runtime request:

- `value.organizationType === "PRO_CLUB"`
- `value.organizationId === request.organizationId`
- `value.userId === request.uid`

A `FOUND` result with mismatched organization or user identity is an integrity
failure and must map to runtime `ERROR`.

No identifier may be repaired, normalized, guessed, or substituted.

## 7. Exact authority mapping

The bridge mapping is frozen as follows:

`FOUND + hasMembershipAuthority=true -> AUTHORIZED`

`FOUND + hasMembershipAuthority=false -> REJECTED`

`MISSING -> REJECTED`

`PERMISSION_DENIED -> ERROR`

`INVALID_DATA -> ERROR`

`ERROR -> ERROR`

Only canonical:

`FOUND + hasMembershipAuthority=true`

may produce an Organization Runtime `AUTHORIZED` result.

No other upstream state may authorize runtime access.

## 8. Preserve upstream security state

Every bridge outcome must preserve the exact upstream Pro Club read state as
`sourceState`.

The bridge must not erase meaningful upstream security distinctions.

In particular:

- `PERMISSION_DENIED` must not become `MISSING`
- `INVALID_DATA` must not become `MISSING`
- `ERROR` must not become `MISSING`
- `FOUND` with inactive authority must not become `AUTHORIZED`

Runtime lifecycle status and upstream Pro Club read state are separate
concepts.

## 9. Membership authority and staff role separation

`hasMembershipAuthority` is the canonical membership-authority projection.

The bridge must not independently derive membership authority from:

- `membershipAuthorizationRole`
- `membershipStatus`
- `staffRole`
- account role
- presentation role

Football staff role alone is never tenant membership authority.

A non-null `staffRole` must not authorize a request when
`hasMembershipAuthority` is false.

`MEMBER` must not become `COACH`.

`OWNER` must not be collapsed into `ADMIN`.

The bridge preserves the existing separation between membership authorization
and football staff assignment.

## 10. Runtime provenance and stale result protection

Organization Runtime Selection owns:

- runtime generation
- trusted resolution request provenance
- stale-result rejection
- exact UID binding
- exact organization type binding
- exact organization ID binding
- authorization proof creation

The Pro Club bridge must compose these protections rather than recreate them.

The bridge must pass the exact trusted request to
`createOrganizationResolutionResult`.

It must not construct a structural lookalike result object manually.

A result produced for an older request must never authorize a newer runtime
selection.

## 11. Academy preservation

Academy authority remains unchanged.

This slice must not modify:

- `src/contexts/AcademyContext.tsx`
- Academy Membership authority
- Academy Firestore Rules
- SuperAdmin Academy workspace behavior
- Academy Match authority
- Academy lifecycle behavior

Existing `activeAcademyId` compatibility behavior remains outside the generic
Organization Runtime authority source.

No Pro Club path may use an Academy canonical path.

## 12. Authentication preservation

This Contract Freeze does not modify:

`src/contexts/AuthContext.tsx`

The existing distinction remains:

- `actualUser` = real authenticated account context
- `currentUser` = actual user or support-presented user

A later React integration slice must undergo a separate security review before
Organization Runtime is wired to authentication lifecycle.

## 13. No persistence

The bridge is runtime-only and read-only.

It must not write:

- Firestore
- `localStorage`
- `sessionStorage`
- cookies
- user documents
- membership documents
- Pro Club documents

This slice must not introduce:

- `activeProClubId`
- persisted `activeOrganizationId`
- persisted `activeOrganizationType`
- persisted generic organization role
- persisted generic tenant authority

Selection remains runtime intent only.

## 14. No mutation authority

The bridge must not import or call:

- `setDoc`
- `updateDoc`
- `deleteDoc`
- `addDoc`
- `writeBatch`
- `runTransaction`

The bridge performs authority resolution only.

## 15. No provider or UI integration

This slice does not approve:

- `OrganizationRuntimeProvider`
- `OrganizationProvider`
- Pro Club dashboard wiring
- organization selector UI
- App navigation changes
- Match Workspace changes
- account-wide organization discovery
- SuperAdmin Pro Club workspace
- Pro Club support mode

React/provider integration requires a later dedicated slice.

## 16. SuperAdmin boundary

SuperAdmin Pro Club runtime integration remains closed.

Existing SuperAdmin:

`proClubAuthority = NOT_CONNECTED`

remains unchanged in this slice.

No support-presented user may become the authenticated Organization Runtime
actor.

## 17. Result shape requirement

Future bridge output must preserve both:

1. Organization Runtime resolution result
2. exact upstream Pro Club `sourceState`

Equivalent shape:

`{ sourceState, runtimeResult }`

where `runtimeResult` is produced only through
`createOrganizationResolutionResult`.

For a valid supported request, `runtimeResult` must correspond to the mapping
defined in this contract.

For an invalid or unsupported runtime request, the bridge must fail closed and
must not fabricate authority.

## 18. Implementation scope

The later implementation slice may add exactly:

`src/lib/organizationRuntimeProClubAuthorityBridge.ts`

and dedicated tests for that bridge.

The implementation slice must not modify existing production source files
without a new reviewed scope expansion.

Contract Freeze itself adds only:

- `docs/ORGANIZATION_RUNTIME_SELECTION_V1_PRO_CLUB_AUTHORITY_BRIDGE_FREEZE.md`
- `tests/organizationRuntimeProClubAuthorityBridgeContract.test.ts`

No existing production source file may change during this Contract Freeze.

## 19. Required implementation tests

The later implementation tests must prove at minimum:

- exact `PRO_CLUB` request resolves through the canonical adapter
- `ACADEMY` request does not call the Pro Club adapter
- active canonical membership may authorize
- inactive canonical membership rejects
- `staffRole` alone cannot authorize
- `MISSING` rejects
- `PERMISSION_DENIED` errors
- `INVALID_DATA` errors
- upstream `ERROR` errors
- source state remains preserved
- mismatched returned UID errors
- mismatched organization ID errors
- mismatched organization type errors
- fabricated runtime request cannot produce trusted authorization
- stale runtime result cannot authorize a newer generation
- no persistence or mutation API is imported

## 20. Exit gate

Contract Freeze is GREEN only when:

- Contract test passes
- existing Organization Runtime contract remains GREEN
- existing Pro Club Organization Adapter contract remains GREEN
- TypeScript remains GREEN
- `git diff --check` passes
- only the two approved Contract Freeze files are changed
- no commit has occurred
- no push has occurred
- no deploy has occurred

Only after this Contract Freeze is reviewed and accepted may the dedicated
Pro Club Authority Bridge implementation begin.