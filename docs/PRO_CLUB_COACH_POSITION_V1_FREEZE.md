# Pro Club Coach Position V1 — Contract Freeze

## Status

Coach Position V1 freezes the functional coaching-position vocabulary for Pro Club staff management. It does not create a new authorization system, persistence path, Firestore rule, or migration.

## Canonical coach positions

Exactly four functional staff roles are Coach Position V1:

- `HEAD_COACH` — Head coach
- `ASSISTANT_COACH` — Assistant coach
- `GK_COACH` — Goalkeeper coach
- `FITNESS_COACH` — Fitness coach

`MANAGER` is technical leadership, not a Coach Position V1 value.

`TEAM_MANAGER` is support staff, not a Coach Position V1 value.

## Authorization boundary

Coach position and authorization are separate dimensions.

Authorization remains exactly:

- `OWNER`
- `ADMIN`
- `MEMBER`

Changing a functional coaching position must never promote or demote authorization. Existing Staff Management V1 authority rules remain canonical: self-management is blocked, OWNER targets are protected, and ADMIN targets require an OWNER actor.

## Lifecycle boundary

Coach positions use the existing Staff Management V1 lifecycle. No additional lifecycle state is introduced.

- active staff can change functional role
- active staff can be deactivated
- aligned inactive staff can be reactivated through lifecycle review
- `LEFT` remains terminal in V1
- role/lifecycle changes retain append-only management history
- no hard delete is introduced

## Presentation contract

`src/lib/proClubCoachPositionV1.ts` is the canonical grouping/order contract for Pro Club functional staff selectors.

The groups are:

1. Technical leadership
2. Coaching positions
3. Support staff

The existing onboarding labels must remain in exact parity with this canonical order. Staff Management UI consumes the canonical role-option list rather than maintaining a second list.

## Persistence and infrastructure impact

- Firestore schema change: **NO**
- Firestore Rules change: **NO**
- Cloud Functions change: **NO**
- data migration: **NO**
- production deployment: **NO**

This freeze classifies Coach Position V1 as a code-only contract/presentation hardening layer over the existing canonical staff-role and Staff Management V1 data model.

## Acceptance

Coach Position V1 is accepted only when automated tests prove:

1. exactly the four coach positions are recognized;
2. `MANAGER` and `TEAM_MANAGER` are excluded;
3. `OWNER`, `ADMIN`, and `MEMBER` are never coach positions;
4. canonical staff groups cover every Pro Club staff role exactly once;
5. Staff Management UI and onboarding labels remain in parity with the canonical role order;
6. changing a staff member into every Coach Position V1 role preserves authorization and produces the expected history transition;
7. TypeScript/build and the existing staging regression suite pass.

## Recovery

The pre-work safe checkpoint for this freeze is:

`45afc32531bca848583fd04c536e8ea162555a74`

Rollback is code-only. No production data recovery is required because this slice performs no data mutation or migration.
