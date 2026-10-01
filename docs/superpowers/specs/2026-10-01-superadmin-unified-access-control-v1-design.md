# SuperAdmin Unified Access Control V1

## Goal

Add a safe `Manage Access` workflow to the existing SuperAdmin Accounts experience so an active SuperAdmin can assign, change, or safely reactivate organization access for an existing active account in an Academy or Pro Club.

## Existing architecture

- The Accounts UI and canonical account inventory live in `src/components/SuperadminPortal.tsx` and `src/lib/firestore/users.ts`.
- Academy access is `academies/{academyId}/members/{uid}` with `ADMIN`/`COACH` roles and `SUPERADMIN_ASSIGNMENT` provenance available in the existing schema.
- Academy Fitness Coach is the only implemented Academy specialty and lives at `academies/{academyId}/staffSpecialties/{uid}`.
- Pro Club authority is split between `proClubs/{clubId}/members/{uid}` (`OWNER`/`ADMIN`/`MEMBER`) and `proClubs/{clubId}/staff/{uid}` (football staff role). The existing invitation/claim/approval flow remains separate and unchanged.
- Pro Club discovery uses `users/{uid}/proClubMemberships/{clubId}`. It is a pointer, not authority.
- Existing Academy status logs and Pro Club onboarding audits have different semantics. Unified access changes need a new append-only SuperAdmin audit contract.

## User flow

From an existing account row, the SuperAdmin opens `Manage Access`, sees the account and its current Academy and Pro Club relationships, selects an organization type and canonical organization, chooses the allowed role (and optional eligible Academy `FITNESS_COACH` specialty), reviews a complete before/after summary, then explicitly confirms. No dropdown writes data.

Account search uses the existing account inventory. Email comparison is trimmed and case-insensitive, exact matches only, and ambiguous or missing matches fail closed. All reads and writes use the selected canonical UID. Account-level role is never modified by organization access operations.

## Authorization and state transitions

- The actor is the actual authenticated `ACTIVE` `SUPERADMIN`; a staff or nonstaff Support/Work As presentation session disables the action. Firestore Rules independently authorize from the authenticated actor's canonical user document.
- The target account must exist, be `ACTIVE`, and not be `SUPERADMIN`. The selected organization must exist and be active.
- Pro Club writes use only canonical membership/staff documents, keep membership authority at `MEMBER`, and never grant `OWNER` or `ADMIN`. Missing access may be assigned; same active role is a no-op; active role changes and safe `INACTIVE` reactivation require explicit confirmation. `LEFT`, `REVOKED`, malformed, partial, or conflicting state fails closed.
- Academy writes use only the existing `ADMIN`/`COACH` membership model and preserve valid provenance (`source`, `approvalClaimId`, `joinedAt`, `joinedBy`). Same active role is a no-op; role changes and supported safe reactivation require explicit confirmation. `LEFT`, `REVOKED`, malformed, or conflicting state fails closed.
- Academy `FITNESS_COACH` remains a separate specialty and can be assigned only with an exact active `COACH` membership. No other Academy specialty is added.
- Each mutation re-reads actor, target, organization, relationship, and pointer/specialty state in a Firestore transaction. Writes are atomic; no deletes or cross-organization mutations occur.

## Audit and Firestore Rules

Create a minimal `superAdminAccessControlAudits/{actionId}` record for each actual mutation, containing the actor UID, target UID, organization type and ID, action type, previous state, new state, and server timestamp. The record is append-only. No-op actions create no audit. The same transaction writes the access records and audit.

Rules changes are narrowly scoped to active SuperAdmin organization reads needed by the selector/current-state view and the strict direct-assignment contract. The audited Academy assignment branch is limited to `SUPERADMIN_ASSIGNMENT` creates and access/role changes; existing status-only controlled actions keep their current audit path. The Pro Club onboarding validators and Owner/Admin invite → claim → approve path stay intact. Academy-specific roles, existing tenant rules, Functions, Storage, and unrelated product areas remain unchanged.

## Validation and release

Add focused domain, repository/UI, and Firestore Rules emulator tests for the positive, denied, no-op, transition, audit, and isolation cases in the request. Run relevant existing SuperAdmin, Academy, Pro Club onboarding, and rules suites, followed by lint and production build. Before commit, report status, diff scope, and deletions; deleted files must remain zero. Merge and deploy Rules, then Hosting, only after the requested CI, emulator, expression-limit, build, and merged-main gates pass. Production smoke is read-only.
