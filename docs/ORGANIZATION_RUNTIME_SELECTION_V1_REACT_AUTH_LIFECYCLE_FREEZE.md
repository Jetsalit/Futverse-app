# FutVerse Organization Runtime Selection V1
# React Auth Lifecycle Integration Contract Freeze

Status: FROZEN FOR LATER REACT AUTH LIFECYCLE IMPLEMENTATION

Baseline:

- base branch: `main`
- base SHA: `fc8114787cd8a665fc7acad2bab28c368c274b24`
- contract branch: `feat/organization-runtime-selection-v1-react-auth-lifecycle-contract`

## 1. Purpose

This contract defines the first React ownership boundary for:

`Organization Runtime Selection V1`

The slice connects the already verified pure Organization Runtime lifecycle to
the real authenticated Firebase actor lifecycle.

The fundamental invariant remains:

`SELECTION != AUTHORITY`

This slice does not authorize a Pro Club, does not replace Academy authority,
and does not introduce an organization selector.

## 2. Authenticated actor ownership

Organization Runtime must bind to the real authenticated account:

`actualUser.uid`

`actualUser` is the account identity derived from Firebase Auth.

The runtime must not use:

`currentUser.uid`

as authenticated actor authority because `currentUser` may represent a
SuperAdmin support-presented user.

Support presentation must never replace the Organization Runtime actor.

`PRESENTED USER != AUTHENTICATED ACTOR`
### Public provider actor input boundary

The public `OrganizationRuntimeProvider` interface must derive authenticated
actor identity internally from `useAuth()` and the exact:

`actualUser.uid`

The public provider API must not accept an externally supplied actor or
authority input.

In this first implementation:

`children`

is the only public provider prop approved by this contract.

The public provider must not accept equivalent props for:

- `uid`
- `user`
- `actualUser`
- `currentUser`
- `runtimeState`
- `authorizationProof`
- organization selection
- tenant membership authority
- Pro Club authority evidence

A private implementation detail beneath the provider may receive an actor UID
only when that value has already been derived internally from the exact
`actualUser.uid`.

A caller must never be able to substitute another account identity or runtime
authority through provider props.

`CALLER INPUT != AUTHENTICATED ACTOR AUTHORITY`

## 3. Provider placement

The later React implementation may introduce:

`OrganizationRuntimeProvider`

The provider must be inside:

`AuthProvider`

so it may consume `actualUser`.

It must remain outside and above:

- `SuperAdminSupportProvider`
- `SuperAdminNonStaffSupportProvider`
- `SupportPresentedUserBridge`
- `AcademyProvider`

Required conceptual provider order:

`AuthProvider`

-> `OrganizationRuntimeProvider`

-> existing SuperAdmin support providers

-> `SupportPresentedUserBridge`

-> existing `AcademyProvider`

The existing support and Academy providers remain otherwise unchanged.

## 4. Runtime ownership

The future provider owns one in-memory Organization Runtime state for the
current real authenticated actor.

It must compose the existing pure runtime model from:

`src/lib/organizationRuntimeSelection.ts`

It must not duplicate Organization Runtime lifecycle semantics.

The lifecycle must continue to use the frozen pure runtime APIs, including
equivalent use of:

- `createOrganizationRuntime`
- `bindOrganizationRuntimeUid`
### RUNTIME LIFECYCLE API ALLOWLIST

The React Auth Lifecycle provider may invoke exactly these Organization Runtime
state-transition APIs in this slice:

- `createOrganizationRuntime`
- `bindOrganizationRuntimeUid`

Type-only imports required to describe the runtime state are allowed.

No other Organization Runtime function may be invoked by this lifecycle
provider.

In particular, this slice must not import or invoke:

- `clearOrganizationRuntime`
- `selectOrganization`
- `beginOrganizationResolution`
- `getOrganizationResolutionRequest`
- `createOrganizationResolutionResult`
- `applyOrganizationResolution`
- `isOrganizationRuntimeAuthorized`

The provider must not create selection intent, begin authority resolution,
accept authority results, manufacture authority results, or interpret an
authorized runtime.

Those capabilities remain reserved for separately reviewed later slices.

`AUTH LIFECYCLE != ORGANIZATION SELECTION OR AUTHORITY RESOLUTION`

The React integration must not recreate trusted runtime states or authority
proofs structurally.

## 5. Authentication UID change

A runtime belonging to UID A must never remain effective for UID B.

When real authenticated identity changes:

`UID A -> UID B`

the state visible to B must already be fail-closed for B before tenant-scoped
children may consume runtime authority.

The integration must not rely on an after-render effect in a way that permits
even one committed render of UID B children with UID A runtime authority.

Acceptable implementation mechanisms include an actor-keyed runtime owner,
synchronous identity guarding, or an equivalent fail-closed design.

The required security property is:

`NO STALE ACTOR AUTHORITY RENDER WINDOW`

UID B begins with a fresh or equivalently cleared runtime state.

Selection and authorization belonging to UID A must not carry over.

## 6. Logout and unauthenticated state

When the real authenticated actor becomes null:

- selected organization from the prior actor is unavailable
- resolving state from the prior actor is unavailable
- authorized organization context from the prior actor is unavailable
- stale authority results cannot reactivate the prior actor
- exposed runtime is `UNSELECTED` or equivalent fail-closed state
- runtime UID is null

Logout must not preserve Organization Runtime authority.

## 7. Same-UID refresh behavior

A refreshed `actualUser` object representing the same exact Firebase UID must
not be treated as a different actor merely because object identity changed.

Actor identity is the exact authenticated UID.

The implementation must avoid unnecessary authority reset caused only by an
equivalent same-UID user object refresh.

## 8. AuthContext preservation

This slice must not modify:

`src/contexts/AuthContext.tsx`

Existing identity semantics remain:

- `actualUser` = real authenticated account
- `currentUser` = actual account or support-presented user

The React lifecycle integration consumes this boundary; it does not redefine
it.

## 9. Academy authority preservation

Academy authority remains unchanged.

This slice must not modify:

- `src/contexts/AcademyContext.tsx`
- Academy membership resolution
- Academy tenant role resolution
- Academy support workspace behavior
- Academy Firestore Rules
- Academy Match authority
- legacy `activeAcademyId` compatibility behavior

`OrganizationRuntimeProvider` must not replace `AcademyProvider`.

No generic Organization Runtime authorization proof becomes Academy authority
in this slice.

## 10. SuperAdmin preservation

This slice must not modify:

- `SuperAdminSupportContext`
- `SuperAdminNonStaffSupportContext`
- `SupportPresentedUserBridge`
- Work As Staff behavior
- non-staff support presentation
- durable support auditing
- Academy support workspace
- support session lifecycle

SuperAdmin Pro Club runtime remains not connected.

Support-presented identities must not bind Organization Runtime actor state.

## 11. Pro Club resolution remains closed

The existing bridge:

`resolveProClubRuntimeAuthority(request, ops?)`

remains available but is not consumed by this lifecycle slice.

The future lifecycle provider must not import or invoke:

`resolveProClubRuntimeAuthority`

This slice performs no Pro Club authority read.

It creates no `RESOLVING` transition automatically.

It creates no `AUTHORIZED` Pro Club runtime automatically.

Pro Club selection/resolution coordination requires a later dedicated slice.

## 12. No organization selection UI

This slice does not introduce:

- organization selector
- Academy/Pro Club switcher
- Pro Club picker
- Dashboard organization selection
- Command Center organization selection
- navigation changes
- route-driven organization authority

No UI may select an organization in this slice.

## 13. No account-wide discovery

This slice must not query or infer account-wide organization relationships.

It must not introduce:

- Pro Club membership discovery
- Academy membership discovery
- collection-group organization discovery
- Academy/Pro Club union inventory
- fallback organization search
- generic `organizations` collection

Discovery remains a separate architecture problem.

## 14. In-memory only

Organization Runtime remains in-memory only.

This slice must not persist runtime selection or authority to:

- Firestore
- `localStorage`
- `sessionStorage`
- cookies
- IndexedDB
- URL persistence
- user documents
- organization documents

It must not introduce:

- `activeProClubId`
- persisted `activeOrganizationId`
- persisted `activeOrganizationType`
- persisted generic organization role
- persisted tenant authority

## 15. No mutation or network authority work

The lifecycle owner itself performs no Firestore read or write.

It must not import or call mutation APIs such as:

- `setDoc`
- `updateDoc`
- `deleteDoc`
- `addDoc`
- `writeBatch`
- `runTransaction`

It must not perform organization authority network resolution.

Its responsibility is React ownership of the pure runtime lifecycle and
authenticated actor binding only.

## 16. Minimal React context surface

The first implementation should expose only the lifecycle state required for
later integration.

Equivalent read surface:

`runtimeState`

Equivalent consumer hook:

`useOrganizationRuntime`

This slice does not approve public organization-selection actions or authority
resolution actions.

Those capabilities require later reviewed scope expansion.

## 17. Future implementation candidate

Only after this Contract Freeze and Team 2 review are GREEN may a later
implementation candidate modify exactly:

- add `src/contexts/OrganizationRuntimeContext.tsx`
- modify `src/main.tsx`
- add `tests/organizationRuntimeReactAuthLifecycle.test.ts`

No other production source file is approved by this contract.

In particular, the implementation must not modify:

- `src/contexts/AuthContext.tsx`
- `src/contexts/AcademyContext.tsx`
- `src/contexts/SupportPresentedUserBridge.tsx`
- `src/contexts/SuperAdminSupportContext.tsx`
- `src/contexts/SuperAdminNonStaffSupportContext.tsx`
- `firestore.rules`

## 18. Required later implementation tests

The later implementation must prove at minimum:

1. provider is beneath `AuthProvider`;
2. provider is above SuperAdmin support/presentation providers;
3. runtime actor comes only from `actualUser.uid`;
4. `currentUser` cannot become runtime actor authority;
5. unauthenticated actor exposes fail-closed unselected runtime;
6. UID A to UID B cannot expose A runtime authority to B;
7. logout/null actor removes prior selection and authority;
8. same UID object refresh does not unnecessarily become a new actor;
9. provider does not resolve Pro Club authority;
10. provider does not import Pro Club authority bridge;
11. provider does not touch Academy authority;
12. provider performs no Firestore read/write;
13. provider performs no persistence;
14. existing Organization Runtime tests remain GREEN;
15. existing Pro Club bridge tests remain GREEN;
16. TypeScript remains GREEN.
17. public provider props cannot inject UID, user, runtime state, selection, or
    authority;
18. lifecycle provider invokes only `createOrganizationRuntime` and
    `bindOrganizationRuntimeUid`, with no selection, resolution, apply, or
    Pro Club authority bridge API.

## 19. Contract Freeze exact scope

This Contract Freeze may add exactly:

- `docs/ORGANIZATION_RUNTIME_SELECTION_V1_REACT_AUTH_LIFECYCLE_FREEZE.md`
- `tests/organizationRuntimeReactAuthLifecycleContract.test.ts`

No existing production source file may change during Contract Freeze.

No existing test file may change during Contract Freeze.

## 20. Two-team review gate

Team 1 authors the Contract Freeze and runs validation.

Team 1 must not approve its own work for commit.

Team 2 independently reviews:

- architecture
- authenticated identity boundary
- stale actor rendering risk
- Academy preservation
- SuperAdmin support preservation
- persistence boundary
- network/mutation boundary
- exact file scope
- contract tests
- regression
- TypeScript

Any Team 2 finding returns the work to Team 1.

Only Team 2 GREEN may advance to Controlled Staged Review and Controlled
Contract Commit.

## 21. Contract Freeze exit gate

Contract Freeze is acceptable only when:

- exact baseline remains unchanged;
- only the two approved Contract Freeze files exist as changes;
- Contract Freeze test passes;
- existing Organization Runtime contract remains GREEN;
- existing Pro Club Authority Bridge contract remains GREEN;
- pure runtime tests remain GREEN;
- Pro Club bridge tests remain GREEN;
- TypeScript remains GREEN;
- protected production source hashes remain unchanged;
- Team 2 independent review passes;
- no commit occurs before review;
- no push occurs before review;
- no deploy occurs.

The next candidate after a GREEN Contract Freeze is:

`ORGANIZATION RUNTIME SELECTION V1 — REACT AUTH LIFECYCLE IMPLEMENTATION`

That implementation does not include Pro Club resolution or organization UI.