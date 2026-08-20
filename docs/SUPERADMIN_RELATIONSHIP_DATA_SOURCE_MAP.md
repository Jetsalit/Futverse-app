# FutVerse SuperAdmin Users & Relationships — Data Source Map

Status: **READ-MODEL DESIGN / NO PRODUCTION WRITES**

This document maps each SuperAdmin Users & Relationships field to current authoritative sources. It is intentionally conservative: unknown or incomplete data must remain unknown/review-required rather than being guessed from legacy metadata.

## 1. Core rule

The Users & Relationships page is a **derived read model**. It does not become an authorization source.

The read model may join/display information from multiple existing sources, but it must not write composed results back to those sources.

## 2. Account identity fields

| UI field | Primary source | Authority notes |
|---|---|---|
| `userId` | Firestore document id of `users/{uid}` | Canonical account identity |
| `name` | `users/{uid}.name` | Display metadata |
| `email` | `users/{uid}.email` / authenticated identity where appropriate | Display metadata, not tenant authority |
| `accountStatus` | `users/{uid}.status` | Account activation state |
| `requestedRole` | `users/{uid}.requestedRole` | Request/intent evidence only |
| `lastKnownAccountActivity` | existing trusted `lastLogin` if present | Historical metadata only; never real-time presence |

Legacy `academyId`, `activeAcademyId`, `tenantRole`, `linkedPlayerId`, and `assignedClients` on `users/{uid}` are informational/legacy routing metadata only and must not grant access or establish canonical relationship state.

## 3. Staff organization relationship

### Canonical source

`academies/{academyId}/members/{uid}`

Current Membership contract:

- `userId`
- `academyId`
- `role`: `ADMIN | COACH`
- `status`: `PENDING | ACTIVE | SUSPENDED | LEFT | REVOKED`
- `source`: `CLAIM_APPROVAL | SUPERADMIN_ASSIGNMENT | LEGACY_MIGRATION | INVITE`
- `approvalClaimId?`
- `joinedAt`
- `joinedBy`
- `updatedAt`

### Presentation mapping

| UI field | Value |
|---|---|
| Current Organization | resolved `academyId` → Academy identity |
| Relationship | Membership `role` |
| Relationship Status | Membership `status` |
| Source | canonical membership source classification |
| Integrity | based on exact document/user/academy/role/status consistency, not on `users.role` |

An ACTIVE ADMIN/COACH relationship must satisfy the existing exact-membership invariants already used by access/support code.

## 4. PLAYER / PARENT relationship

### Canonical source

Academy-scoped non-staff association records:

`academies/{academyId}/nonstaffUsers/{uid}/playerAssociations/{playerId}`

Exact association fields:

- `userId`
- `academyId`
- `playerId`
- `role`: `PLAYER | PARENT`
- `status`: `ACTIVE | INACTIVE | REVOKED`

The hardened resolver intentionally ignores legacy `users.academyId`, `users.activeAcademyId`, and `users.linkedPlayerId` for authorization.

### Parent presentation rule

For PARENT, display:

`Parent Account → linked Player → Academy context`

Do **not** display Academy as though the parent has staff Membership.

Example presentation:

- Relationship: `PARENT`
- Player context: `playerId`, and FUTID/name only when resolved from an authoritative player record
- Current Organization: Academy identified by the association path
- Source: `CANONICAL`

### Player presentation rule

For PLAYER, association identifies the authoritative Academy/player context available to the account. FUTID/name enrichment must come from authoritative player data, not from guessed user metadata.

## 5. Academy identity

Primary source:

`academies/{academyId}`

Presentation fields may include existing Academy display metadata such as name, short name, or logo when present.

The document path/id is the tenant identifier. Display names do not establish tenant authority.

## 6. Profile claims / approval evidence

Primary source:

`profile_claims/{claimId}`

Useful read-only context:

- requester identity
- requested role
- requested Academy
- approved role
- approved Academy
- claim status
- approval/rejection metadata

Claims may explain how a canonical relationship was approved. They must not override a contradictory or missing canonical Membership at runtime.

## 7. Legacy evidence classification

Legacy fields may be displayed only as evidence, for example:

- old `users.academyId`
- old `users.activeAcademyId`
- old `users.tenantRole`
- other previously preserved legacy relationship metadata

Legacy evidence does not automatically mean invalid data.

Read-model classification:

- `CANONICAL`: relationship confirmed by current authoritative record
- `LEGACY_COMPATIBLE`: legacy evidence exists and is shown without becoming authority
- `UNASSIGNED`: no authoritative relationship was resolved

Integrity classification is separate:

- `VERIFIED`
- `REVIEW_REQUIRED`
- `CONFLICT`
- `UNASSIGNED`

## 8. Initial row resolution policy

For each `users/{uid}` account:

1. Read canonical account identity/status.
2. Resolve canonical staff Membership relationships where available.
3. For PLAYER/PARENT accounts, resolve canonical non-staff associations through the hardened association rules/model.
4. Resolve Academy display identity for relationship rows.
5. Enrich linked player identity/FUTID only when an authoritative matching player record can be read safely.
6. Attach legacy evidence only as informational compatibility context.
7. If sources disagree, return `CONFLICT` / `REVIEW_REQUIRED`; do not choose a winner by guess.
8. If canonical relationship data cannot be resolved, return `UNASSIGNED` or `REVIEW_REQUIRED` as appropriate.

## 9. Proposed Phase-1 read-model shape

```ts
export type SuperAdminRelationshipSource =
  | "CANONICAL"
  | "LEGACY_COMPATIBLE"
  | "UNASSIGNED";

export type SuperAdminIntegrityState =
  | "VERIFIED"
  | "REVIEW_REQUIRED"
  | "CONFLICT"
  | "UNASSIGNED";

export interface SuperAdminOrganizationRelationship {
  organizationId: string;
  organizationName?: string;
  organizationType: "ACADEMY" | "PRO_CLUB" | "UNKNOWN";
  relationship: "ADMIN" | "COACH" | "PLAYER" | "PARENT" | string;
  relationshipStatus?: string;
  source: SuperAdminRelationshipSource;
  membershipSource?: string;
  playerId?: string;
  futId?: string;
  playerName?: string;
}

export interface SuperAdminUserRelationshipRow {
  userId: string;
  name?: string;
  email?: string;
  accountRole?: string;
  accountStatus?: string;
  organizations: SuperAdminOrganizationRelationship[];
  source: SuperAdminRelationshipSource;
  integrity: SuperAdminIntegrityState;
  legacyEvidence?: Record<string, unknown>;
  lastKnownAccountActivity?: unknown;
}
```

## 10. Fields deliberately NOT included

No Phase-1 read model field for:

- online status
- active-now presence
- heartbeat/session presence
- inferred transfer status
- inferred Pro Club relationship
- inferred Parent access after professional transition
- auto-migration recommendation that writes data

Those require separate explicit architecture decisions or source models.

## 11. Current implementation risk to solve next

The existing SuperAdmin UI can load the global `users` inventory and Academy list, but currently reads Academy staff members only after selecting one Academy. The new global Users & Relationships view therefore needs a deliberate read-adapter strategy rather than embedding ad hoc Firestore joins directly throughout the UI component.

Recommended next implementation slice:

1. Create pure read-model types/classification functions.
2. Unit-test canonical, legacy, conflict, parent, player, and unassigned cases.
3. Add a dedicated Firestore read adapter for SuperAdmin inventory composition.
4. Keep adapter reads separate from mutation services.
5. Only after that, render the new Users & Relationships table.

## 12. Production invariant

If a displayed relationship cannot be traced to a known source record, it must not be presented as canonical.
