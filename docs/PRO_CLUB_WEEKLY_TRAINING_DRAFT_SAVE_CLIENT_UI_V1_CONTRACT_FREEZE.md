# Pro Club Weekly Training DRAFT Save Client + UI V1 — Contract Freeze

## Purpose

Connect the accepted `saveProClubWeeklyTrainingDraftV1` callable to the Pro Club Head Coach workspace without introducing a browser-side Firestore write path or changing production rollout state.

## Exact baseline

- Base `main`: `bf4f22446753cb9cdc56909f6acacc4790b5d201`
- PR #120 server-mediated fresh-DRAFT save foundation is already merged.
- PR #121 callable + App Check + production app-ID binding is already merged.

## Client transport boundary

- The only write transport for this slice is Firebase callable `saveProClubWeeklyTrainingDraftV1` in `asia-southeast1`.
- The browser client must not write Weekly Training plan/session/block documents directly to Firestore.
- There is no direct-write fallback when the callable is unavailable or fails.
- `FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE` must be checked before the default browser callable is constructed or invoked.
- The existing runtime capability remains authoritative: function-backed Pro Club browser actions are DEV/emulator-only in this slice and production web remains fail-closed.
- This slice must not modify `src/lib/firebase.ts`, `src/config/runtimeCapabilities.ts`, Firebase Functions, Firestore Rules, Firebase config, billing, or deployment configuration.

## Authority binding

- The UI receives a resolved `ProClubOrganizationAuthority` from the existing Pro Club workspace authority bridge.
- `clubId` is bound to `authority.organizationId` and is not user-editable.
- client `authorUid` is bound to `authority.userId` and is not user-editable.
- The UI save surface is enabled only for `staffRole === "HEAD_COACH"` with active resolved workspace authority.
- Technical Director fresh-DRAFT writes remain closed in this slice.
- Server authority remains canonical. Client role/UI state never authorizes persistence.

## Fresh DRAFT only

This slice supports creating a new Weekly Training DRAFT only.

Explicitly closed:
- edit/reconcile an existing DRAFT;
- overwrite or upsert by client-supplied plan ID;
- delete;
- submit/review/approve/publish lifecycle transitions;
- Technical Director co-author persistence;
- Technical Director note persistence.

The complete accepted shape remains available:
- 1–14 sessions per plan;
- 1–12 blocks per session;
- canonical domain field limits and duplicate-slot rules from `src/lib/proClubWeeklyTraining.ts`.

## Client validation

Before transport, the client must:
1. bind canonical club and authenticated workspace actor context;
2. run the existing `parseProClubWeeklyTrainingDraft` domain parser;
3. reject invalid canonical data before network invocation;
4. never add a non-empty Technical Director note.

Callable errors are normalized to safe client codes. Raw backend errors, auth tokens, App Check tokens, or submitted payloads must not be logged or rendered.

## Completion boundary

The UI may report success only after the callable returns a validated result containing:
- `status === "COMPLETED"`;
- the expected `clubId`;
- a canonical non-empty server-generated `planId`;
- `documentCount` exactly equal to `1 + sessions + blocks` for the submitted draft;
- a valid server `createdAt` timestamp.

Any malformed or mismatched response fails closed as an invalid response and must not be presented as a saved DRAFT.

## UI behavior

- Head Coach sees a real Weekly Training fresh-DRAFT composer in the Pro Club operations workspace.
- Club and actor identity are displayed as bound context, not editable inputs.
- Sessions and blocks can be added/removed up to domain maximums without imposing a smaller product cap.
- Duplicate submission is disabled while a save is pending.
- Validation/callable failure preserves the working form and shows a safe error.
- Production web shows a disabled/unavailable state while the existing Spark-first runtime gate remains closed.
- Technical Director retains a non-writing deferred shell.

## Acceptance gates

Before PR/merge:
1. exact ancestry from `bf4f22446753cb9cdc56909f6acacc4790b5d201`;
2. exact reviewed client/UI slice scope;
3. no Firestore Weekly Training writer/fallback introduced;
4. client adapter unit tests for authority binding, domain validation, callable error mapping, response validation, and document-count integrity;
5. UI/model tests for full 14-session / 12-block envelope controls and completion-only success semantics;
6. root TypeScript passes;
7. production Vite build passes;
8. existing Weekly Training domain/persistence/callable regressions pass;
9. independent Team 2 security/regression review;
10. Codex review with no unresolved P1/P2 blocker;
11. no production deploy/call/write/billing change.

## Safety flags

- `PRODUCTION_DEPLOYED=NO`
- `PRODUCTION_CALLABLE_INVOKED=NO`
- `PRODUCTION_DATA_WRITTEN=NO`
- `BILLING_PLAN_CHANGED=NO`
- `FIRESTORE_RULES_CHANGED=NO`
- `FUNCTIONS_CHANGED=NO`
- `RUNTIME_CAPABILITY_CHANGED=NO`
- `FORCE_PUSH=NO`
- `DIRECT_MAIN_EDIT=NO`
