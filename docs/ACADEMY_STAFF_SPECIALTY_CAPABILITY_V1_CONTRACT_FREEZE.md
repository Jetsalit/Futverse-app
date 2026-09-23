# FutVerse Academy Staff Specialty / Fitness Capability V1 — Contract Freeze

Status: DOMAIN FOUNDATION ONLY

Baseline:

- branch: `feat/academy-fitness-coach-capability-v1`
- base SHA: `d3b01c70824db8801260cc139652a1fb6db529e6`

## 1. Purpose

This V1 defines a pure Academy staff-specialty and Fitness capability contract
for Academies and schools that may or may not have a dedicated Fitness Coach.

It does not change Academy membership authority, persistence, Firestore Rules,
onboarding, or production behavior.

## 2. Membership authority is preserved

The canonical Academy tenant membership role remains exactly:

- `ADMIN`
- `COACH`

`FITNESS_COACH` is not a tenant role.

A staff specialty describes a football function only. It never creates Academy
membership, never activates a suspended or ended membership, and never
replaces the canonical membership role.

## 3. V1 staff specialty

V1 introduces exactly one Academy staff specialty:

- `FITNESS_COACH`

Specialty status is:

- `ACTIVE`
- `INACTIVE`
- `LEFT`

Only an `ACTIVE` Fitness Coach specialty can add Fitness-specific capability,
and only when the canonical Academy membership is also `ACTIVE`.

## 4. Fitness capability vocabulary

V1 freezes exactly these capability codes:

- `FITNESS_VIEW`
- `FITNESS_RECORD_RESULTS`
- `FITNESS_MANAGE_TESTING`
- `FITNESS_MANAGE_CATALOGUE`
- `FITNESS_USE_IN_TRAINING`

These are domain capabilities only. They do not themselves authorize a
Firestore read or write.

## 5. Capability resolution

For an ACTIVE Academy membership:

- `ADMIN` receives all five Fitness capabilities.
- `COACH` without an active Fitness Coach specialty receives:
  - `FITNESS_VIEW`
  - `FITNESS_RECORD_RESULTS`
  - `FITNESS_USE_IN_TRAINING`
- `COACH` with an ACTIVE `FITNESS_COACH` specialty receives all five
  Fitness capabilities.

For any membership status other than `ACTIVE`, the resolved capability set is
empty.

An inactive, left, malformed, unknown, or missing specialty never grants
elevated Fitness capability. Invalid membership role/context fails closed.

## 6. Existing Academy behavior preserved

This contract preserves the Foundation V1 behavior already in production:

- ordinary Academy Coach can enter Fitness and use the catalogue read-only;
- Admin can manage the catalogue;
- a dedicated Fitness Coach is optional;
- an Academy without a Fitness Coach remains fully usable;
- this contract does not generate medical thresholds, readiness scores, or
  automatic training prescriptions.

SuperAdmin support authority remains governed by the existing SuperAdmin
support contract and is not redefined here.

## 7. V1 implementation boundary

Allowed files for this slice are limited to:

- `docs/ACADEMY_STAFF_SPECIALTY_CAPABILITY_V1_CONTRACT_FREEZE.md`
- `src/types/AcademyStaff.ts`
- `src/lib/academyStaffCapability.ts`
- `tests/academyStaffCapability.unit.test.ts`

Explicitly out of scope:

- Firestore persistence or repository wiring
- Firestore Security Rules or indexes
- production data writes or migration
- UI or sidebar changes
- Coach Management assignment UI
- onboarding or invitation changes
- changing `TenantRole`
- deployment

A successor persistence slice must separately define the authoritative storage
path, mutation authority, lifecycle evidence, Rules, and tests before any
specialty assignment can affect production authorization.
