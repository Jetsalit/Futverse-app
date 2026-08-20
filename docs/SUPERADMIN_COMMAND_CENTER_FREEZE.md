# FutVerse SuperAdmin Command Center — Production Freeze Contract

Status: **FROZEN FOR IMPLEMENTATION**  
Scope: SuperAdmin global workspace  
Base branch: `main` at `4ce62a3a5453b05177dbb10fd189871b8e64278e`

## 1. Purpose

This document defines the implementation boundary for the FutVerse SuperAdmin Command Center before production UI work begins.

The goal is to improve SuperAdmin operations without rewriting or reinterpreting hardened identity, membership, security, FUTID, parent/player association, legacy compatibility, or production history.

The implementation approach is:

**Preserve → Read → Compose → Extend**

Not:

**Rewrite → Migrate → Replace**

## 2. Protected Core — MUST NOT BE REWRITTEN

The following are protected production invariants for this workstream:

- Firebase authentication identity.
- `users/{uid}` canonical account identity behavior.
- Academy staff Membership authority under `academies/{academyId}/members/{uid}`.
- Membership role/status validation and fail-closed access behavior.
- Existing hardened SuperAdmin privileged authorization.
- Existing SuperAdmin Work As / support access controls and audit behavior.
- Existing authoritative PLAYER/PARENT association model.
- FUTID identity and history continuity.
- Existing legacy player-evaluation compatibility/recovery behavior.
- Existing Firestore production data.
- Existing historical records and tenant ownership boundaries.

No UI requirement in this workstream is permission to change the meaning of these systems.

## 3. Forbidden Changes in Phase 1

Phase 1 MUST NOT:

- Delete production records.
- Rewrite production records to fit the new UI.
- Automatically migrate legacy records.
- Deduplicate production identities or histories.
- Infer a canonical membership from legacy `users.role`, `users.academyId`, or similar legacy pointers.
- Recreate or replace hardened Membership/Security/FUTID architecture.
- Introduce a new impersonation system.
- Introduce an Online Presence system.
- Add heartbeat, presence, online-now, live-user, or active-session tracking solely for UI display.
- Re-enable the old notification service as an authoritative production notification source.
- Mix Academy tenant operations into the global SuperAdmin shell without an explicit selected tenant/workspace context.

## 4. SuperAdmin Global Shell — Frozen Direction

The global SuperAdmin shell is operational/system-focused.

Primary navigation:

- Command Center
- Users & Access
- Organizations
- Integrity Center
- Audit Logs
- Notifications
- Support Tools
- Reports

Academy/Club operational navigation MUST NOT appear in the normal global SuperAdmin shell, including:

- Match Evaluation
- Academy Settings
- Academy Training operations
- Academy player operational pages
- Tenant-specific tools that require an Academy/Club context

To enter tenant operations, SuperAdmin must first select or resolve an explicit organization workspace and continue through the existing hardened support/workspace model.

## 5. Command Center v1 — Operational Scope

The first production-capable Command Center should prioritize real work over decorative metrics.

Included:

- Action / Review Queue
- User Approvals summary
- Parent Link Review summary where authoritative data exists
- Membership Review summary where authoritative data exists
- Profile Claims summary
- Integrity / Legacy Review summary
- Users & Relationships
- Organization context/health summary derived from authoritative sources
- Recent Audit activity
- Existing Work As / Support entry points
- Loading, empty, unavailable, permission-denied, and partial-data states

Excluded from v1:

- Online Users / Presence
- Artificial live counts
- AI-generated risk scores
- Automatic migration actions
- Destructive cleanup actions
- New notification backend

## 6. Users & Relationships — Read Model First

The core v1 capability is a SuperAdmin read model that explains a person/account in context without changing source records.

### 6.1 Authoritative source categories

Account identity/status:

- `users/{uid}`

Academy staff relationship:

- `academies/{academyId}/members/{uid}`

PLAYER/PARENT relationship:

- hardened non-staff association records under Academy scope

Player identity/history context:

- authoritative Academy player records and FUTID-bearing records already supported by the production architecture

Organization identity:

- `academies/{academyId}`
- future Pro Club organization source must be added through the shared organization architecture, not guessed from Academy data

Claims/review evidence:

- `profile_claims`
- other existing authoritative review sources only when explicitly mapped

Legacy evidence:

- legacy fields/records may be displayed as informational compatibility evidence
- legacy evidence MUST NOT become authorization authority

### 6.2 Proposed presentation read model

The UI may compose a derived object similar to:

```ts
interface SuperAdminUserRelationshipRow {
  userId: string;
  name?: string;
  email?: string;
  accountStatus?: string;

  organizations: Array<{
    organizationId: string;
    organizationName?: string;
    organizationType?: "ACADEMY" | "PRO_CLUB" | "UNKNOWN";
    relationship: string;
    relationshipStatus?: string;
    source: "CANONICAL" | "LEGACY_COMPATIBLE";
  }>;

  relationshipSource:
    | "CANONICAL"
    | "LEGACY_COMPATIBLE"
    | "UNASSIGNED";

  integrity:
    | "VERIFIED"
    | "REVIEW_REQUIRED"
    | "CONFLICT"
    | "UNASSIGNED";

  playerContext?: {
    playerId?: string;
    futId?: string;
    playerName?: string;
  };

  lastKnownAccountActivity?: unknown;
}
```

This structure is a presentation/read model only. It is not a new authorization source and MUST NOT be written back to replace source records.

## 7. Canonical vs Legacy Presentation

Do not use temporary labels such as `OLD` and `NEW`.

Use stable semantic labels:

- `CANONICAL`
- `LEGACY_COMPATIBLE`
- `UNASSIGNED`

Integrity state is a separate dimension:

- `VERIFIED`
- `REVIEW_REQUIRED`
- `CONFLICT`
- `UNASSIGNED`

Examples:

- `CANONICAL + VERIFIED`
- `LEGACY_COMPATIBLE + VERIFIED`
- `LEGACY_COMPATIBLE + REVIEW_REQUIRED`
- `UNASSIGNED + UNASSIGNED`

A legacy record is not automatically an error.

## 8. Parent Display Rule

PARENT must not be presented as if the parent is an Academy staff member.

The UI should represent the relationship as:

`Parent Account → Player/FUTID → Current Organization`

Where available, show:

- Parent identity
- linked player identity
- FUTID
- current player organization
- relationship source/integrity

The Academy/Club shown for a parent is contextual through the linked player, not a staff Membership assertion.

## 9. Staff Display Rule

ADMIN/COACH organization context must be derived from canonical Membership where available.

A UI label such as `externally managed` may be retained or refined, but the interface should identify the organization and Membership context instead of presenting global `users.role` as tenant authority.

## 10. Multi-Organization and History

The read model must not assume one user can only ever be related to one organization.

The UI should be capable of showing:

- current organization relationships
- ended/historical relationships when authoritative history exists
- multiple organization relationships without collapsing them into one global role

No automatic transfer/migration logic is introduced by this UI workstream.

## 11. Notifications

Current notification UI may remain as a shell/placeholder.

For Command Center v1:

- do not re-enable the legacy notification service as production authority
- do not fabricate operational notifications
- do not create a new notification engine in the first implementation slice

A future notification engine must be designed separately with authoritative event sources, recipient scope, read/resolved state, audit behavior, and tenant/security boundaries.

## 12. Online Users Decision

**NO ONLINE PRESENCE SYSTEM IN THIS WORKSTREAM.**

Remove from production blueprint:

- Online Now
- Online Users
- green presence dots derived from heartbeat
- live presence counts
- presence/session heartbeat infrastructure

If an existing trusted `lastLogin`/last-activity field already exists, it may be displayed as historical account metadata only. It must not be presented as real-time presence.

## 13. UI Direction

Approved UI direction:

- Production-oriented SuperAdmin Command Center
- dark navy / neon-green SuperAdmin visual identity
- operational action queue
- strong Users & Relationships table
- clear organization / relationship / source / integrity presentation
- Review Queue side panel
- Audit / Support / Work As visibility
- responsive implementation using the existing React/TypeScript/Tailwind stack

The visual redesign must not change authorization behavior.

## 14. Failure / Partial Data Rules

The UI must never invent missing relationships.

If authoritative data cannot be resolved:

- display unavailable / review required / unassigned
- do not fall back to a legacy pointer as authority
- do not silently cross Academy boundaries
- do not hide integrity conflicts
- do not auto-repair production data

Read failures should fail visibly and safely.

## 15. Phase 1 Change Classification

Expected first implementation slice:

- `READ-ONLY`: new SuperAdmin relationship/read-model resolution
- `ADDITIVE`: new UI components and presentation models
- `ADDITIVE`: new tests for read-model classification and rendering logic
- `PRESERVE`: existing Work As/support functionality

Not expected in first slice:

- `MIGRATION`
- `DESTRUCTIVE`
- `SECURITY REWRITE`
- `FUTID REWRITE`
- `MEMBERSHIP REWRITE`

Any need for one of these classifications requires a separate explicit review before implementation.

## 16. Acceptance Criteria Before Production UI Is Considered Complete

At minimum:

1. SuperAdmin global navigation no longer exposes Academy-only operations without explicit tenant context.
2. Users & Relationships can explain current authoritative organization context for supported staff accounts.
3. Supported Parent/Player relationship context is displayed without treating Parent as staff membership.
4. Canonical vs legacy-compatible state is visible and does not change authorization.
5. Missing/conflicting data is surfaced as review state, not guessed.
6. No production migration or record deletion is performed.
7. Hardened Membership/Security/FUTID tests remain passing.
8. Existing SuperAdmin Work As/support controls remain fail-closed and auditable.
9. UI handles loading/error/empty states.
10. Production build and static/type checks pass.
11. Diff review confirms no unexpected protected-core modifications.

## 17. Implementation Order

1. Current-state audit and freeze contract — **this document**
2. SuperAdmin relationship data-source map
3. Read-model pure functions/types + tests
4. Users & Relationships presentation
5. SuperAdmin global shell/navigation cleanup
6. Command Center review/action summaries
7. Work As/support integration presentation
8. Loading/error/empty states
9. Regression verification
10. Production deployment decision as a separate explicit step

---

### Production rule

If a future implementation request conflicts with this contract, stop and review the conflict before changing production architecture or data.
