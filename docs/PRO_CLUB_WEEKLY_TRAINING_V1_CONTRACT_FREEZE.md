# FutVerse Pro Club Weekly Training V1 Contract Freeze

Status: PROPOSED PURE DOMAIN / WORKFLOW FOUNDATION

## 1. Baseline and Scope

- Repository: `Jetsalit/Futverse-app`
- Base branch: `main`
- Exact base commit: `e588a91bbad5fbd43d9b90dba718372d181478fa`
- Working branch: `feat/pro-club-weekly-training-v1-contract`

This slice may add only:

1. `docs/PRO_CLUB_WEEKLY_TRAINING_V1_CONTRACT_FREEZE.md`
2. `src/lib/proClubWeeklyTraining.ts`
3. `tests/proClubWeeklyTraining.unit.test.ts`

This slice must not modify Firestore Rules, Firebase config, Functions, existing Pro Club runtime/UI, Academy repositories, production data, or production deployment behavior.

No production deploy, production HTTP call, production Firestore write, membership mutation, staff mutation, or force push is authorized.

## 2. Purpose

Freeze the first authoritative domain and workflow contract for Pro Club weekly training before any persistence or editable UI is introduced.

The contract must support the real Thai professional-club structures already frozen by Technical Governance V1:

- Head Coach-led club with no active Technical Director;
- Technical Director-led review structure;
- Technical Director co-authoring / reviewing Head Coach work;
- current technical authority resolved dynamically rather than hard-coded from a role label;
- historical action provenance that does not change when staff roles change later.

## 3. Weekly Plan Domain

A weekly plan contains:

- exact club identity;
- exact author identity;
- week start date;
- squad label until a dedicated Pro Club squad repository is frozen;
- main objective;
- optional secondary objective;
- session plans within the seven-day week;
- optional Head Coach note;
- optional Technical Director note.

Each session contains:

- session date;
- start time;
- location;
- objective;
- phase of play;
- planned load category;
- planned duration;
- ordered training blocks.

Each training block contains:

- block type;
- title;
- duration;
- optional exact Drill Library reference;
- coaching points.

No medical diagnosis, clinical note, treatment detail, Academy player record, or Academy repository reference belongs in this contract.

## 4. Validation Boundary

The pure parser accepts `unknown` and must fail closed.

Unexpected fields are rejected at plan, session, and block level. This prevents misspelled or stale persisted fields from being silently ignored.

Required invariants include:

- club/author identifiers are exact document identifiers;
- dates are strict `YYYY-MM-DD` calendar dates;
- session dates fall inside the plan's seven-day week;
- time is strict `HH:mm`;
- sessions and blocks are non-empty and bounded;
- durations and text lengths are bounded;
- Drill Library reference, when present, is an exact document identifier;
- coaching points are bounded and non-empty.

The parser is a domain-shape validator only. It does not authorize tenant access.

## 5. Workflow States

Weekly Training reuses the Technical Governance lifecycle:

```text
DRAFT
  ├─> SUBMITTED -> IN_REVIEW -> APPROVED
  │                         └-> NEEDS_REVISION -> SUBMITTED
  └─> PUBLISHED
```

`APPROVED` is used when work authored by somebody else is approved by the resolved technical authority.

`PUBLISHED` is used when the resolved technical authority publishes its own work. The system must not manufacture self-approval.

## 6. Head Coach + Technical Director Workflow

When Technical Director is the resolved technical authority:

```text
HEAD_COACH
Create / Edit DRAFT
      ↓
SUBMIT
      ↓
TECHNICAL_DIRECTOR
Co-author / Begin Review / Edit with provenance
      ├─> NEEDS_REVISION -> Head Coach edits -> SUBMIT
      └─> APPROVED
```

Only the exact resolved technical authority may begin review, request revision, or approve.

A Technical Director title by itself is insufficient.

## 7. Head Coach-led Workflow

When Head Coach is the resolved technical authority and is also the author:

```text
HEAD_COACH
Create / Edit DRAFT
      ↓
PUBLISH
      ↓
PUBLISHED
```

The Head Coach must not submit to and approve himself.

If the Head Coach is current authority and reviews another department's work, that separate work may use review/approval; this weekly-plan self-work contract still uses publish.

## 8. Edit Rules

- plan author may edit only `DRAFT` or `NEEDS_REVISION`;
- exact resolved Technical Director authority may co-author another person's plan while it is `DRAFT`, `SUBMITTED`, or `IN_REVIEW`;
- a non-authority Technical Director does not gain co-author permission merely from the role label;
- terminal `APPROVED` / `PUBLISHED` work is not editable in V1;
- unresolved / missing / ambiguous technical authority fails closed for workflow actions.

## 9. Action Authorization Contract

Pure workflow decisions may use Technical Governance capabilities and authority resolution, but they are not a Firestore authorization mechanism.

Future persistent writes must independently verify all of:

- exact club identity;
- canonical ACTIVE tenant membership;
- canonical ACTIVE staff assignment;
- actor UID;
- actor effective role;
- current technical authority resolution;
- work author UID;
- current work status;
- permitted transition;
- action provenance.

A lifecycle transition helper alone must never authorize a write.

## 10. Historical Provenance

Every future persisted workflow action must snapshot at action time:

- actor UID;
- actor effective staff role;
- action;
- prior status;
- resulting status;
- technical authority UID and role;
- action timestamp.

Later role reassignment must never reinterpret old actions.

Example:

```text
June: Coach A publishes/approves as HEAD_COACH
July: Coach A becomes TECHNICAL_DIRECTOR
```

The June action remains historically `HEAD_COACH`.

## 11. Explicitly Deferred

This slice does not implement:

- Firestore collection/path/schema;
- Firestore Rules;
- repository/service writes;
- technical governance config persistence;
- effective-dated staff-role history storage;
- editable Training UI;
- Drill Library integration write flow;
- player availability integration;
- medical data;
- Department Reports persistence;
- dashboard data adapter;
- production rollout.

Successor work must follow the standard order:

```text
contract/model -> tests -> rules -> repository/adapter -> UI
```
