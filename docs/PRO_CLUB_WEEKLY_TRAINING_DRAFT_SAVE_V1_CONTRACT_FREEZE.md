# Pro Club Weekly Training DRAFT Save V1 — Contract Freeze

## Status

Contract-only slice based on `main` commit `0fcd06911a8c6a35929bc2d0ae7ddf0ec5c868f2`.

This slice performs no Firebase production deploy, no production HTTP call, and no production data write. It does not modify `firestore.rules`, Firebase configuration, Functions, Pro Club runtime/UI, Academy repositories, or existing Weekly Training source files.

## Purpose

Define the smallest safe persistence path that lets an ACTIVE Pro Club Head Coach create a new normalized Weekly Training DRAFT without exposing partial hierarchy state.

The existing normalized persistence builder already produces canonical plan/session/block paths and payloads. The existing root rules already validate Head Coach DRAFT plan/session/block documents, but the merged root-rules regression currently creates the hierarchy sequentially: plan first, then session, then block. The production write adapter/batch semantics were explicitly deferred.

DRAFT Save V1 therefore freezes **fresh-plan atomic create only**. Editing an already persisted hierarchy, structural reconciliation, delete, lifecycle transition, Technical Director co-authoring, and production rollout remain separate reviewed slices.

## Canonical write target

A new saved DRAFT consists only of:

- `proClubs/{clubId}/weeklyTrainingPlans/{planId}`
- `proClubs/{clubId}/weeklyTrainingPlans/{planId}/sessions/{sessionId}`
- `proClubs/{clubId}/weeklyTrainingPlans/{planId}/sessions/{sessionId}/blocks/{blockId}`

The adapter MUST consume the validated bundle from `buildProClubWeeklyTrainingDraftWrite(...)`. It MUST NOT rebuild domain validation independently, infer alternate IDs, use Academy paths, or persist nested authoritative session/block arrays inside the plan document.

## Atomicity requirement

A fresh DRAFT hierarchy MUST become visible as one successful Firestore atomic operation or remain entirely absent.

The implementation MUST NOT use a sequential production algorithm such as:

1. create plan;
2. create sessions;
3. create blocks.

Sequential creation can expose a partially persisted DRAFT and can leave an incomplete hierarchy when a later write fails. DRAFT Save V1 therefore requires one client Firestore atomic commit for the complete fresh hierarchy.

Before the production adapter is connected, Firestore Emulator regression MUST prove that the real root `firestore.rules` authorize the canonical same-commit plan + session + block creation. If parent/session validation needs post-write visibility, the reviewed rules implementation MUST use the correct post-write semantics (`getAfter` / `existsAfter`) rather than weakening tenant, account, role, authority, identity, date, audit, or schema checks.

## Fresh-plan boundary

DRAFT Save V1 creates a **new plan ID** and a new normalized hierarchy only.

The V1 adapter MUST NOT silently overwrite or reconcile an existing persisted plan hierarchy. Existing-plan editing is deferred because current invariants include immutable plan week identity, immutable session date/time identity, immutable block order identity, and fail-closed deletes.

The future UI may freely edit an in-memory unsaved draft before the first successful save. Once persisted, mutation of the existing hierarchy remains outside this slice until a separate edit/reconciliation contract is reviewed.

## Authority boundary

The write remains authorized only by existing canonical Pro Club evidence at the exact `clubId`:

- signed-in actor;
- ACTIVE/Active `users/{uid}` account;
- ACTIVE canonical Pro Club Membership;
- ACTIVE canonical Pro Club Staff assignment;
- actor staff role exactly `HEAD_COACH` for this V1 write path;
- ACTIVE `technicalGovernance/current` snapshot backed by matching ACTIVE canonical Membership and Staff evidence.

Global `users.role`, global `SUPERADMIN`, Academy authority, staff-only presence, client payload fields, or UI state MUST NOT bypass these checks.

## Audit boundary

Every created plan/session/block document MUST contain the audit fields required by root rules:

- `createdAt == request.time`
- `updatedAt == request.time`
- `createdBy == request.auth.uid`
- `updatedBy == request.auth.uid`

The client adapter MUST source timestamps from Firestore server timestamp semantics and actor identity from the authenticated Firebase user. It MUST NOT accept arbitrary audit identity or trusted timestamps from form input.

## Failure behavior

The repository API MUST fail closed for at least:

- unauthenticated actor;
- invalid `clubId` or `planId`;
- invalid domain draft;
- non-empty `technicalDirectorNote` while TD co-author persistence remains closed;
- Firestore permission denial;
- any atomic commit failure.

A failed atomic commit MUST NOT be reported as success and MUST NOT intentionally fall back to sequential writes.

## Required implementation sequence

1. **Atomic Rules Proof** — real-root Firestore Emulator regression for same-commit plan/session/block create; make only the minimum reviewed root-rules change required for post-write parent visibility.
2. **Fresh DRAFT Repository Adapter** — one Firestore atomic commit using the canonical persistence bundle and server-auth audit fields.
3. **Repository Unit + Emulator Regression** — positive canonical create and negative auth/tenant/role/identity/atomicity cases.
4. **Read-back Adapter / UI Wiring** — separate slice after repository acceptance.
5. **Production Rollout Gate** — separate explicit authorization; not implied by merge.

## Deferred

- persisted DRAFT editing/reconciliation;
- session or block removal;
- plan delete;
- session date/time identity replacement;
- block reorder identity replacement;
- submit/review/revision/approve/publish transitions;
- Technical Director co-author writes and `technicalDirectorNote` persistence;
- append-only historical action evidence;
- production deployment or production data migration.

## Preservation

This contract does not authorize modification of unrelated Pro Club paths, Academy rules/repositories, Match code, Auth providers, organization runtime, production deploy scripts, or provisioning/onboarding contracts.

Any implementation slice that needs a broader scope MUST stop and create a separately reviewed contract instead of expanding this slice silently.

## Production safety

- `PRODUCTION_DEPLOYED=NO`
- `PRODUCTION_HTTP_CALLED=NO`
- `PRODUCTION_DATA_WRITTEN=NO`
- `FORCE_PUSH=NO`
