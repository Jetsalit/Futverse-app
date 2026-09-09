# FutVerse Pro Club Operations Shell V1 Contract Freeze

Status: PROPOSED DEV-ONLY UI FOUNDATION

## Baseline

- Base `main`: `14b054286a1678f39094361bf1c7dd0d948290df`
- Branch: `feat/pro-club-operations-shell-v1`

## Purpose

Introduce the first Pro Club Operations Cockpit and Head Coach / Technical Director role-workspace skeleton without changing production behavior or adding operational persistence.

## Allowed scope

1. `docs/PRO_CLUB_OPERATIONS_SHELL_V1_CONTRACT_FREEZE.md`
2. `src/config/proClubOperationsCapabilities.ts`
3. `src/components/pro-club/operations/ProClubOperationsDashboard.tsx`
4. `src/components/pro-club/operations/ProClubRoleWorkspace.tsx`
5. `tests/proClubOperationsCapabilities.unit.test.ts`
6. minimal integration in `src/components/pro-club/ProClubPortal.tsx`

## Frozen invariants

- Existing `ProClubPortal` account/runtime/tenant authority gate remains authoritative.
- The operations preview receives only an already-resolved `ProClubOrganizationAuthority`.
- No Operations component reads or writes Firestore.
- No Academy repository or Academy tenant path is reused for Pro Club operations.
- No fixture football counts, fake player records, fake reports, fake medical data, or synthetic production records are rendered.
- The preview is source-gated to Vite DEV only.
- Production cannot enable this preview with an environment variable.
- Production continues to render the existing Club Workspace behavior.
- Existing Staff onboarding / pending-review workflow remains available.
- The shell does not claim that a Head Coach or Technical Director is current technical authority; that requires the Technical Governance contract to be integrated with canonical staff/config data in a successor slice.
- Navigation is non-interactive in this slice.

## Head Coach workspace skeleton

The shell reserves surfaces for:
- Weekly Training
- Today's Session
- Department Updates
- Match Preparation

No persistence or submission action is implemented in this slice.

## Technical Director workspace skeleton

The shell reserves surfaces for:
- Training Collaboration
- Technical Review Queue
- Department Reports
- Technical Decisions

No review/approval action is implemented in this slice.

## Explicitly deferred

- training-plan schema and repository
- technical governance config persistence
- SuperAdmin governance UI
- technical authority read integration
- department-report persistence
- squad repository
- Pro Club match repository
- fitness repository
- availability/medical repository
- role-workspace navigation
- production rollout

## Safety boundary

No change is authorized to:
- `firestore.rules`
- `firebase.json`
- `firebase.spark.json`
- `functions/**`
- `src/App.tsx`
- Pro Club onboarding/provisioning repository logic
- production data

No Firebase deploy, production HTTP call, production Firestore write, force push, or production feature enablement is authorized by this slice.
