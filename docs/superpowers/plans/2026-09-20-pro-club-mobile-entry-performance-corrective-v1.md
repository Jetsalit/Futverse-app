# Pro Club Mobile Entry Performance Corrective V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution, or superpowers:subagent-driven-development if the user selects delegated execution. Steps use checkbox syntax for tracking.

**Goal:** Remove duplicate Pro Club entry authority reads and deliver responsive phone/iPad loading without changing production configuration or data.

**Architecture:** Return the existing canonical authority from the trusted bridge and store it atomically with runtime state. Reuse it only for the matching runtime generation. Lazy-load the portal with eligible idle preload; retain fresh runtime verification for multiple-club selection.

**Tech Stack:** Existing React 19, TypeScript, Vite, Node test runner, tsx, JSDOM; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-20-pro-club-mobile-entry-performance-corrective-v1-design.md` (approved by user in chat).

## Global Constraints

- Baseline: `b42d1fb6dd948748279b6f3d90668aaf243ce05b`.
- Branch: `perf/pro-club-mobile-entry-corrective-v1`; preserve the main checkout.
- No new dependency is required.
- Locally cached Firestore data must not become authoritative.
- Support presentation must remain unable to enter Pro Club through the normal user path.
- Freeze `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `firebase.spark.json`, `.firebaserc`, `firebase-applet-config.json`, `functions/**`, `src/lib/firebase.ts`, `src/contexts/AcademyContext.tsx`, all package manifests and lockfiles.
- No deploy, production write, merge, force push, deletion, rename, or unrelated optimization.
- No changes to Match/roster/Starting XI, repositories, canonical runtime model, or write revalidation.
- Pause for amended design approval if another production source file is needed.
- A visible Pro Club loading shell appears within one second of activation on the controlled mobile test setup.
- The authorized Pro Club overview becomes usable within three seconds on the controlled stable-network setup for a restored or single-club account.

## Review Focus

1. StrictMode effect replay and rapid same-club refresh: no duplicate request for one trusted request identity; old results never replace a newer generation (Task 2).
2. One discovery row with revoked membership: fail closed and retain a usable recovery path, not permanent opening state (Task 3).
3. Sign-out/user switch while discovery or authority is pending: no previous club name or dashboard appears (Tasks 2–3).
4. Rejected module preload/offline navigation: no unhandled rejection, blank page, or permanently unusable retry (Task 4).
5. iPad Safari without idle scheduling support and eligible player without staff role: fallback scheduling works and no new staff-only entry restriction appears (Tasks 3–4).

## File ownership

Production modifications are limited to four files:

| File | Responsibility |
| --- | --- |
| `src/lib/organizationRuntimeProClubAuthorityBridge.ts` | Expose the already-resolved authority only on an authorized trusted result |
| `src/contexts/OrganizationRuntimeContext.tsx` | Atomic generation-scoped runtime and authority lifecycle |
| `src/components/pro-club/ProClubPortal.tsx` | Single-club fast path, verified workspace consumption, progress/recovery |
| `src/App.tsx` | Local lazy loader, preload scheduling, loading/error boundary |

Extend existing bridge, coordination, discovery, and loading tests. Create `tests/proClubMobileEntryLoading.unit.test.tsx` for module-loading behavior. Update only directly affected mock result shapes in existing runtime lifecycle tests; never remove security assertions to obtain green tests.

## Task 1: Expose canonical authority without extra reads

**Files:** Modify bridge; extend `tests/organizationRuntimeProClubAuthorityBridge.test.ts`.

**Interfaces:** Existing `resolveProClubRuntimeAuthority(request: unknown, ops?: ProClubReadOps)` returns `ProClubRuntimeAuthorityBridgeResult`. Add required `readonly authority: Readonly<ProClubOrganizationAuthority> | null`; all non-authorized branches return null.

- [ ] Add assertions to the existing successful bridge test, using its existing trusted request and document fixtures:

```ts
assert.equal(result.authority?.organizationId, request.organizationId);
assert.equal(result.authority?.userId, request.uid);
assert.equal(result.authority?.hasMembershipAuthority, true);
assert.equal(Object.isFrozen(result.authority), true);
assert.equal(reads.length, 3);
```

- [ ] Add `assert.equal(result.authority, null)` to forged-request, Academy-request, missing, revoked, permission-denied, invalid-data, and identity-mismatch cases. Use the existing real resolver with injected read operations, not a mocked bridge, for provenance tests.
- [ ] Run `node --import tsx --test tests/organizationRuntimeProClubAuthorityBridge.test.ts`; confirm the new authority assertions fail before production edits.
- [ ] Extend the bridge result helper with a default-null authority parameter. Only the final membership-authorized branch supplies `Object.freeze({ ...authorityResult.value })`; keep every existing source-state mapping and request factory unchanged:

```ts
readonly authority: Readonly<ProClubOrganizationAuthority> | null;
// Authorized return only:
return createBridgeResult("FOUND", request, "AUTHORIZED",
  Object.freeze({ ...authorityResult.value }));
```

- [ ] Rerun bridge tests plus `tests/organizationRuntimeProClubAuthorityBridgeContract.test.ts`. Update directly affected typed bridge mock factories to include authority or null, using exact request uid/club for authorized fixtures.
- [ ] Commit only bridge and affected tests: `git commit -m "perf(pro-club): expose verified bridge authority"` after explicit-path staging and `git diff --cached --check`.

## Task 2: Atomic runtime-owned authority

**Files:** Modify context; extend `tests/organizationRuntimeProClubAuthorityCoordinationMounted.test.tsx` and directly affected lifecycle test mocks.

**Interfaces:** Keep `selectProClub(organizationId: string): void`. Add context `proClubAuthority: Readonly<ProClubOrganizationAuthority> | null`. Internally use one state object containing `runtimeState` and `proClubAuthority`; do not add an authority setter to the public context.

- [ ] Extend the mounted probe context type with the new property and add deferred-result tests using the existing `render`, `latestContext`, and `deferredAuthority` helpers:

```ts
assert.equal(latestContext!.proClubAuthority, null); // pending
// After completing a matching trusted authorized result:
assert.equal(latestContext!.proClubAuthority?.userId, actualUser!.uid);
// After selectProClub starts another generation, before completion:
assert.equal(latestContext!.proClubAuthority, null);
```

- [ ] Cover same-club reselection, different club, sign-out, actor replacement, stale completion, rejected/error result, mismatched authority uid/club, and unexpected promise rejection. Assert both dashboard eligibility and exposed authority, not only text snapshots. StrictMode replay must keep one promise per trusted request object.
- [ ] Run `node --experimental-test-module-mocks --import tsx --test tests/organizationRuntimeProClubAuthorityCoordinationMounted.test.tsx` and record expected failures.
- [ ] Replace independent runtime state with the atomic pair. Selection clears authority synchronously in the same state update. Keep the existing WeakMap and actor-keyed provider. Before accepting a completion, require the current trusted request object to equal the captured request:

```ts
if (getOrganizationResolutionRequest(current.runtimeState) !== request) {
  return current;
}
const next = applyOrganizationResolution(current.runtimeState, bridgeResult.runtimeResult);
```

- [ ] Retain authority only if `next` is authorized, source is FOUND, authority has membership authority, exact uid/club/type match, and generation matches the captured request. Otherwise apply a canonical ERROR result for the current trusted request and set authority null. Unexpected rejection also maps to canonical ERROR, with the same stale-request guard; never remain indefinitely RESOLVING.
- [ ] Run all `tests/organizationRuntime*.test.ts` and `tests/organizationRuntime*.test.tsx` using `--experimental-test-module-mocks --import tsx --test --test-concurrency=1`. Preserve existing request provenance and auth lifecycle tests.
- [ ] Explicitly stage context and affected tests, diff-check, commit `perf(pro-club): retain authority in exact runtime generation`.

## Task 3: Single-club entry and progressive workspace

**Files:** Modify portal; extend `tests/proClubMembershipDiscoveryPortal.unit.test.tsx` and `tests/proClubPortalDiscoveryLoading.unit.test.ts`.

**Interfaces:** Consume context `proClubAuthority`; internal `ClubWorkspace` receives verified authority plus existing callbacks and derives clubId/uid from it. No repository authority fetch on workspace mount.

- [ ] In the existing mounted discovery test, strengthen single-club and restored cases:

```ts
assert.equal(resolutionRequests.length, 1);
assert.deepEqual(workspaceLoads, []);
assert.match(text(), /Team dashboard/);
```

- [ ] Add revoked-single-row, zero-club, multiple-club, stale discovery after actor change, support presentation, and member-with-null-staff-role cases. Multiple-club display loads may remain; selecting a card must still issue a trusted runtime request. Pending authority must show status plus Back/Sign out and never onboarding flash.
- [ ] Run `node --experimental-test-module-mocks --import tsx --test tests/proClubMembershipDiscoveryPortal.unit.test.tsx tests/proClubPortalDiscoveryLoading.unit.test.ts`; confirm the old duplicate-read path fails the new assertions.
- [ ] Before the existing candidates loop, handle the exact single discovery row:

```ts
if (!mounted) return;
if (discoveries.length === 1) {
  const clubId = discoveries[0].clubId;
  setClubReference(clubId);
  setTab("workspace");
  setDiscoveryState("OPENING");
  selectProClub(clubId);
  return;
}
```

- [ ] Keep multiple-club candidate display resolution and fresh selection verification; do not implement candidate adoption. Remove only the workspace's duplicate authority effect. Gate dashboard rendering on authorized runtime plus exact authority uid/club/type/membership match. Provider state owns generation binding.
- [ ] Keep the existing portal header visible while authority is pending, including restored entry. On runtime ERROR/REJECTED show actionable recovery using existing reference/openClub retry and navigation, not an endless spinner. Ensure StrictMode cleanup does not strand discovery.
- [ ] Rerun mounted portal/loading tests and runtime coordination suite. Preserve existing account status and support gates. Explicitly stage and commit `perf(pro-club): remove duplicate workspace entry reads`.

## Task 4: Lazy portal, eligible preload, recoverable loading

**Files:** Modify `src/App.tsx` only; create `tests/proClubMobileEntryLoading.unit.test.tsx`.

**Interfaces:** Define local `loadProClubPortal(): Promise<typeof import("./components/pro-club/ProClubPortal")>` and local lazy component in App.tsx. A local boundary owns module-failure recovery; no new shared production files or dependencies.

- [ ] Add JSDOM mounted tests with existing Node module-mock conventions; mock unrelated App destinations/providers and control the dynamic portal import. Test deferred import status, Back and Sign out, rejected import alert, explicit reload action, ineligible actor, support presentation, and import completion after navigation away. Assert preload alone never mounts the portal or invokes membership/authority reads.
- [ ] Add source assertions to the same test file:

```ts
const source = readFileSync("src/App.tsx", "utf8");
assert.doesNotMatch(source, /import ProClubPortal from/);
assert.match(source, /import\("\.\/components\/pro-club\/ProClubPortal"\)/);
assert.match(source, /Suspense/);
```

- [ ] Run `node --experimental-test-module-mocks --import tsx --test tests/proClubMobileEntryLoading.unit.test.tsx`; confirm the lazy/loading requirements fail.
- [ ] Implement module-local memoization with rejection reset and attach a handled rejection to preload:

```ts
let portalModule: Promise<typeof import("./components/pro-club/ProClubPortal")> | null = null;
function loadProClubPortal() {
  return portalModule ??= import("./components/pro-club/ProClubPortal").catch(error => {
    portalModule = null;
    throw error;
  });
}
const ProClubPortal = lazy(loadProClubPortal);
```

- [ ] Place eligibility calculation and preload effect before all early returns, preserving hook order. Schedule only on eligible authenticated dashboard; use `requestIdleCallback` when available and a cancellable timer fallback otherwise. Re-check the captured effect's cancellation flag before loading, cancel on navigation/auth changes, and use `void loadProClubPortal().catch(() => {})` for speculative preload only.
- [ ] Wrap the eligible destination with a local error boundary and Suspense shell. The boundary displays an alert, Back, Sign out, and an explicit reload action calling `window.location.reload()`; explain that reload retries module delivery. Do not claim resetting error state retries React.lazy's cached rejection. No automatic reload loop.
- [ ] Test idle API absent, cancelled scheduled callback, rejected preload followed by successful navigation, and direct navigation before preload. Assert denied accounts never import the portal through this path. Keep pending shell controls keyboard/touch accessible and wrapping at 360 px.
- [ ] Run new mounted tests and portal/runtime regressions; build with `npm run build -- --manifest`. Inspect generated manifest: portal must be a dynamic entry, with no static path from app entry to portal. Shared dependency chunks are allowed; do not promise the entire Pro Club dependency tree is absent from shared chunks.
- [ ] Explicitly stage App.tsx and the new test; diff-check and commit `perf(pro-club): lazy load entry with safe preload and recovery`.

## Task 5: Exact-head verification and mobile evidence

**Files:** No production edits. Record results in PR handoff text, with exact HEAD and explicit unverified items.

- [ ] Before implementation begins, run baseline tests in the isolated worktree. Use existing installed dependencies if available; otherwise `npm ci` without modifying lockfiles. Functions dependencies, if required for TypeScript, may be installed only into ignored node_modules from their existing lockfile; no tracked functions change. Stop if baseline fails.
- [ ] After all tasks, run:

```bash
node --experimental-test-module-mocks --import tsx --test --test-concurrency=1 tests/organizationRuntime*.test.ts tests/organizationRuntime*.test.tsx tests/proClubMembershipDiscoveryPortal.unit.test.tsx tests/proClubPortalDiscoveryLoading.unit.test.ts tests/proClubMobileEntryLoading.unit.test.tsx tests/proClubStartingXITabletUx.unit.test.ts tests/proClubStartingXIUi.unit.test.tsx tests/proClubTeamDashboardProductionV1.unit.test.tsx tests/proClubMatchStartingXIUiWiring.unit.test.ts
npm run lint
npm run build -- --manifest
git diff --check b42d1fb6dd948748279b6f3d90668aaf243ce05b HEAD
git diff --exit-code b42d1fb6dd948748279b6f3d90668aaf243ce05b HEAD -- firestore.rules firestore.indexes.json firebase.json firebase.spark.json .firebaserc firebase-applet-config.json functions src/lib/firebase.ts src/contexts/AcademyContext.tsx package.json package-lock.json
git diff --name-status b42d1fb6dd948748279b6f3d90668aaf243ce05b HEAD
git status --short
git rev-parse HEAD
```

- [ ] Scope-review every changed path against the four-source-file allowlist and focused tests/docs. No deleted/renamed files. Do not treat a warning about chunks over 500 kB as a failure or reason to broaden scope.
- [ ] Inspect generated chunks and report actual entry and portal sizes alongside baseline; smaller entry alone does not prove faster navigation.
- [ ] Verify browser rendering with test fixtures at 360×800, 390×844, 768×1024, and 1024×768. Use no production credentials or writes. JSDOM width changes are not visual or real-device verification.
- [ ] For real-device acceptance, request an authorized read-only phone/iPad test session if none is available. On the same account/network, measure five cold and five warm entries, recording shell time and usable-overview time individually. Record browser/device and network conditions, and compare Academy only as a reference, not proof of equivalent workloads. Capture the slow stage if targets fail. No production deploy is authorized to obtain this evidence.
- [ ] If hardware/session access is absent, report `REAL_DEVICE_PERFORMANCE=NOT_VERIFIED`; do not claim the 1s/3s targets passed. Stop at review-ready code, not production acceptance.
- [ ] Request independent exact-head review through the execution method selected by the user. Do not push, create PR, merge, or deploy without the applicable authorization. Report tests, scope gate, residual risks, and next approval needed.

## Self-review and execution handoff

Coverage: Tasks 1–2 cover canonical provenance and lifecycle; Task 3 covers all entry discovery paths; Task 4 covers loading/preload/errors; Task 5 covers frozen paths, regressions, chunk inspection and device evidence. All five Review Focus cases have owning tests.

Design clarification: choose the conservative multi-club option already allowed by the spec—fresh trusted resolution on selection, no adoption interface. The approved design document remains unchanged.

This plan is documentation only until the user reviews it and selects execution. Recommended approach: inline execution because the four production files share a tightly coupled authority contract, followed by independent whole-branch review.
