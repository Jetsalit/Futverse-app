# Pro Club Mobile Entry Performance Corrective V1 Design

Date: 2026-09-20
Baseline: `main` at `b42d1fb6dd948748279b6f3d90668aaf243ce05b`
Status: Design review gate; implementation not started
Scope class: Pro Club client read-path and loading-performance corrective only

## 1. Goal

Make entry from the authenticated FutVerse shell into an existing Pro Club workspace feel fast and dependable on phones and iPads, including devices used by players and coaches, without weakening canonical authority checks or changing production data, rules, Functions, or deployment configuration.

The user must receive an immediate Pro Club loading shell, and the client must stop repeating the same canonical Pro Club authority read during one exact organization-runtime resolution.

This corrective is intentionally limited to the entry path. It does not redesign football workflows or optimize unrelated Academy screens.

## 2. Observed baseline and cause

The deployed baseline is valid and functionally accepted, but its Pro Club entry path performs duplicated work:

1. `ProClubPortal` discovers the signed-in user's Pro Club memberships.
2. It calls `repository.loadWorkspace(clubId, uid)` for every discovered club to build candidate authority objects.
3. `selectProClub(clubId)` starts the Organization Runtime authority bridge, which resolves the same authority again.
4. After authorization, `ClubWorkspace` calls `repository.loadWorkspace(clubId, uid)` again before rendering the dashboard.

For one discovered club, this is one membership-discovery query plus three canonical authority resolutions. A canonical authority resolution reads the club, membership, and staff assignment, so the first entry can initiate ten server-only Firestore read operations before the workspace is usable. The restored-session path still resolves authority through the runtime and then repeats it in `ClubWorkspace`.

The production build at this baseline also emits a single JavaScript asset of approximately 2.65 MB minified and 699 kB gzip. `App.tsx` imports `ProClubPortal` eagerly along with the other large application areas. On mobile hardware this increases download, parse, and execution work before and around navigation.

Academy feels faster because `AcademyContext` resolves its membership and academy once and exposes that authorized context to its consumers. The corrective adopts the same ownership principle while retaining the stricter Pro Club runtime provenance model.

The previously reported Match selector behavior is a separate interaction/read-path concern after entry. It is not silently included in this corrective because doing so would broaden the risk surface beyond the requested entry-performance boundary.

## 3. Users and device priority

The corrective must work for:

- coaches and other active Pro Club staff using phones or tablets;
- players whose account and membership policy permits the Pro Club destination;
- iPad portrait and landscape layouts;
- common phone widths from 360 px upward;
- slower mobile CPUs and variable Wi-Fi or cellular networks.

Desktop behavior must remain correct, but mobile entry latency and clear progress feedback take priority.

## 4. Security invariants

Performance must not become an authorization shortcut.

- Organization Runtime remains the sole creator and owner of trusted resolution requests.
- The canonical Pro Club Organization Adapter remains the authority resolver.
- A structural lookalike object from a component must never be accepted as trusted authority.
- Authority is scoped to the exact `uid`, `organizationId`, and runtime `generation` that produced it.
- Changing user, organization, or generation immediately invalidates the prior resolved authority.
- Missing, rejected, permission-denied, invalid, stale, or mismatched results fail closed.
- Locally cached Firestore data must not become authoritative.
- Sensitive writes continue to perform their existing server-side or repository-level revalidation. This corrective only removes duplicate client reads used to open the workspace.
- Support presentation must remain unable to enter Pro Club through the normal user path.

## 5. Chosen architecture

### 5.1 Runtime-owned authority result

Extend the Organization Runtime provider with a read-only Pro Club authority result produced by the existing trusted bridge request.

When `resolveProClubRuntimeAuthority(request)` returns a valid `AUTHORIZED` runtime result and a matching `FOUND` authority source, the provider atomically applies the runtime result and retains the corresponding `ProClubOrganizationAuthority` for that exact runtime generation.

The exposed state must be treated as a verified result, not as caller-supplied data. Components may consume it, but no public context method may accept an authority object from a component.

The provider clears the retained authority whenever:

- the authenticated actor changes;
- a new selection begins;
- runtime generation changes;
- resolution rejects or errors;
- identity integrity fails.

The existing request-identity protection and `WeakMap` in-flight deduplication remain intact.

### 5.2 Single-club and restored-session entry

For an exact restored club reference:

1. render the Pro Club shell immediately;
2. ask Organization Runtime to select the exact club;
3. resolve canonical authority once;
4. render `ClubWorkspace` using the provider-owned verified authority.

For exactly one discovered membership:

1. discover the club ID;
2. select that exact club without first calling `repository.loadWorkspace` in the portal;
3. resolve canonical authority once through Organization Runtime;
4. reuse that verified authority in `ClubWorkspace`.

This removes both duplicated workspace loads from the common single-club entry path.

### 5.3 Multiple-club discovery

Multiple-club users still need a trustworthy label for each option. Candidate authority reads may run concurrently, but each result is kept only as display/selection metadata and must not authorize entry by itself.

After the user chooses a club, Organization Runtime performs the canonical trusted selection. If the chosen candidate has already been resolved by the same canonical adapter for the same exact authenticated actor, the implementation plan may introduce a runtime-owned adoption operation only if it preserves trusted request identity and is covered by adversarial tests. Otherwise the selected club is resolved once more by the runtime. Correctness and provenance take priority over eliminating this uncommon extra read.

The common one-club and restored-session paths must not pay the multiple-club candidate cost.

### 5.4 Workspace consumption

`ClubWorkspace` no longer calls `repository.loadWorkspace` on mount. It receives or reads the exact provider-owned verified authority that matches:

- the current authenticated `uid`;
- the current selected Pro Club ID;
- the current authorized runtime generation.

Any mismatch renders the fail-closed loading/error boundary rather than a dashboard.

### 5.5 Pro Club code loading

Replace the eager `ProClubPortal` import in `App.tsx` with a stable `React.lazy` loader and a Pro Club-specific `Suspense` fallback.

Use the same loader function for a safe preload after the authenticated dashboard becomes idle and the existing `canOpenProClub` eligibility gate is true. Mobile tap, keyboard activation, or direct navigation must still work when preload has not completed.

The loader affects code delivery only. It does not prefetch protected Firestore data and does not bypass authentication, App Check, or membership resolution.

### 5.6 Progressive loading experience

Entry renders a lightweight shell immediately with the current stage expressed in accessible status text:

- loading the Pro Club module;
- checking active membership;
- opening the verified club workspace.

The shell retains Back and Sign out actions whenever the authenticated application state makes them safe. It must not show an empty white page or replace an authority error with an endless spinner. Existing fail-closed error/recovery behavior remains available.

## 6. Alternatives considered

### Cache authority in local storage

Rejected. Local storage is suitable for remembering an exact club reference, but not for establishing current membership authority.

### Pass discovery authority directly into the dashboard

Rejected. This would let a component-originated object cross the authority boundary and would weaken the trusted Organization Runtime provenance contract.

### Change Firestore reads from server-only to cache-first

Rejected. It could display revoked or stale authority and would conflict with the current fail-closed production contract.

### Optimize the entire application bundle

Rejected for V1. Broad route refactoring and manual chunk policy would leave the critical path and introduce unrelated regression risk. This corrective splits and preloads only the Pro Club destination.

### Include Match roster/read consolidation

Deferred. Match loading contains its own repository and authority-read duplication and deserves a separately approved corrective after entry V1. `roster r26` remains a roster revision label, not a count of 26 players.

## 7. Protected files and explicit non-goals

The following production-sensitive areas are frozen for this corrective:

- `firestore.rules`
- `firestore.indexes.json`
- `firebase.json`
- `firebase.spark.json`
- `.firebaserc`
- `firebase-applet-config.json`
- `functions/**`
- `src/lib/firebase.ts`
- `src/contexts/AcademyContext.tsx`
- `package.json`, package lockfiles, and dependency versions

This corrective must not:

- deploy Hosting, Functions, Firestore Rules, or indexes;
- write, migrate, seed, delete, or repair production data;
- change Firestore document paths or schema;
- weaken App Check, Auth, Organization Runtime, membership, or staff-role validation;
- change onboarding, invitation, review, or membership-write behavior;
- change Academy behavior;
- redesign Pro Club pages or football workflows;
- optimize unrelated application modules;
- modify the Match selector, roster revision, Starting XI, or Match persistence;
- delete, rename, reset, or force-update existing files or history.

No new dependency is required.

## 8. Expected implementation surface

The implementation plan may change only the smallest set needed from:

- `src/App.tsx` for lazy loading, fallback, and eligible preload;
- `src/contexts/OrganizationRuntimeContext.tsx` for runtime-owned verified authority state;
- `src/lib/organizationRuntimeProClubAuthorityBridge.ts` only if its result contract must expose the already-resolved authority without a second read;
- `src/components/pro-club/ProClubPortal.tsx` for single-club discovery, runtime consumption, and progressive shell;
- focused test files for these contracts.

If implementation proves that another production source file is required, work pauses and the written design is amended and reviewed before that scope is added.

## 9. Performance and behavior acceptance criteria

### Deterministic contract criteria

- Restored-session entry performs one canonical authority resolution for the exact runtime request and does not call `ClubWorkspace` authority loading again.
- Single-club discovery performs one discovery query and one canonical authority resolution; it does not pre-resolve the same club in the candidate loop.
- Re-rendering the same resolving runtime request does not start another authority promise.
- A new `uid`, club selection, or runtime generation cannot reuse prior authority.
- Unauthorized, rejected, invalid, or failed authority never renders `ProClubTeamDashboard`.
- Pro Club code is absent from the eager `App.tsx` import graph and is emitted as a separate lazy chunk by the production build.
- Eligible background preload never starts a protected data read.

### User-perceived criteria

- A visible Pro Club loading shell appears within one second of activation on the controlled mobile test setup.
- The authorized Pro Club overview becomes usable within three seconds on the controlled stable-network setup for a restored or single-club account.
- If the three-second target is missed, captured timings must identify module loading, App Check/Auth readiness, membership discovery, authority resolution, or workspace render as the remaining delay; acceptance cannot be claimed from impression alone.
- There is no blank-page interval during module or authority loading.
- Phone and iPad portrait/landscape entry controls remain reachable and readable.

Time thresholds are verified with repeatable device/network conditions and are not encoded as flaky unit-test timers.

## 10. Required tests

Implementation follows test-driven development. Failing tests are added before production code for:

- provider stores only bridge-produced authority matching exact request identity;
- provider clears authority on actor, club, generation, rejected, and error transitions;
- forged or mismatched bridge data fails closed;
- restored session resolves authority once and reuses it in the workspace;
- one discovered club skips candidate `loadWorkspace` and resolves through runtime once;
- multiple discovered clubs remain selectable without granting authority from display data;
- stale async results cannot authorize a later actor or selection;
- `ClubWorkspace` never renders with mismatched authority;
- lazy module fallback and load failure remain recoverable;
- preload is eligibility-gated and does not issue Firestore reads;
- phone and tablet entry regression coverage.

The final verification gate must include:

- all focused new tests;
- existing Organization Runtime and Pro Club authority tests;
- existing Pro Club tablet/mobile regression suites;
- TypeScript compilation;
- production build and bundle/chunk inspection;
- `git diff --check`;
- a protected-file diff gate proving every frozen path is unchanged;
- exact HEAD and clean-worktree reporting.

## 11. Delivery boundary

Work occurs only on the isolated branch `perf/pro-club-mobile-entry-corrective-v1`, created from exact baseline `b42d1fb6dd948748279b6f3d90668aaf243ce05b`.

Delivery order is:

1. approve this written design;
2. write and approve a file-by-file implementation plan;
3. implement with failing tests first;
4. run full corrective and regression verification;
5. review the exact diff and protected-file gate;
6. create a PR for controlled review;
7. merge only after explicit authorization and exact-head checks;
8. deploy only under a separate explicit production-deploy instruction.

This design does not authorize merge, deployment, Firebase configuration changes, or production writes.

## 12. Rollback and failure handling

Before merge, rollback is branch-only: stop and leave `main` unchanged.

After a later authorized merge, the corrective remains separable because it does not change data, schema, rules, Functions, or dependencies. A normal revert PR can restore the eager import and prior entry-read flow without data rollback.

If authority provenance cannot be preserved while reusing the resolved object, the optimization must fail closed and retain the existing canonical read rather than weaken authorization.
