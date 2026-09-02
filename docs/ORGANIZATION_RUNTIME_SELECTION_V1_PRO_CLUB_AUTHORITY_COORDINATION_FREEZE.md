# FutVerse Organization Runtime Selection V1
# Pro Club Authority Coordination Contract Freeze

## 1. Purpose

This Contract Freeze defines the future React-owned coordination boundary
between `OrganizationRuntimeProvider` and
`resolveProClubRuntimeAuthority(request, ops?)`.

This is a coordination slice only. It does not implement production behavior,
tenant mutation, organization discovery, or organization-selection UI.

The governing invariant remains:

`SELECTION != AUTHORITY`

Selecting a Pro Club represents runtime intent only. It never grants tenant
authority without the canonical runtime request, Pro Club authority bridge,
and exact current runtime result-application chain defined below.

## 2. Exact predecessor baseline

- base branch: `main`
- base commit: `be0300c2d5a9dbc03d5660d6d344d2098ffc000e`
- contract branch:
  `feat/organization-runtime-selection-v1-pro-club-authority-coordination-contract`

The predecessor React Auth Lifecycle implementation from PR #48 owns only the
authenticated actor lifecycle and fail-closed runtime instance. It binds the
runtime actor to `actualUser.uid`, but it does not yet coordinate Pro Club
selection or authority resolution.

## 3. Existing API ownership

Future coordination must compose the existing pure runtime APIs from
`src/lib/organizationRuntimeSelection.ts`:

- `selectOrganization`
- `beginOrganizationResolution`
- `getOrganizationResolutionRequest`
- `applyOrganizationResolution`

Future coordination must use the existing bridge from
`src/lib/organizationRuntimeProClubAuthorityBridge.ts`:

`resolveProClubRuntimeAuthority(request, ops?)`

The provider must not duplicate runtime lifecycle logic. It must not duplicate
Pro Club document, membership, staff, identity, role, or status logic.

Canonical Pro Club authority remains owned by the existing bridge and its
existing adapter chain.

## 4. Authenticated actor boundary

The Organization Runtime actor is exactly:

`actualUser.uid`

The actor must not come from:

- `currentUser.uid`
- a support-presented user UID
- a UI-supplied UID
- account role
- presentation role

`PRESENTED USER != AUTHENTICATED ACTOR`

Support presentation may change application presentation. It must never
replace, proxy, or synthesize the Organization Runtime actor.

## 5. Selection boundary

A future provider coordination implementation may expose a narrow organization
selection action equivalent to:

`selectOrganization("PRO_CLUB", organizationId)`

The public caller may provide only reviewed organization-selection intent.
It must not provide or inject:

- UID
- generation
- resolution request
- runtime authority result
- authorization proof
- bridge `ops`
- Membership authority
- runtime state

The authenticated UID and runtime generation remain internally owned.

## 6. Lifecycle

The frozen lifecycle is:

`UNSELECTED -> SELECTED -> RESOLVING -> AUTHORIZED | REJECTED | ERROR`

The exact API chain is:

1. selection intent -> `selectOrganization`
2. resolution start -> `beginOrganizationResolution`
3. trusted request -> `getOrganizationResolutionRequest`
4. authority resolution -> `resolveProClubRuntimeAuthority`
5. result application -> `applyOrganizationResolution`

No phase may be bypassed to produce `AUTHORIZED`.

`SELECTED` and `RESOLVING` are fail-closed lifecycle states. Neither is tenant
authority.

## 7. Pro Club-only coordination

The bridge supports exactly `PRO_CLUB` coordination.

An `ACADEMY` selection:

- must not call the Pro Club bridge;
- must not create an Academy authority shortcut;
- must not create generic runtime authority that replaces `AcademyProvider`;
- must remain outside this coordination slice.

Academy authority remains separately owned by its existing canonical path.

## 8. Async stale-result protection

A future implementation must apply an asynchronous bridge result to the
current React runtime state, never to state captured before the request:

```ts
setRuntimeState((current) =>
  applyOrganizationResolution(current, result),
);
```

An equivalent functional-current-state mechanism is acceptable.

Captured stale state must never overwrite the current runtime.

The following scenarios are frozen:

- A resolving -> select B -> A returns -> A must not authorize B;
- A resolving -> logout -> A returns -> no authority;
- A resolving -> authenticated UID changes -> A returns -> no authority;
- unmount/remount -> predecessor completion -> no successor authority;
- StrictMode or duplicate execution -> stale completion must not authorize a
  new runtime.

Pure runtime request provenance, exact UID, exact organization type, exact
organization ID, and exact generation remain the final authority on whether a
result is applicable.

## 9. In-flight coordination

A future implementation must prevent duplicate or stale asynchronous
completion from changing current authority.

This Contract Freeze does not mandate one implementation mechanism. A later
implementation may use:

- request identity;
- generation;
- effect cleanup;
- an in-flight guard;
- an equivalent mechanism.

Canonical runtime provenance remains the final safety boundary. No
client-side authority cache is approved.

## 10. Exact authority mapping

The existing bridge mapping is preserved exactly:

- `FOUND + hasMembershipAuthority=true -> AUTHORIZED`
- `FOUND + hasMembershipAuthority=false -> REJECTED`
- `MISSING -> REJECTED`
- `PERMISSION_DENIED -> ERROR`
- `INVALID_DATA -> ERROR`
- `ERROR -> ERROR`
- `identity mismatch/integrity failure -> ERROR`

A `staffRole` alone must never authorize. Football staff assignment remains
separate from canonical Membership authority.

## 11. Academy preservation

This coordination slice must not change:

- `AcademyContext`;
- `AcademyProvider` authority;
- Academy Membership resolution;
- Academy tenant roles;
- `activeAcademyId` compatibility;
- Academy Firestore Rules;
- Academy Match authority;
- SuperAdmin Academy workspace behavior.

Generic Organization Runtime authority must not replace Academy authority.

## 12. SuperAdmin preservation

This coordination slice must not change:

- `SuperAdminSupportContext`;
- `SuperAdminNonStaffSupportContext`;
- `SupportPresentedUserBridge`;
- Work As Staff;
- non-staff support;
- support audit lifecycle.

A support-presented identity must not bind the Organization Runtime actor.

## 13. No persistence

Organization Runtime remains in-memory. This slice does not approve:

- Firestore persistence;
- `localStorage`;
- `sessionStorage`;
- cookies;
- `IndexedDB`;
- URL persistence;
- persisted `activeProClubId`;
- persisted `activeOrganizationId`;
- persisted `activeOrganizationType`;
- persisted generic organization role;
- persisted generic authority.

Selection and authority must be re-established from canonical evidence for the
current authenticated runtime.

## 14. No mutation

Coordination is an authority-resolution read path only. It must not add or call:

- `setDoc`;
- `updateDoc`;
- `deleteDoc`;
- `addDoc`;
- `writeBatch`;
- `runTransaction`.

This Contract Freeze does not change Firestore Rules or production data.

## 15. No UI

This slice does not approve:

- Organization Selector;
- Academy/Pro Club switcher;
- Dashboard picker;
- Command Center picker;
- navigation changes;
- route-driven authority;
- account-wide organization discovery;
- Pro Club dashboard wiring.

UI and discovery require later dedicated review.

## 16. No authority injection

A future provider API must not expose a setter or method through which a caller
can inject:

- runtime state;
- `AUTHORIZED` status;
- resolution result;
- authorization proof;
- UID;
- generation;
- bridge `ops`;
- Membership authority.

Authority results must originate from the canonical pure-runtime and Pro Club
bridge chain only.

## 17. React provider ownership

A future implementation may expand
`src/contexts/OrganizationRuntimeContext.tsx` to own:

- runtime state;
- a narrow Pro Club selection action;
- Pro Club resolution coordination.

It must preserve the provider placement introduced by PR #48 and actor binding
to `actualUser.uid`.

It must not modify the `AuthContext` authority model. Public provider props
remain children-only and must not accept actor or authority inputs.

## 18. Predecessor succession

The predecessor React Auth Lifecycle phase intentionally prohibited:

- organization selection;
- Pro Club bridge invocation;
- network authority resolution;
- context expansion.

A later approved coordination implementation may supersede only those
phase-specific prohibitions required for Pro Club coordination.

The following predecessor guarantees remain preserved:

- `actualUser.uid` actor ownership;
- Academy separation;
- SuperAdmin support separation;
- no persistence;
- no mutation authority;
- no selector UI;
- provider placement;
- keyed authenticated actor lifecycle.

Predecessor tests must not be modified during this Contract Freeze. Any later
implementation test succession must be explicitly scoped and independently
reviewed.

## 19. Future implementation scope

This Contract Freeze proposes the minimum future production scope:

- modify `src/contexts/OrganizationRuntimeContext.tsx`;
- add dedicated coordination tests.

No additional production file is approved automatically.

If implementation requires modifying another production file, work must stop
for reviewed scope expansion before that change.

The Contract Freeze itself is limited exactly to:

- `docs/ORGANIZATION_RUNTIME_SELECTION_V1_PRO_CLUB_AUTHORITY_COORDINATION_FREEZE.md`;
- `tests/organizationRuntimeProClubAuthorityCoordinationContract.test.ts`.

## 20. Required future tests

A later implementation must prove at minimum:

1. valid `PRO_CLUB` active Membership -> `AUTHORIZED`;
2. inactive Membership -> `REJECTED`;
3. missing Membership -> `REJECTED`;
4. permission denied -> `ERROR`;
5. invalid data -> `ERROR`;
6. upstream error -> `ERROR`;
7. exact UID mismatch cannot authorize;
8. exact organization ID mismatch cannot authorize;
9. exact organization type mismatch cannot authorize;
10. `staffRole` cannot authorize without Membership authority;
11. fabricated request cannot authorize;
12. stale generation cannot authorize;
13. switch A -> B while A is pending rejects A completion;
14. logout while pending rejects the pending completion;
15. authenticated UID change while pending rejects the pending completion;
16. same-UID lifecycle remains correctly owned;
17. StrictMode or duplicate execution cannot grant stale authority;
18. `ACADEMY` never calls the Pro Club bridge;
19. `actualUser.uid` is the actor;
20. support-presented `currentUser` is not the actor;
21. Academy source remains unchanged;
22. SuperAdmin support source remains unchanged;
23. no persistence exists;
24. no mutation exists;
25. no organization selector UI exists;
26. no account-wide discovery exists.

Existing pure runtime, Pro Club bridge, Pro Club adapter, React Auth Lifecycle,
mounted lifecycle, succession, Academy, and support tests must remain GREEN.

## 21. Team 2 review gate

Team 1 must not approve its own work for commit.

An independent Team 2 review must verify:

- architecture;
- authenticated actor boundary;
- request provenance;
- asynchronous and stale-result safety;
- StrictMode risk;
- Pro Club authority mapping;
- Academy preservation;
- SuperAdmin preservation;
- persistence boundary;
- mutation boundary;
- UI boundary;
- exact file scope;
- predecessor contract succession;
- tests;
- TypeScript and build regression where appropriate.

The Contract Freeze must not be committed until Team 2 reports GREEN.
