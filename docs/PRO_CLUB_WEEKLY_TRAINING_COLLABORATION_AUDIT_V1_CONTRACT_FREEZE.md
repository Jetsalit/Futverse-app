# Pro Club Weekly Training Collaboration & Audit V1 — Contract Freeze

## Baseline

This contract is based on accepted `main` at `c1742e2437a6e747c236fa49e4da50437b5d873d`.

It is intentionally independent from PR #162 and does not inherit the failed schema-v2 root Rules integration.

## Purpose

Extend Weekly Training toward real Pro Club coaching operations without changing production persistence in this slice.

The operating model is:

1. Head Coach owns the Weekly Plan and weekly football intent.
2. Assigned staff may prepare the daily/session work that belongs to their responsibility.
3. The planned session may be adjusted when real conditions change, but a coach is not required to rewrite the original plan simply because execution changed.
4. Actual execution is recorded separately from the original plan.
5. Every meaningful action is attributable to the real actor and retained in an append-only audit history.

## Roles and authority

### Head Coach

- primary owner/author of the Weekly Plan;
- may assign session/departments to eligible active staff;
- may prepare and edit plan/session work within the reviewed workflow;
- remains the normal football owner of the weekly plan.

### Assigned coaching staff

Eligible staff roles are initially:

- `ASSISTANT_COACH`
- `GK_COACH`
- `FITNESS_COACH`
- `ANALYST`

Assignment is explicit and scoped. A staff role alone does not grant access to every Weekly Training plan.

An assigned contributor may work only on the assigned plan/session/area and only while canonical account, club membership and staff assignment remain ACTIVE.

### Technical Director

Technical Director is a football-governance authority, not an automatic co-author of every plan.

A reviewed future persistence slice may permit Technical Director review, return, approval and necessary correction with full provenance. This contract does not open those writes yet.

### Owner / Club Admin

OWNER or ADMIN may manage organization-level delegation when a future trusted delegation persistence contract is accepted. OWNER/ADMIN status alone must never become football-content authority.

### SuperAdmin

Global SUPERADMIN is not an automatic Pro Club football authority.

Future emergency/support correction must use an explicit audited support/break-glass flow with club + plan scope, reason and actor provenance. This contract does not open SuperAdmin Weekly Training writes.

## Plan → Execution → Actual

Weekly Training must preserve three concepts rather than rewriting history:

### PLAN

What the coaching team intended before the session.

Examples:
- weekly objective;
- planned load;
- planned player shape;
- session objective;
- planned drills/blocks.

### EXECUTION

The working session used by assigned staff on the day.

It may be adjusted before/during training when circumstances change.

Examples:
- player availability changes;
- injury;
- weather;
- pitch/time changes;
- coach changes 10v10 to 8v8.

### ACTUAL

What actually happened.

The original Plan must not be silently overwritten merely to make it look identical to Actual.

The system must support the valid case where the planned session is never edited, but Actual records the real execution difference.

## Audit history

Audit history is append-only and actor-specific.

Every meaningful action must retain at least:

- `actorUid`
- `actorRole`
- `action`
- `targetType`
- `targetId`
- `clubId`
- `occurredAt`
- `delegatedBy` when applicable
- `reason` when supplied/required

Future correction/support actions additionally require explicit support/emergency provenance.

A single latest `updatedBy` field is not a substitute for the audit history.

## UI preview boundary

A first UI slice may show the collaboration model on the real Pro Club workspace before persistence is enabled.

The preview may display:

- Weekly Plan owner;
- assigned staff responsibilities;
- Plan / Actual distinction;
- change reason examples;
- actor-by-actor timeline;
- Technical Director and emergency-support boundaries.

The preview must be read-only/sample-state only and must not claim that delegation, Actual or audit persistence exists.

It must not call Firestore, callable Functions, HTTP endpoints or production APIs for this new collaboration data.

## V1 / V2 preservation

This work must not couple staff role to schema version.

- V1 and V2 remain data/persistence versions.
- roles/delegation are authorization/workflow concepts.
- no role gets its own schema version.
- no schema migration is authorized by this contract.

The failed PR #162 exact HEAD is not acceptable evidence for this work.

## Explicitly out of scope

- production Firestore Rules changes;
- production deploy;
- production data write;
- production capability activation;
- existing-DRAFT edit persistence;
- delegation persistence;
- Actual-session persistence;
- audit-log persistence;
- Technical Director write authority;
- OWNER/ADMIN football-content write authority;
- SuperAdmin football-content bypass;
- submit/review/approve/publish persistence changes.

## Mandatory safety gate

Before any persistence implementation:

- INPUT
- AUTHORIZATION
- SECRET
- DEPENDENCY
- FAILURE_BEHAVIOR

Any FAIL / UNKNOWN / NOT TESTED means MERGE STOP for the relevant persistence slice.

## Current authorization

`UI_PREVIEW_ONLY=AUTHORIZED_BY_CONTRACT`
`NEW_PERSISTENCE=NOT_AUTHORIZED`
`FIRESTORE_RULES_CHANGE=NOT_AUTHORIZED`
`PRODUCTION_DEPLOY=NOT_AUTHORIZED`
`PRODUCTION_DATA_WRITE=NOT_AUTHORIZED`
`PRODUCTION_CAPABILITY_CHANGE=NOT_AUTHORIZED`
