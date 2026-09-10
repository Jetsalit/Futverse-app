# Pro Club SuperAdmin Support Session + Audit V1 — Contract Freeze

## Status

`PHASE=CONTRACT_AUDIT_ONLY`

`MODE=PRO_CLUB_SUPERADMIN_SUPPORT_V1`

`SCOPE=DOCS_TESTS_ONLY`

`RUNTIME_IMPLEMENTATION=NOT_AUTHORIZED`

`AUDIT_PERSISTENCE_IMPLEMENTATION=NOT_AUTHORIZED`

`FIRESTORE_RULES_CHANGE=NOT_AUTHORIZED`

`FUNCTIONS_CHANGE=NOT_AUTHORIZED`

`UI_CHANGE=NOT_AUTHORIZED`

`PRODUCTION_DEPLOY_AUTHORIZATION=NOT_GRANTED`

`PRODUCTION_DATA_READ_AUTHORIZATION=NOT_GRANTED`

`PRODUCTION_DATA_WRITE_AUTHORIZATION=NOT_GRANTED`

`MERGE_GATE=BLOCKED_BY_HEAD_COACH_PHASE_5E_2`

`MERGE_AUTHORIZATION=NOT_GRANTED`

This slice freezes the support-session and audit evidence contract that may be implemented later on top of Pro Club SuperAdmin Support Read Mode V1. It creates no support-session runtime, no audit collection, no trusted writer, no UI entry/exit flow, no Firestore Rule change, and no production data access.

## Exact stacked baseline

- Repository: `Jetsalit/Futverse-app`
- Parent PR: `#131` — Pro Club SuperAdmin Support Read Mode V1 foundation
- Accepted parent HEAD: `c4305442ce19c7fe470eb50975e3a252618df2aa`
- Parent PR state when this branch was created: OPEN / DRAFT / NOT MERGED
- Feature branch: `feat/pro-club-superadmin-support-session-audit-v1-contract`
- Branch created directly from the exact accepted parent HEAD above.

This contract also depends on the earlier Pro Club SuperAdmin Support Mode V1 contract in PR #125. Neither this contract nor the Support Read foundation may be merged while the Head Coach Phase 5E-2 merge gate remains active.

## Purpose

Support Read Mode V1 needs attributable evidence without converting support activity into tenant or football authority. The future audit mechanism exists to answer operational questions such as:

- which real SuperAdmin actor opened support for which exact club;
- whether an optional exact support subject was selected;
- which allowlisted support-read surface was requested;
- whether the read attempt succeeded or failed closed;
- when the support session began and ended according to trusted time.

The audit trail is evidence only. It is never a permission grant, membership substitute, staff-role substitute, Technical Authority substitute, or source of tenant identity.

## Non-authority invariant

`AUDIT_AS_AUTHORITY=FORBIDDEN`

`SESSION_AS_AUTHORITY=FORBIDDEN`

`TENANT_MEMBERSHIP_AUTHORITY=NOT_GRANTED`

`FOOTBALL_STAFF_AUTHORITY=NOT_GRANTED`

`TECHNICAL_AUTHORITY=NOT_GRANTED`

`DOMAIN_MUTATION_AUTHORITY=NONE`

A support session or audit record must never:

- create or imply OWNER / ADMIN / MEMBER membership;
- create or imply a Pro Club staff role;
- make the SuperAdmin actor a Technical Director or Head Coach candidate;
- bypass canonical account-status checks;
- bypass Firestore Rules;
- authorize a read merely because a prior audit/session record exists;
- authorize create, update, delete, submit, approve, publish, archive, rename, provision, invite, claim, assign, revoke, reconcile, or any work-on-behalf football operation.

Every actual support read remains governed by the real authenticated actor, canonical ACTIVE SUPERADMIN account status, exact target, the Support Read adapter contract, and Firestore Rules.

## Actor identity binding

`ACTOR_IDENTITY_SOURCE=REAL_FIREBASE_AUTH_UID_PLUS_CANONICAL_ACTIVE_SUPERADMIN_ACCOUNT`

The future trusted audit writer must derive the actor identity from the real authenticated request context and canonical account evidence. Actor identity must never be accepted from an arbitrary client payload.

Required invariants:

1. `actorUid` is the real authenticated Firebase UID.
2. The canonical `users/{actorUid}` account is explicitly ACTIVE.
3. The canonical account role is exactly `SUPERADMIN`.
4. `actorUid` remains immutable for each support-session audit chain.
5. `currentUser`, `supportPresentation`, display role, target member, target staff assignment, or client-provided actor fields cannot replace `actorUid`.
6. Firebase Auth identity swapping is forbidden.

`CURRENT_USER_IMPERSONATION=FORBIDDEN`

`SUPPORT_PRESENTATION_AS_PRO_CLUB_AUTHORITY=FORBIDDEN`

`FIREBASE_AUTH_IDENTITY_SWAP=FORBIDDEN`

## Exact target binding

`TARGET_BINDING=EXACT_CLUB_ID`

`GENERIC_PRO_CLUB_DISCOVERY=FORBIDDEN`

`CROSS_TENANT_FALLBACK=FORBIDDEN`

Every support session must bind to exactly one canonical `clubId`. An optional `subjectUid` may bind a subject-specific diagnostic view but must also be a canonical exact document identifier.

The future implementation must fail closed when `clubId` or `subjectUid` is malformed, missing where required, inaccessible, or inconsistent with the selected support target.

Switching from one club to another must never silently reuse the previous support context.

`TARGET_SWITCH_REQUIRES_PREVIOUS_INVALIDATION=YES`

Before resolving a new club target, the previous target must be invalidated/closed in local support state. A new support target creates a new support-session identity; it must not mutate the historical target of an earlier audit chain.

## Future support-session identity

The later trusted runtime may introduce a server-generated opaque `sessionId` for correlation.

`SESSION_ID_SOURCE=TRUSTED_SERVER_GENERATED`

The client must not be allowed to choose an authoritative session ID that collides with or rewrites a prior session.

A session ID is correlation metadata only. Possessing or replaying a `sessionId` does not grant support-read permission.

## Future audit event model

The implementation phase may persist append-only events using a trusted control-plane writer. The minimum event vocabulary is frozen as:

- `SESSION_STARTED`
- `READ_ATTEMPTED`
- `SESSION_ENDED`

A later implementation may add a narrowly reviewed fail-closed lifecycle event only if contract tests and independent review are updated first. It must not silently add mutation or authorization events.

`AUDIT_EVENT_MODEL=APPEND_ONLY`

Existing audit events must never be updated in place or deleted through the support runtime.

## Minimum audit evidence fields

Every future persisted audit event must contain, at minimum:

- `schemaVersion` — exact supported audit schema version;
- `eventId` — trusted server-generated immutable event identifier;
- `sessionId` — trusted correlation identifier;
- `eventType` — allowlisted audit event type;
- `mode` — exactly `PRO_CLUB_SUPERADMIN_SUPPORT_V1`;
- `actorUid` — immutable real authenticated SuperAdmin UID;
- `clubId` — immutable exact support target club ID;
- `subjectUid` — exact optional subject UID or explicit null;
- `readSurface` — allowlisted support-read surface or explicit null for non-read lifecycle events;
- `outcome` — allowlisted result classification;
- `reasonCode` — stable fail-closed reason or explicit null;
- `occurredAt` — trusted server timestamp.

`AUDIT_SCHEMA_VERSION=1`

Client-supplied timestamps are not authoritative.

`AUDIT_TIME_SOURCE=TRUSTED_SERVER_TIME`

## Read-surface allowlist

The audit contract may describe only surfaces already allowed by the Support Read V1 foundation. The initial logical vocabulary is:

- `CLUB`
- `SUBJECT_MEMBERSHIP`
- `SUBJECT_STAFF`
- `TECHNICAL_GOVERNANCE`
- `WEEKLY_TRAINING_PLAN`
- `WEEKLY_TRAINING_SESSION`
- `WEEKLY_TRAINING_BLOCK`

`READ_SURFACE_DEFAULT_DENY=YES`

Unknown read surfaces are rejected rather than coerced into a generic or broader category. This contract does not expand the Firestore read envelope frozen in PR #131.

## Outcome and fail-closed evidence

Audit outcome values are evidence classifications, not authorization decisions. The minimum vocabulary is:

- `SUCCESS`
- `MISSING`
- `PERMISSION_DENIED`
- `INVALID_TARGET`
- `INVALID_DATA`
- `UNAUTHORIZED`
- `UNEXPECTED_ERROR`

`OUTCOME_DEFAULT_DENY=YES`

The later implementation must preserve meaningful fail-closed distinctions rather than silently converting denied/invalid states to success.

## Data minimization

`AUDIT_PAYLOAD_SNAPSHOT=FORBIDDEN`

`AUDIT_SECRET_CAPTURE=FORBIDDEN`

`AUDIT_FREEFORM_DATA_DUMP=FORBIDDEN`

The support audit must not copy full Pro Club documents, Weekly Training content, private notes, tokens, credentials, secrets, or arbitrary payload snapshots into audit evidence.

The audit should record identifiers, allowlisted surface classification, outcome, reason code, and trusted timing needed for attribution. Sensitive business content remains in its authoritative domain record and is not duplicated into the support audit simply for convenience.

## Trusted write boundary for later implementation

This contract does not create the writer, but freezes these requirements for the later implementation:

- the client must not directly create, update, or delete authoritative support audit records;
- the trusted writer must derive actor identity from authenticated context;
- the trusted writer must validate the exact club target and optional subject target;
- the trusted writer must use trusted server time;
- persisted events are append-only;
- the writer must not return tenant/staff/technical authority as a side effect;
- audit persistence failure must not be reinterpreted as a successful authorized mutation;
- any policy deciding whether a support read may proceed remains separate from the audit record itself.

`CLIENT_DIRECT_AUDIT_WRITE=FORBIDDEN`

`TRUSTED_APPEND_ONLY_WRITER_REQUIRED=YES`

## Session end / invalidation semantics

The future runtime must invalidate local support-session state on at least:

- explicit support exit;
- sign-out;
- loss of authenticated actor identity;
- actor account becoming non-ACTIVE;
- actor role no longer being SUPERADMIN;
- target switch;
- unrecoverable target-validation failure.

The later runtime may define refresh/recovery mechanics, but it must never recover by impersonating a target user or by falling back to another club.

A `SESSION_ENDED` audit event, when persistence is available, records evidence of closure. Its presence is not required as an authorization revocation primitive; authorization must already fail closed from current trusted identity/target checks.

## Relationship to Academy support

Academy Support / Work As behavior remains unchanged and is outside this slice.

`ACADEMY_SUPPORT_MODE_REUSE=FORBIDDEN`

The future Pro Club support-session implementation must not obtain authority by reusing Academy `supportPresentation` identity substitution. Shared UI presentation primitives may only be considered later if they remain authority-neutral and pass a separate architecture review.

## Protected architecture

This contract must preserve all current behavior in:

- `firestore.rules`
- `src/**`
- `functions/**`
- `firestore.indexes.json`
- `firebase.json`
- `firebase.spark.json`
- `package.json`
- Academy Support / Work As
- Pro Club onboarding / provisioning / rename
- Pro Club Technical Governance
- Pro Club Weekly Training
- Head Coach Phase 5E-2 work

In particular, this slice must not change the Support Read V1 rule envelope or `src/lib/firestore/proClubSupportReadAdapter.ts`.

## Exact changed-file scope

Exactly two new files are authorized in this slice:

1. `docs/PRO_CLUB_SUPERADMIN_SUPPORT_SESSION_AUDIT_V1_CONTRACT_FREEZE.md`
2. `tests/proClubSuperAdminSupportSessionAuditV1Contract.test.ts`

No other file is authorized to change in the final product diff for this slice.

## Acceptance gates

Before this contract is considered accepted:

1. Exact ancestry must prove the branch descends directly from accepted parent HEAD `c4305442ce19c7fe470eb50975e3a252618df2aa` with no behind commits.
2. Final changed-file scope must be exactly the two new docs/tests files above.
3. Contract tests must pass.
4. Existing Pro Club Support Mode V1 contract tests must continue to pass.
5. Existing Pro Club Support Read adapter unit tests must continue to pass.
6. `git diff --check` must pass.
7. TypeScript must pass.
8. Production build must pass.
9. Independent exact-head review must report no blocking P0/P1/P2 finding.
10. No deploy, production HTTP call, production Firestore read/write, billing change, reset, force push, or merge is authorized by this acceptance process.

## Merge policy

`READY_FOR_INDEPENDENT_REVIEW_AFTER_ACCEPTANCE=YES`

`MERGE_GATE=BLOCKED_BY_HEAD_COACH_PHASE_5E_2`

`MERGE_AUTHORIZATION=NOT_GRANTED`

Even after acceptance and independent review pass, this PR must remain unmerged until Head Coach Phase 5E-2 is confirmed complete and the stacked parent chain receives a fresh exact-head pre-merge audit.

## Required later slices

This contract intentionally stops before runtime. Later work must remain separately reviewed, for example:

1. trusted append-only audit persistence contract/service;
2. support-session pure state machine and entry/exit contract;
3. UI integration using the real actor identity without impersonation;
4. production-read/deploy activation gates;
5. only after those, a separately contracted Controlled Work-As V2 if FutVerse chooses to enable support mutations.

Nothing in this document authorizes those later slices automatically.
