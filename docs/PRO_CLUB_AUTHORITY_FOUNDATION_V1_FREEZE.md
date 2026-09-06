# FutVerse Pro Club Authority Foundation V1 - Contract Freeze

Status: FROZEN FOR DOMAIN IMPLEMENTATION

Baseline:

- branch: `feat/pro-club-authority-foundation-v1`
- base SHA: `9129cbd2b19a3a2e329641db1f96b4f59931dbf1`

## 1. Purpose

V1 freezes the Pro Club tenant authority boundary before persistence,
Firestore Rules, adapters, or UI are connected. It does not make Pro Club
authority available to SuperAdmin or any production consumer.

## 2. Repository findings and preservation

- Academy authority is canonical at `academies/{academyId}/members/{uid}` and
  remains unchanged.
- Academy membership payloads contain legacy identity fields. New Pro Club
  payloads do not copy that compatibility shape.
- the generic SuperAdmin organization read model anticipates `PRO_CLUB`, but
  the authoritative adapter is Academy-only and must continue reporting Pro
  Club coverage as `NOT_CONNECTED`.
- Match has one reusable domain model and an Academy-specific repository.
  V1 does not create a Pro Club Match model or adapter.
- no authoritative Pro Club Firestore storage currently exists.

## 3. Canonical identity and future storage boundary

The future authoritative boundary is reserved as:

```text
proClubs/{clubId}
proClubs/{clubId}/members/{uid}
proClubs/{clubId}/staff/{uid}
```

The document IDs are the only canonical club and user identities. Stored Pro
Club, membership, and staff payloads must not contain `id`, `clubId`, `uid`, or
`userId`. Runtime validation receives requested IDs and path-derived document
IDs separately and requires exact equality. A path mismatch, padded ID,
slash-containing ID, missing ID, or cross-club context fails closed.

## 4. Pro Club contract

The existing club level values remain `T1`, `T2`, and `T3`.

Club status is:

- `ACTIVE`: tenant membership authority may be evaluated.
- `INACTIVE`: all tenant membership authority fails closed, while the club
  record remains available as status evidence.

The V1 club payload preserves the existing fields only: `name`, `shortName`,
`level`, `status`, `country`, `logoUrl`, `createdAt`, and `updatedAt`. Unknown
fields and stored identity fields fail validation.

## 5. Membership authority contract

The exact V1 membership authority payload is:

```text
authorizationRole
status
```

Authorization roles are:

- `OWNER`: club ownership authority.
- `ADMIN`: delegated club administration authority.
- `MEMBER`: authenticated tenant membership without owner/admin authority.

Membership status is:

- `ACTIVE`: the only status eligible to grant tenant authority.
- `INACTIVE`: relationship retained but authority temporarily disabled.
- `LEFT`: voluntary terminal departure evidence; no authority.
- `REVOKED`: involuntary terminal removal evidence; no authority.

`LEFT` and `REVOKED` are terminal in V1. V1 deliberately defines no lifecycle
transition or reactivation API. A future persistence slice must define audited
transition evidence before overwriting historical status. Display roles,
legacy account roles, requested roles, and football staff roles are never
membership authority.

## 6. Football staff assignment contract

The exact V1 staff assignment payload is:

```text
staffRole
status
```

Functional roles remain:

- `HEAD_COACH`
- `ASSISTANT_COACH`
- `FITNESS_COACH`
- `ANALYST`
- `PHYSIO`
- `TEAM_MANAGER`
- `STAFF`

Assignment status remains `ACTIVE`, `INACTIVE`, or `LEFT`. An assignment
describes football function only. It grants no tenant membership or
authorization role.

A functional staff role resolves only when all of these are true:

1. the exact club document is `ACTIVE`;
2. the exact membership document is `ACTIVE`;
3. the exact staff assignment document is `ACTIVE`;
4. club path and UID path identities match across both documents.

Missing or inactive membership always wins over an active staff assignment.

## 7. Tenant isolation

Every authority decision is scoped to one requested `clubId`. The requested
club ID must equal the club document ID and the parent club ID of both nested
documents. The requested UID must equal both nested document IDs. Data read
from one Pro Club path cannot be presented as authority for another path.

Firestore Rules remain the future final authority. These pure validators do
not authorize a client write or connect any production read path.

## 8. Future Organization compatibility

V1 does not create an `organizations` collection and does not make a Pro Club
an Academy. A future Organization adapter may map canonical path identity,
membership authorization role, membership status, and staff function into a
shared read model. The canonical Pro Club documents remain the source of
truth, and SuperAdmin must remain `NOT_CONNECTED` until an authoritative
adapter, Rules, and tests are implemented.

## 9. Future Match compatibility

Pro Club will reuse the existing Match domain contract through a future
Pro-Club-scoped persistence adapter. V1 does not modify Match, create a second
Match engine, invent an Academy compatibility path, or touch Starting XI.

## 10. V1 implementation boundary

Allowed files are limited to:

- `docs/PRO_CLUB_AUTHORITY_FOUNDATION_V1_FREEZE.md`
- `src/types/ProClub.ts`
- `src/lib/proClubModel.ts`
- `tests/proClubFoundation.test.ts`
- `tests/proClubAuthorityContract.test.ts`

Explicitly out of scope:

- Firestore persistence, repositories, Rules, indexes, or production data
- Academy authority or membership changes
- SuperAdmin Pro Club authority connection
- Match or Starting XI changes
- UI changes
- deployment, commit, push, or merge

Any future requirement that needs identity duplication, lifecycle mutation,
or authorization from non-membership fields requires a new architecture
review rather than a compatibility shortcut.

## 11. Staff Management V1 successor role-set amendment

The historical baseline above froze the legacy seven-role set.
Pro Club Staff Management V1 supersedes only the functional football
staff-role enumeration with the following canonical set of exactly 10 roles:

- `TECHNICAL_DIRECTOR`
- `MANAGER`
- `HEAD_COACH`
- `ASSISTANT_COACH`
- `GK_COACH`
- `FITNESS_COACH`
- `ANALYST`
- `PHYSIO`
- `TEAM_MANAGER`
- `STAFF`

MANAGER and TEAM_MANAGER are distinct.

This successor amendment does NOT change:

- authorization roles: OWNER / ADMIN / MEMBER
- membership authority semantics
- staffRole != authorizationRole
- lifecycle states
- exact-path authority
- default-deny behavior
- historical baseline SHA
- historical implementation scope
