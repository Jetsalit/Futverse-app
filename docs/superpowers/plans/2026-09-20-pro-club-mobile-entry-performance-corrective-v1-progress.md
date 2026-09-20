# Execution ledger — Pro Club Mobile Entry Performance Corrective V1

Plan: `2026-09-20-pro-club-mobile-entry-performance-corrective-v1.md`
Baseline: `b42d1fb6dd948748279b6f3d90668aaf243ce05b`.

- Design and plan approved; inline execution approved.
- Baseline verification: 196 tests passed, zero failures.
- Ruling: use this Markdown ledger instead of the permission-denied skill script, explicitly authorized by the user. Manual bookkeeping must preserve test and commit evidence.
- Pre-flight: Task 1 authority result feeds Task 2 atomic context; Task 2 context feeds Task 3 portal; Task 4 dynamically imports Task 3. Interfaces agree.
- Task 1 complete: new authority tests RED (missing field), then bridge suites GREEN 30/30; commit e954ca2.
- Task 2: mounted lifecycle assertions RED, implementation passes mounted scenarios. Historical source-shape checks updated for the approved read-only authority field and canonical ERROR recovery; injection and actor safeguards remain tested.
- Task 2 complete: runtime suites GREEN 165/165; commit 061c52d.
- Task 3: duplicate-read assertions RED then GREEN; restored pending-screen test RED (onboarding flash) then corrected to OPENING. Member without staff role and support denial covered.
- TypeScript first run blocked only by missing local firebase-functions dependency; installed functions lockfile dependencies in ignored node_modules without source/config changes.
- Task 3 complete: portal/dashboard/loading suites GREEN 24/24; commit eb5a7c9.
- Task 4: real App bundled with service/UI fixtures; RED showed eager module blocks App import and loads for denied actors. GREEN 8/8 verifies pending/error navigation, idle/timer preload, cancellation and handled speculative failures.
- Ruling: failed module evaluation may be cached by the browser/React.lazy; explicit Reload is the reliable recovery. Do not promise in-place recovery after an import rejection. Cost: one reload on this exceptional path.
- TypeScript PASS. Build PASS, manifest confirms dynamic portal entry; main 2359.46 kB (631.38 gzip), portal 291.81 kB (69.96 gzip). Existing >500 kB warning remains non-blocking.
- Task 4 complete: commit 17534b3.
- Independent read-only review at 17534b3: one Important finding, no Critical or Minor findings. Retained provider authority could render a stale dashboard on portal re-entry.
- Final fix: persistent-provider remount test RED reproduced stale dashboard; portal now requires a generation newer than its entry baseline. Tests cover pending/empty/failed/multiple discovery and restored re-entry. Full suite GREEN 213/213 after fix; TypeScript and production build PASS.
- Final review deferred minors: none. No second reviewer pass; finding verified through RED-to-GREEN regression and complete planned suite as required by inline execution.
- Final: Ruling: reviewer declined device timing/rendering/deployed delivery judgments; these remain unverified acceptance gates, not inferred from unit tests. Cost if ignored: a mobile-specific performance or rendering problem could remain undetected.
- Browser visual verification blocked: agent-browser CLI and Chromium binary absent. Existing Playwright package found; attempted browser download timed out twice and was cancelled. No real browser screenshots or viewport PASS claimed.
- `REAL_DEVICE_PERFORMANCE=NOT_VERIFIED`; `BROWSER_VISUAL=NOT_VERIFIED`.
- Protected-file diff gate PASS; main remains clean at b42d1fb6dd948748279b6f3d90668aaf243ce05b. No merge, push, PR creation, deployment, or production writes.
- Branch/worktree and ledger retained for review and pending device acceptance; no cleanup deletion performed.

## Final verification command

```bash
node --experimental-test-module-mocks --import tsx --test --test-concurrency=1 tests/organizationRuntime*.test.ts tests/organizationRuntime*.test.tsx tests/proClubMembershipDiscoveryPortal.unit.test.tsx tests/proClubPortalDiscoveryLoading.unit.test.ts tests/proClubMobileEntryLoading.unit.test.tsx tests/proClubStartingXITabletUx.unit.test.ts tests/proClubStartingXIUi.unit.test.tsx tests/proClubTeamDashboardProductionV1.unit.test.tsx tests/proClubMatchStartingXIUiWiring.unit.test.ts
npm run lint
npm run build -- --manifest
```

This is the complete planned client/runtime/tablet regression set, not all 258 repository test files. Emulator/rules suites were not run because rules, server paths and writes remain unchanged. Build warning >500 kB is unchanged in severity and is not a blocker.
