# FutVerse — Pro Club Weekly Training Existing-DRAFT Production Activation V1 Contract Freeze

## Purpose

Freeze the production-activation boundary for **Head Coach editing an existing schema-v2 Weekly Training DRAFT** after PR #180 implementation acceptance.

This slice is contract/audit only. It does not deploy Functions or Hosting, does not enable the server writer, does not enable the production web editor, and does not authorize a production Firestore write.

## Exact baseline

- Repository: `Jetsalit/Futverse-app`
- Accepted branch: `main`
- Accepted baseline SHA: `86a51ee57dbb90d56f5b50b74e2eda4ca6a3f224`
- Baseline includes merged PR #180 Existing-DRAFT edit completion train.
- Contract branch: `feat/pro-club-weekly-training-existing-draft-production-activation-v1-contract`

`SCOPE=DOCS_TESTS_ONLY`

Exactly two new files are authorized for this contract slice:

1. `docs/PRO_CLUB_WEEKLY_TRAINING_EXISTING_DRAFT_PRODUCTION_ACTIVATION_V1_CONTRACT_FREEZE.md`
2. `tests/proClubWeeklyTrainingExistingDraftProductionActivationV1Contract.test.ts`

No runtime source, Firebase configuration, Rules, indexes, dependency manifests, lockfiles, deployment state, or production data may change in this slice.

## Accepted implementation state

The accepted implementation already provides a dedicated trusted callable path:

- callable: `editProClubWeeklyTrainingExistingDraftV1`;
- exact optimistic concurrency token: Firestore `{ seconds, nanoseconds }`;
- actor identity from authenticated callable context only;
- ACTIVE user / Pro Club / membership / Head Coach staff authority revalidated in the trusted transaction;
- current technical-governance evidence revalidated;
- only own schema-v2 `DRAFT` may be edited;
- fixed plan/session/block hierarchy only;
- no create, append, delete, archive, submit, approve, publish, or lifecycle transition;
- creation audit remains immutable;
- update audit remains coherent across the hierarchy;
- stale or structurally changed state conflicts before writes;
- ambiguous client outcome requires complete read-back reconciliation before any retry.

These invariants are frozen. Production activation may not weaken them.

## Current fail-closed production state

### Server gate

`functions/src/proClubWeeklyTrainingExistingDraftEdit/callableHandler.ts` defines:

`PRODUCTION_WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_SERVER_ENABLED = false`

Outside the Functions emulator, the callable rejects before App Check/auth/service execution while this source-controlled gate is false.

`SERVER_PRODUCTION_EDIT_GATE=CLOSED`

### Web gate

`src/config/runtimeCapabilities.ts` defines:

`PRODUCTION_WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_WRITER_VERIFIED = false`

A deployable web build therefore does not expose the Existing-DRAFT edit action. Local Vite dev remains separately allowed for reviewed development testing.

`WEB_PRODUCTION_EDIT_GATE=CLOSED`

### Deployment boundary

`firebase.json` includes the Functions codebase, while `firebase.spark.json` remains Hosting-only.

Existing-DRAFT writer production rollout therefore belongs to the separately authorized Functions/server deployment boundary. It must not be smuggled into a Spark Hosting-only release.

`SPARK_HOSTING_BOUNDARY=PRESERVE`
`FUNCTIONS_DEPLOYMENT_REQUIRES_SEPARATE_OWNER_AUTHORIZATION=YES`

## Mandatory activation order

Production activation is split into independent gates. They must execute in this order.

### Gate A — Contract acceptance

- merge this docs/tests-only contract after exact-head independent review;
- no runtime source change;
- no deploy;
- no production request;
- no production write.

### Gate B — Disabled-writer deployment candidate

Prepare and review the exact deploy candidate that contains the callable implementation while **both production activation constants remain false**.

Before any deploy authorization, prove the standard production deploy-readiness gates, Functions build, TypeScript/build gates, exact Firebase project, clean worktree, and exact candidate SHA.

Deployment is not authorized by this contract. If separately authorized by the owner, deploy only the reviewed function/server scope required for the Existing-DRAFT writer. Do not deploy Hosting merely to deploy the disabled writer.

After that deployment, verify credential-free/read-only evidence that the endpoint exists and remains fail-closed. No successful business mutation belongs to Gate B.

`GATE_B_SUCCESSFUL_EDIT=FORBIDDEN`

### Gate C — Server activation

Only after Gate B evidence is accepted may a reviewed source change set the dedicated server activation constant to true.

The web production capability must remain false during this gate.

After exact-head review and explicit owner deploy authorization, deploy only the reviewed Existing-DRAFT function/server scope.

Then perform production boundary verification before any web exposure.

`SERVER_TRUE_WEB_FALSE=REQUIRED_INTERMEDIATE_STATE`

### Gate D — Controlled authenticated canary

Before enabling the production web editor, prove one authenticated successful edit against a separately reviewed **disposable/dedicated test DRAFT fixture** or an equivalently non-destructive controlled fixture.

The canary must prove all of:

- approved production project and app origin;
- valid App Check and Firebase authentication;
- active Head Coach authority;
- exact `{seconds,nanoseconds}` concurrency token;
- exact fixed hierarchy cardinality before and after;
- no new plan/session/block document is created;
- no document is deleted;
- creation audit is unchanged;
- update audit is coherent;
- a stale-token replay returns conflict and performs zero writes;
- complete read-back equals the intended edit.

Do not use a real team training plan as an improvised smoke fixture.

Successful production mutation is a separate controlled action and requires explicit owner authorization tied to the exact server-active SHA and fixture plan.

### Gate E — Web activation

Only after Gate D evidence is independently accepted may a reviewed source change set:

`PRODUCTION_WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_WRITER_VERIFIED = true`

This source change must not alter the generic Function-backed Pro Club capability, Fresh-DRAFT capability, Saved-DRAFT read capability, Academy behavior, or unrelated Pro Club modules.

After merge, Hosting deployment remains a separate explicit owner-authorized action. Production UI exposure is not complete until the exact reviewed build is deployed and verified.

## Rollback contract

Server and web rollback remain independently source-controlled.

If server evidence becomes invalid or a safety issue is found:

1. set the web production writer evidence false first if it is true;
2. deploy the reviewed Hosting rollback only with explicit authorization;
3. set the server production edit gate false;
4. deploy the reviewed function rollback only with explicit authorization.

Do not use environment variables or console-only toggles as a substitute for reviewed source rollback.

## Forbidden shortcuts

The following are not authorized:

- flipping server and web production gates in one unverified step;
- enabling the web editor before server production verification;
- enabling the generic Function-backed Pro Club capability;
- bypassing App Check or Firebase Auth;
- accepting millisecond/ISO optimistic concurrency in place of exact Firestore seconds/nanoseconds;
- editing a DRAFT owned by another actor;
- create/delete/append/reorder hierarchy mutation;
- using production data as an ad-hoc smoke fixture;
- force push, rebase, reset, or bypass of exact-head gates;
- deployment from a dirty worktree or drifted SHA;
- placing tokens, credentials, site keys, or private material in Git, logs, PR text, or evidence docs.

## Five-question security gate

The exact contract HEAD must answer:

1. INPUT — exact plan ID, canonical draft input, and exact Firestore concurrency token remain required; no unsafe free-form actor authority.
2. AUTHORIZATION — only active Head Coach editing own schema-v2 DRAFT; technical governance and membership remain transactionally revalidated.
3. SECRET — no secret/token/key/credential material in source or evidence.
4. DEPENDENCY — `N/A (NO CHANGE)` for this docs/tests-only slice.
5. FAILURE_BEHAVIOR — production remains fail-closed; stale/structural conflict is zero-write; no deployment or production mutation occurs in this slice.

Any `FAIL`, `UNKNOWN`, or `NOT TESTED` means `MERGE=STOP`.

## Safety boundary for this slice

- `src/**`: unchanged
- `functions/**`: unchanged
- `firestore.rules`: unchanged
- `firestore.indexes.json`: unchanged
- `firebase.json`: unchanged
- `firebase.spark.json`: unchanged
- dependency manifests / lockfiles: unchanged
- production deployment: NO
- production callable invocation: NO
- production Firestore write: NO
- billing change: NO
- reset: NO
- force push: NO
- rebase: NO

`SERVER_PRODUCTION_EDIT_GATE=CLOSED`
`WEB_PRODUCTION_EDIT_GATE=CLOSED`
`PRODUCTION_DEPLOY_AUTHORIZATION=NOT_GRANTED`
`PRODUCTION_DATA_WRITE_AUTHORIZATION=NOT_GRANTED`

## Next slice after acceptance

After exact-head contract verification and independent review PASS, proceed only to **Existing-DRAFT Production Activation V1 — Gate B disabled-writer deploy-candidate/readiness**. Do not flip either production activation constant in the contract slice.
