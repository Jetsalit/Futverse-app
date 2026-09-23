# FutVerse Academy Fitness Coach Specialty Persistence V1 — Contract Freeze

Status: RULES FOUNDATION ONLY

Baseline:

- branch: `feat/academy-fitness-coach-specialty-rules-v1`
- base SHA: `434ee5e2a87767c1f03bba429dbbe57953c3a2a6`

## 1. Purpose

This slice defines the first authoritative Firestore boundary for the Academy
`FITNESS_COACH` specialty created by Academy Staff Specialty / Fitness
Capability V1.

It does not wire the client UI, Coach Management, Fitness catalogue, or a client
repository to production writes.

## 2. Canonical storage path

The V1 authoritative path is:

```text
academies/{academyId}/staffSpecialties/{uid}
```

The Academy ID and user UID are path identity only. They must not be duplicated
inside the payload.

The exact V1 payload is:

```text
schemaVersion
specialty
status
createdAt
createdBy
updatedAt
updatedBy
```

`schemaVersion` is exactly `1`.

`specialty` is exactly `FITNESS_COACH`.

`status` is one of:

- `ACTIVE`
- `INACTIVE`
- `LEFT`

Unknown fields and stored `id`, `uid`, `userId`, or `academyId` are not
accepted because the Rules contract uses an exact field allow-list.

## 3. Membership boundary

A specialty assignment never creates Academy authority.

Creating an ACTIVE Fitness Coach specialty requires the target UID to already
have the exact canonical Academy membership at:

```text
academies/{academyId}/members/{uid}
```

with:

- `userId == uid`
- `academyId == academyId`
- `role == COACH`
- `status == ACTIVE`

An Admin membership cannot be targeted as a Fitness Coach specialty in V1.

If the target membership later becomes non-ACTIVE, the previously stored
specialty no longer produces Fitness capability because the pure capability
resolver requires ACTIVE membership.

## 4. Mutation authority

Only these actors may create or update the specialty record:

- active `SUPERADMIN`
- active Academy `ADMIN` membership in the same Academy

A Coach cannot assign, reactivate, deactivate, or terminate a specialty,
including their own.

Create semantics:

- create is ACTIVE only;
- target must be an ACTIVE COACH membership;
- `createdAt == request.time`;
- `createdBy == request.auth.uid`;
- `updatedAt == request.time`;
- `updatedBy == request.auth.uid`.

## 5. Lifecycle

Allowed status transitions are:

```text
ACTIVE   -> ACTIVE | INACTIVE | LEFT
INACTIVE -> INACTIVE | ACTIVE | LEFT
LEFT     -> no update
```

Reactivation to ACTIVE requires the target membership to still be an exact
ACTIVE COACH membership.

Deactivation to INACTIVE or termination to LEFT remains possible for an
authorized Admin/SuperAdmin even if the target membership has already become
non-ACTIVE. This allows cleanup without restoring authority.

Delete is not allowed in V1.

`schemaVersion`, `specialty`, `createdAt`, and `createdBy` are immutable.
Updates may change only `status`, `updatedAt`, and `updatedBy`.

## 6. Read contract

- SuperAdmin: get/list.
- active Academy Admin: get/list within that Academy.
- active Academy member: get only their own UID document.
- ordinary Coach cannot list specialty records for other staff.

This permits a future current-user capability resolver without exposing the
whole staff-specialty directory to every Coach.

## 7. V1 implementation boundary

Allowed files in this slice:

- `docs/ACADEMY_FITNESS_COACH_SPECIALTY_PERSISTENCE_V1_CONTRACT_FREEZE.md`
- `src/types/AcademyStaff.ts`
- `firestore.rules`
- `tests/firestore.academy-fitness-coach-specialty.rules.test.ts`

Out of scope:

- client repository or mutation service
- AcademyContext wiring
- Coach Management UI
- FitnessTesting UI authority wiring
- onboarding/invitation changes
- production data migration
- deploy or production Rules activation

The Rules tests are emulator-only. Passing them does not authorize production
deployment; a separate activation gate is required.
