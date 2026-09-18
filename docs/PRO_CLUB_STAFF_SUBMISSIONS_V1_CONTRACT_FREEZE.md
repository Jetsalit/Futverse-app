# FutVerse Pro Club Staff Submissions V1 Contract Freeze

## Status

Contract-only baseline. No production persistence, Rules, UI, deployment, or production-data change is authorized by this document.

## Baseline

- Base main: `522cff49397080e801306d6a251d0a3d6f4957e1`
- Tenant authority stays canonical at `proClubs/{clubId}/members/{uid}`.
- Football staff assignment stays canonical at `proClubs/{clubId}/staff/{uid}`.
- `OWNER | ADMIN | MEMBER` remains organization authorization and is not converted into a football staff role.
- Current football staff roles remain unchanged.
- Technical review authority continues to resolve only through the existing Technical Governance contract.
- Weekly Training, Squad, Attendance, onboarding, and existing production paths are preserved.

## Goal

Add one shared Staff Submissions workflow so football staff can submit role-specific work for technical review without duplicating Training, Squad, Attendance, membership, staff, or Technical Governance systems.

## V1 author roles

The first writable Staff Submissions slice is limited to ACTIVE staff with one of these roles:

- `ASSISTANT_COACH`
- `GK_COACH`
- `FITNESS_COACH`
- `ANALYST`
- `PHYSIO`

`HEAD_COACH` and `TECHNICAL_DIRECTOR` retain their existing Technical Governance / Weekly Training paths and are not given a second duplicate authoring path in V1.

`MANAGER`, `TEAM_MANAGER`, and generic `STAFF` are deliberately deferred until a reviewed work-type contract exists for them.

## Reviewer / approval authority

Only the exact ACTIVE technical authority resolved by the existing canonical Technical Governance state may begin review, request revision, or approve Staff Submissions.

- Technical authority roles remain `TECHNICAL_DIRECTOR | HEAD_COACH`.
- Self-approval remains forbidden.
- OWNER/ADMIN may receive read-only organization oversight later, but organization authorization alone MUST NOT grant technical approval capability.
- No `users.role` or client-supplied role may grant review authority.

## Lifecycle

V1 reuses the existing `ProClubTechnicalWorkStatus` values and transition semantics. It MUST NOT introduce a competing workflow enum.

```
DRAFT
  -> SUBMITTED
  -> IN_REVIEW
      -> NEEDS_REVISION -> SUBMITTED
      -> APPROVED
```

`PUBLISHED` remains reserved by the existing Technical Governance contract and is not automatically equivalent to training execution.

Execution/completion state MUST NOT be encoded by mutating the approval status. A future execution contract may reference an approved submission separately.

## Canonical persistence boundary

V1 persistence path:

```
proClubs/{clubId}/staffSubmissions/{submissionId}
```

The submission document MUST be tenant-bound and actor-bound. It MUST NOT modify Weekly Training documents, Attendance documents, Squad documents, membership documents, or staff assignment documents as a side effect of creating/submitting/reviewing a Staff Submission.

Deletes are forbidden in V1.

## Submission schema V1

Required canonical fields:

- `schemaVersion: 1`
- `authorUid`
- `authorRole`
- `workType`
- `title`
- `summary`
- `module: "TRAINING"`
- `targetPlanId: string | null`
- `targetSessionDate: string | null`
- `status`
- `reviewerUid: string | null`
- `reviewerRole: "TECHNICAL_DIRECTOR" | "HEAD_COACH" | null`
- `reviewNote: string | null`
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`
- `submittedAt: timestamp | null`
- `submittedBy: string | null`
- `reviewStartedAt: timestamp | null`
- `reviewStartedBy: string | null`
- `revisionRequestedAt: timestamp | null`
- `revisionRequestedBy: string | null`
- `approvedAt: timestamp | null`
- `approvedBy: string | null`

The document ID is the submission identity and MUST NOT be duplicated as mutable payload data.

## Work types

V1 work types are intentionally narrow:

- `TRAINING_SUPPORT`
- `GK_TRAINING`
- `FITNESS`
- `ANALYSIS`
- `PHYSIO`

Role/work-type compatibility MUST be validated by model and Rules. A role cannot impersonate another department by choosing an arbitrary work type.

## Training connection

V1 connects Staff Submissions to Training through references only.

- `module` is fixed to `TRAINING`.
- `targetPlanId` references an existing Pro Club Weekly Training plan when present.
- `targetSessionDate` references a session date within that plan when present.
- Approval MUST NOT silently rewrite or append blocks to the Weekly Training plan.
- The production Training UI may show linked approved/submitted work and may open the referenced submission.
- Any future mutation from approved submission into the canonical Weekly Training hierarchy requires its own reviewed contract.

This preserves the existing Head Coach Weekly Training schema and persistence boundary.

## Read / write intent

V1 intended access:

- ACTIVE V1 author role: create own DRAFT; read own submissions; edit own DRAFT or NEEDS_REVISION; submit own work.
- ACTIVE technical authority: read tenant submissions; move SUBMITTED -> IN_REVIEW; move IN_REVIEW -> NEEDS_REVISION or APPROVED; write review note/provenance.
- ACTIVE OWNER/ADMIN: read-only oversight MAY be opened only if Rules can preserve technical-authority separation.
- Other ACTIVE staff: no tenant-wide list by default.
- No delete for any client role.

Firestore Rules remain the final client authority.

## UI contract

Production wiring MUST extend the existing `ProClubTeamDashboard`; it MUST NOT mount the legacy DEV-only `ProClubOperationsDashboard`.

Required surfaces:

- Eligible staff: `My Work / ส่งงาน`.
- Technical authority: `Submissions / งานที่ส่งมา`.
- Training: linked submission visibility for the existing Training module.
- OWNER: no technical approval controls from membership role alone.

All new production navigation must use the existing active-tab / refresh-persistence pattern.

## Preservation rules

The implementation MUST NOT:

- create a second membership or staff-role system;
- duplicate Technical Governance;
- replace or copy Weekly Training persistence;
- relax Head Coach-only Weekly Training write guards;
- turn OWNER into a football staff role;
- grant review/approval from client-presented role values;
- delete or overwrite historical submissions;
- enable Matches, Fitness, Analysis, or other unfinished production modules as a side effect;
- deploy until exact-HEAD review and all targeted/regression gates pass.

## Required implementation slices after this freeze

1. model + validator + role/work-type compatibility;
2. Firestore Rules + emulator regression;
3. repository adapter;
4. My Work UI;
5. technical-authority Review Inbox UI;
6. Training reference wiring;
7. production dashboard navigation wiring;
8. targeted tests + TypeScript/build;
9. independent exact-HEAD review;
10. merge, then controlled production deploy as a separate final action.
