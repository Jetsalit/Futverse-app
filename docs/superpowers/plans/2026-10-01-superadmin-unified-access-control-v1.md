# SuperAdmin Unified Access Control V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a confirmation-based SuperAdmin workflow for direct Academy and Pro Club access assignment while preserving canonical authorization boundaries.

**Architecture:** Reuse the Accounts inventory and existing Academy membership/Fitness specialty models. Add a small access-state domain model, an atomic Firestore repository for assignments and append-only audit, narrowly scoped Firestore Rules, and a drawer integrated into the existing account surface.

**Tech Stack:** React 19, TypeScript, Firebase Firestore client transactions, Firestore Rules, Node test runner with `tsx`, Firebase Emulator Suite, Vite.

**Spec:** [2026-10-01-superadmin-unified-access-control-v1-design.md](../specs/2026-10-01-superadmin-unified-access-control-v1-design.md)

## Global Constraints

- Reuse existing onboarding, membership, staff, Academy, and SuperAdmin systems; add the smallest new access-control path.
- Account role remains separate from organization membership and staff role.
- Pro Club authority is always `MEMBER`; this flow never grants `OWNER` or `ADMIN`.
- Academy membership roles are only `ADMIN` and `COACH`; `FITNESS_COACH` is an optional separate specialty.
- The target account must be active and not SuperAdmin; actor must be the actual active SuperAdmin with Support/Work As inactive.
- Resolve canonical UID from an exact normalized email match; ambiguous matches fail closed.
- All state-changing operations require review, explicit confirmation, authoritative transaction revalidation, atomic writes, and an immutable audit.
- No deletes, production assignment smoke, Functions/Storage deployment, dependency churn, or unrelated feature changes.
- Keep Owner/Admin invite → claim → approve onboarding unchanged.

## Review Focus

- Duplicate, missing, malformed, or case-variant emails must resolve only to one canonical account or fail closed.
- Missing, inactive, SuperAdmin, or changed target accounts must block the commit after confirmation.
- Inactive organizations and stale relationship snapshots must block the commit.
- Pro Club partial/terminal/privileged membership states must not be silently repaired or overwritten.
- Academy provenance, specialty eligibility, and unrelated organization access must remain unchanged.

---

### Task 1: Access state and transition model

**Files:**
- Create: `src/lib/superAdminAccessControl.ts`
- Test: `tests/superAdminAccessControl.test.ts`

**Interfaces:**
- `normalizeAccessEmail(value: unknown): string | null`
- `resolveAccountByExactEmail(users, email)` returns one eligible canonical account, `NOT_FOUND`, `AMBIGUOUS`, or `INELIGIBLE`.
- `resolveProClubAccessState(membership, staff, desiredStaffRole)` returns a fail-closed state and one of `ASSIGN`, `ASSIGN_STAFF_ROLE`, `CHANGE_ROLE`, `REACTIVATE`, `ALREADY_ACTIVE`, or `MANUAL_REVIEW`.
- `resolveAcademyAccessState(membership, specialty, desiredRole, desiredFitnessCoach)` returns `ASSIGN`, `CHANGE_ROLE`, `REACTIVATE`, `SPECIALTY_CHANGE`, `ALREADY_ACTIVE`, or `MANUAL_REVIEW`.

- [ ] Write tests for exact normalized email matching, duplicates, inactive/SuperAdmin target rejection, Pro Club missing/member-only/same-role/change/inactive/terminal/conflicting cases, Academy role/provenance/specialty eligibility, and no-op classification.
- [ ] Run `node --import tsx --test tests/superAdminAccessControl.test.ts`; confirm missing-model failures.
- [ ] Implement pure validators and transition decisions without Firestore dependencies.
- [ ] Re-run the model test and existing relevant policy tests.

### Task 2: Atomic access repository and audit contract

**Files:**
- Create: `src/lib/firestore/superAdminAccessControlRepository.ts`
- Test: `tests/superAdminAccessControlRepository.test.ts`
- Modify only if needed to reuse a validator: `src/lib/academyFitnessCoachAssignment.ts`

**Interfaces:**
- `loadSuperAdminAccessOrganizations(actorUid)` reads active Academy and Pro Club options from server snapshots.
- `loadSuperAdminUserAccess(actorUid, targetUid, organizations)` resolves current canonical Academy and Pro Club state.
- `applySuperAdminAccessChange(input)` accepts actor UID, target UID, organization, selected organization role/specialty, reviewed expected state, and support-mode flags; returns `NO_OP` or the committed result.

- [ ] Write dependency-injected repository tests for actual-actor binding, account/org revalidation, atomic canonical Pro Club writes and pointer, Academy membership provenance, Fitness Coach eligibility, before/after audit, no-op without writes/audit, role transition staleness, and no cross-org/account-role writes.
- [ ] Run `node --import tsx --test tests/superAdminAccessControlRepository.test.ts`; confirm missing-repository failures.
- [ ] Implement server reads and Firestore transactions. Use existing Pro Club paths, Academy schema, Fitness Coach validator, and new append-only `superAdminAccessControlAudits` records.
- [ ] Re-run repository tests plus existing Academy Fitness and SuperAdmin controlled-membership tests.

### Task 3: Firestore Rules and emulator coverage

**Files:**
- Modify: `firestore.rules`
- Create: `tests/firestore.superadmin-access-control.rules.test.ts`

**Interfaces:**
- Rules allow active SuperAdmins to read canonical organization and exact selected-user relationship state.
- Rules admit direct Pro Club assignment only with active actor/target/club, `MEMBER` authority, valid staff role, matching same-commit audit, and required discovery pointer.
- Academy direct membership/specialty writes retain the current canonical path and require matching audit for this access-control transaction.
- Audit permits create only, with exact schema and state binding; update/delete always deny.

- [ ] Add emulator tests for valid direct Pro Club and Academy assignment and denials for inactive/normal actors, invalid targets/orgs/roles, OWNER/ADMIN escalation, omitted/mismatched audit, partial batches, arbitrary overwrite, deletes, malformed state, and cross-organization access. Assert that Rules derive authority only from `request.auth.uid` and the canonical user document; Support/Work As is a client presentation state and is tested at the UI/repository boundary.
- [ ] Run `firebase emulators:exec --project demo-futverse-superadmin-access-control --only firestore "node --import tsx --test tests/firestore.superadmin-access-control.rules.test.ts"`; confirm the new contract is initially denied.
- [ ] Add only the narrow Rules validators and document match changes required by those tests; require the access audit for SuperAdmin `SUPERADMIN_ASSIGNMENT` creates and role/access transitions while leaving the existing Academy status-only log path and Pro Club onboarding validators intact.
- [ ] Run the new emulator suite and existing membership, Academy specialty, SuperAdmin relationship, and Pro Club onboarding Rules suites.
- [ ] Inspect the diff and scan `firestore-debug.log` for the 1000-expression-limit error.

### Task 4: Accounts UI integration

**Files:**
- Create: `src/components/superadmin/SuperAdminManageAccessDrawer.tsx`
- Modify: `src/components/SuperadminPortal.tsx`
- Test: `tests/SuperAdminManageAccessDrawer.test.tsx`

**Interfaces:**
- The account row action receives the selected canonical `User` record; email is display/duplicate-check input only.
- The drawer consumes current Academy relationship evidence and repository-loaded Pro Club evidence, organizations, actual actor, and both Support mode states.
- Selection only changes form state; review presents previous/new state; Confirm invokes `applySuperAdminAccessChange`.

- [ ] Add UI tests for the account action, unauthorized/support-mode hidden or disabled state, organization/role selection, current access display, separate account role, review-before-confirm, old→new role summary, no-op display, and Academy Fitness Coach eligibility.
- [ ] Run the new UI test and existing `superAdminUserRelationshipInspectorUiWiring`/account relationship UI tests; confirm absent UI behavior.
- [ ] Add the minimal Accounts action and drawer; keep profile review and onboarding controls intact.
- [ ] Re-run UI tests and TypeScript lint.

### Task 5: Integrated regression and release gates

**Files:**
- No additional source files unless a scope-local defect is found.

- [ ] Run focused SuperAdmin, account, membership, Academy Fitness, Pro Club onboarding, and Firestore Rules suites.
- [ ] Run `npm run lint` and `npm run build`.
- [ ] Print status, diff stat, name-status, and deleted-files list; require zero deletions and no out-of-scope files.
- [ ] Commit on `feat/superadmin-unified-access-control-v1`, push normally, open a ready-for-review PR, wait for checks, and merge only after required checks pass.
- [ ] Fast-forward `main`, verify clean exact merged commit, rerun build/predeploy gates, deploy only Firestore Rules to `futverse-d7872`, then deploy only Hosting.
- [ ] Verify production HTTP 200 and deployed bundle. Any authenticated SuperAdmin UI smoke is read-only and never clicks Confirm.
