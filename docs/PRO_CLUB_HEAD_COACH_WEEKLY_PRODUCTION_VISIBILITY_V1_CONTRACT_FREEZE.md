# Pro Club Head Coach Weekly Production Visibility V1 — Contract Freeze

## Purpose

Freeze the smallest safe production-visibility change required for an already-authorized active Pro Club Head Coach to see the reviewed Weekly Training surfaces inside the existing club workspace.

This contract does **not** activate the full Pro Club Operations preview shell and does **not** change any production data authority.

`HEAD_COACH_WEEKLY_PRODUCTION_VISIBILITY_V1=CONTRACT_ONLY`

`IMPLEMENTATION_NOT_INCLUDED=YES`

`MERGE_AUTHORIZATION=NOT_GRANTED`

## Accepted baseline

- repository baseline: `main@96af8a067445c270f9d8782018c36286b5ebe516`
- baseline includes merged PR #169 Weekly Periodization Board V1 Slice 2 UI
- current Pro Club workspace resolves the club and actor through the existing organization authority bridge
- current production blocker is presentation visibility: `PRO_CLUB_OPERATIONS_PREVIEW_AVAILABLE` is DEV-only

## Current audited state

The following reviewed capabilities already exist independently of this visibility slice:

- `PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED = true`
- `WEEKLY_TRAINING_SAVED_DRAFT_READ_AVAILABLE` is derived from reviewed production index evidence
- `PRODUCTION_WEEKLY_TRAINING_FRESH_DRAFT_RULES_VERIFIED = true`
- `PRO_CLUB_WEEKLY_TRAINING_FRESH_DRAFT_PRODUCTION_AVAILABLE` is derived from reviewed production Rules evidence
- Weekly Periodization Board is downstream of validated Saved-DRAFT detail and is read-only

This contract does not re-review or widen those capabilities. It only defines whether the already-reviewed Weekly UI may be rendered in the existing authorized Pro Club workspace.

## Required production flow

V1 target flow:

`Login -> Pro Club -> existing authorized Club workspace -> Head Coach -> Weekly Training`

The production Weekly surface may contain only the already-reviewed Head Coach Weekly surfaces:

1. fresh Weekly Training DRAFT composer;
2. Saved DRAFT history/read detail;
3. Weekly Periodization Board derived from the Saved DRAFT detail.

`PRODUCTION_WEEKLY_SURFACE=HEAD_COACH_ONLY`

`FRESH_DRAFT_SURFACE=REUSE_EXISTING`

`SAVED_DRAFT_SURFACE=REUSE_EXISTING`

`PERIODIZATION_BOARD_SURFACE=REUSE_EXISTING`

## Authority boundary

Production visibility must reuse the existing `ProClubOrganizationAuthority` resolved by the existing Club workspace.

The visibility boundary requires all of the following:

- `organizationType == PRO_CLUB`
- `organizationStatus == ACTIVE`
- `membershipStatus == ACTIVE`
- `hasMembershipAuthority == true`
- effective staff role `HEAD_COACH`

The implementation must not accept a free-form club id, actor uid, role, or membership assertion as authority.

`AUTHORITY_SOURCE=EXISTING_PRO_CLUB_ORGANIZATION_AUTHORITY`

`SUPERADMIN_BYPASS=FORBIDDEN`

`TECHNICAL_DIRECTOR_VISIBILITY_EXPANSION=FORBIDDEN`

`ASSISTANT_COACH_VISIBILITY_EXPANSION=FORBIDDEN`

`GENERIC_STAFF_VISIBILITY_EXPANSION=FORBIDDEN`

## Critical shell boundary

The existing generic Pro Club Operations preview shell must remain DEV-only.

The implementation must **not** make production visibility work by changing `PRO_CLUB_OPERATIONS_PREVIEW_AVAILABLE` to true in production or by weakening `isProClubOperationsPreviewAvailable`.

`PRO_CLUB_OPERATIONS_PREVIEW_GATE=REMAIN_DEV_ONLY`

`FULL_OPERATIONS_PRODUCTION_ACTIVATION=FORBIDDEN`

Production Weekly visibility must use a separate narrow Head-Coach-only presentation entry point or equivalent narrowly scoped composition.

The following modules remain outside this activation:

- Squad
- Matches
- Fitness
- Analysis
- Availability
- Reports
- Staff management
- Club administration controls
- Competition Calendar

## Weekly capability boundary

The production Weekly surface must remain fail-closed unless the existing dedicated Weekly capabilities authorize their own behavior.

Fresh-DRAFT save authority remains controlled by:

`PRO_CLUB_WEEKLY_TRAINING_FRESH_DRAFT_PRODUCTION_AVAILABLE`

Saved-DRAFT read availability remains controlled by:

`WEEKLY_TRAINING_SAVED_DRAFT_READ_AVAILABLE`

This visibility slice must not replace, bypass, duplicate, or infer either capability.

`WEEKLY_CAPABILITIES=REUSE_UNCHANGED`

`ENVIRONMENT_TOGGLE_FOR_PRODUCTION_VISIBILITY=FORBIDDEN`

## Persistence and lifecycle boundary

No new persistence behavior is authorized.

The slice must not add or widen:

- existing-DRAFT edit/update/reconcile;
- delete/archive;
- submit/review/approve/publish;
- Technical Director co-authoring;
- a new callable, Function, HTTP mutation endpoint, Firestore write path, or storage path;
- a new Firestore collection or schema version;
- a new production write authority.

`EXISTING_DRAFT_EDITING=CLOSED`

`LIFECYCLE_EXPANSION=FORBIDDEN`

`NEW_PERSISTENCE=FORBIDDEN`

`NEW_WRITE_AUTHORITY=FORBIDDEN`

## Tenant neutrality

Lampang (`tnsu-lampang`) is the first intended real production visual-smoke tenant, but no code may hard-code Lampang, Talumball, a club id, organization name, or user id.

The implementation must work from the resolved current Pro Club authority for any valid tenant.

`TENANT_SPECIFIC_CODE=FORBIDDEN`

`LAMPANG_HARDCODE=FORBIDDEN`

## Auto-entry boundary

Single-Pro-Club automatic entry is a separate future slice.

This V1 does not change onboarding, organization selection, club switching, or workspace-reference UX.

`SINGLE_PRO_CLUB_AUTO_ENTRY=DEFERRED`

`ORGANIZATION_SWITCHER_CHANGE=FORBIDDEN`

`ONBOARDING_FLOW_CHANGE=FORBIDDEN`

## Frozen surfaces for the contract slice

This contract/audit slice may add only its contract document and contract test.

The following remain unchanged in the contract slice:

- `src/**`
- `functions/**`
- `firestore.rules`
- `firestore.indexes.json`
- Firebase configuration
- dependency manifests and lockfiles

`IMPLEMENTATION_SOURCE_CHANGED=NO`

`FIRESTORE_RULES_CHANGED=NO`

`FIRESTORE_INDEXES_CHANGED=NO`

`FUNCTIONS_CHANGED=NO`

`RUNTIME_CAPABILITY_CHANGED=NO`

`DEPLOY_PERFORMED=NO`

`PRODUCTION_DATA_WRITE=NO`

## Required implementation review gates

A future implementation branch may proceed only after independent exact-HEAD review of this contract passes.

The implementation review must prove at minimum:

1. exact baseline and file scope;
2. full Operations preview gate remains DEV-only;
3. production rendering is Head-Coach-only and uses resolved authority;
4. no tenant hard-coding;
5. existing Weekly production write/read capability gates remain authoritative;
6. no edit-existing-DRAFT or lifecycle expansion;
7. no Rules/indexes/Functions/schema change unless separately stopped and reviewed;
8. production build renders only the narrow Weekly surface, not the full Operations preview;
9. no production deployment or production write occurs during implementation review.

Mandatory five-question gate:

- INPUT
- AUTHORIZATION
- SECRET
- DEPENDENCY
- FAILURE_BEHAVIOR

Any FAIL / UNKNOWN / NOT TESTED result blocks merge.

`IMPLEMENTATION_AUTHORIZATION=NOT_GRANTED_BY_THIS_DOCUMENT`

`PRODUCTION_DEPLOY_AUTHORIZATION=NOT_GRANTED`

`PRODUCTION_DATA_WRITE_AUTHORIZATION=NOT_GRANTED`
