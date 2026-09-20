# Pro Club Technical Director Full Football Authority V1

Status: CONTRACT / AUDIT FOUNDATION

Baseline: `24e08239af7c749a3b15009f0887897e884d73b4`

## Product decision

An ACTIVE Pro Club `TECHNICAL_DIRECTOR` has full football-operational visibility inside the exact club and may:

- view every football module/page made available to that club;
- write daily training plans;
- write weekly training plans;
- edit training DRAFT work under the reviewed persistence contract;
- review submitted technical work;
- request revision;
- approve submitted technical work;
- create and edit football assessments/evaluations.

This football role does not replace or mutate tenant authorization. An actor may therefore be both `authorizationRole = OWNER` and `staffRole = TECHNICAL_DIRECTOR` without either identity being rewritten.

## Safety and audit invariants

- exact club/UID authority is required;
- club, membership and staff assignment must all be ACTIVE;
- no cross-club access is granted;
- no client privilege bypass is introduced;
- review/approval requires the exact resolved technical authority identity;
- ambiguous technical leadership fails closed for review/approval;
- all future write persistence must preserve actor UID, actor role and timestamps;
- Technical Director cannot delete audit/history records through this contract;
- Technical Director football authority does not grant permission to change OWNER/ADMIN/MEMBER tenant authority;
- no Functions or Blaze dependency is introduced by this contract.

## Current production audit at baseline

| Capability | Current state at baseline | Target |
| --- | --- | --- |
| Squad read | ACTIVE staff read contract exists | Full read |
| Attendance read | ACTIVE staff read contract exists | Full read |
| Weekly Training fresh DRAFT | UI/runtime currently gates authoring to `HEAD_COACH` | TD daily + weekly authoring |
| Weekly Training existing DRAFT | existing implementation remains Head Coach oriented | TD edit under reviewed contract |
| Staff submissions review | TD reviewer path already exists | Keep + harden review/approve provenance |
| Reports | presentation/runtime varies by implemented module | Full read when module exists |
| Assessment | no dedicated Pro Club production assessment surface is currently wired | Add reviewed TD assessment slice |
| Matches | dashboard surface is currently disabled/coming soon | Full read when module is activated |

“Full view” means permission to access all football-operational modules that exist for the exact club. It does not fabricate modules that have not yet been implemented.

## Implementation sequence after RUN 1 production smoke

1. Full-read routing/presentation gate for Technical Director.
2. Daily + weekly Training authoring using existing canonical Weekly Training schema/persistence where compatible.
3. Existing-DRAFT edit capability for Technical Director with exact actor provenance.
4. Technical review / revision / approval persistence hardening.
5. Pro Club assessment/evaluation foundation and production activation.
6. Exact-head verification, controlled merge, Spark readiness, controlled deploy and production smoke.

This foundation intentionally does not modify Firestore Rules, production runtime UI, Hosting, Functions or production data.
