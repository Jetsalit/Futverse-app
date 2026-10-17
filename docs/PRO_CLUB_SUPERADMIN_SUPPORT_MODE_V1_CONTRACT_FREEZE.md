# Pro Club SuperAdmin Support Mode V1 — Contract Freeze

## Status

`PHASE=CONTRACT_AUDIT_ONLY`

`MODE=PRO_CLUB_SUPERADMIN_SUPPORT_V1`

`SCOPE=DOCS_TESTS_ONLY`

`RUNTIME_IMPLEMENTATION=NOT_AUTHORIZED`

`PRODUCTION_DEPLOY_AUTHORIZATION=NOT_GRANTED`

`PRODUCTION_DATA_WRITE_AUTHORIZATION=NOT_GRANTED`

`MERGE_GATE=BLOCKED_BY_HEAD_COACH_PHASE_5E_2`

This slice freezes the first Pro Club-specific SuperAdmin support boundary. It does not enable a runtime support mode, does not change Firestore Rules, does not add a trusted service, does not alter UI routing, and does not authorize deployment or production data access.

## Exact baseline

- Repository: `Jetsalit/Futverse-app`
- Base branch: `main`
- Accepted baseline SHA: `a983681bc89e93eb8759f583158d314ed772fb7d`
- Feature branch: `feat/pro-club-superadmin-support-mode-v1-contract`
- Baseline status check observed before branch creation: success
- Baseline branch was created from the exact accepted SHA above.

The baseline already contains Pro Club onboarding, canonical Pro Club membership/staff authority, Technical Governance, the Head Coach operations shell, Weekly Training DRAFT persistence/read foundations, and production capability activation through PR #124. This contract must preserve those authority boundaries rather than reinterpret them.

## Why this is a separate Pro Club contract

The existing support-presentation / Academy support mechanisms are not the Pro Club authorization model. Pro Club has its own canonical membership roles, football staff roles, Technical Authority Resolver, onboarding claims, and operational data boundaries.

Therefore:

`ACADEMY_SUPPORT_MODE_REUSE=FORBIDDEN`

`CURRENT_USER_IMPERSONATION=FORBIDDEN`

`FIREBASE_AUTH_IDENTITY_SWAP=FORBIDDEN`

`SUPPORT_PRESENTATION_AS_PRO_CLUB_AUTHORITY=FORBIDDEN`

A Pro Club support implementation must not reuse `setSupportPresentedUser`, must not mutate `currentUser` into a tenant subject, and must not treat `supportPresentation` as Pro Club authority.

## Actor identity contract

The support actor is always the real authenticated FutVerse account.

To enter Pro Club SuperAdmin Support Mode, all of the following must eventually be verified by the trusted support boundary:

1. Firebase authenticated UID is present.
2. The exact canonical `users/{uid}` account exists.
3. The canonical account is explicitly ACTIVE.
4. The authoritative account role is exactly `SUPERADMIN`.
5. The support actor UID remains unchanged for the complete support session.

No target club, member, staff assignment, display role, support subject, or client payload may replace the actor UID.

`ACTOR_AUTHORITY_SOURCE=ACTIVE_CANONICAL_SUPERADMIN_ACCOUNT`

## Tenant and football authority separation

SuperAdmin platform-support authority is not Pro Club tenant membership authority and is not football staff authority.

`TENANT_MEMBERSHIP_AUTHORITY=NOT_GRANTED`

`FOOTBALL_STAFF_AUTHORITY=NOT_GRANTED`

`OWNER_AUTHORITY=NOT_GRANTED`

`ADMIN_AUTHORITY=NOT_GRANTED`

`HEAD_COACH_TECHNICAL_AUTHORITY=NOT_GRANTED`

`TECHNICAL_DIRECTOR_AUTHORITY=NOT_GRANTED`

Entering support mode must not create or synthesize an ACTIVE `OWNER`, `ADMIN`, or `MEMBER` membership and must not create or synthesize any Pro Club staff assignment.

A support actor must never become a candidate for `resolveProClubTechnicalAuthority`. Technical authority remains resolvable only from the canonical ACTIVE Technical Director / Head Coach structure frozen by the Pro Club Technical Governance contract.

## V1 capability boundary

V1 is a read-only support foundation with respect to Pro Club tenant/domain state.

`DOMAIN_MUTATION_AUTHORITY=NONE`

`WORK_ON_BEHALF_TECHNICAL_ACTIONS=FORBIDDEN`

The eventual V1 runtime may provide explicitly allowlisted diagnostic/read views needed to help a club, but it may not create, edit, submit, review, approve, publish, archive, delete, rename, provision, invite, claim, activate, deactivate, assign, revoke, or reconcile Pro Club domain records.

In particular, support mode may not perform any Head Coach or Technical Director football operation, including Weekly Training authoring or lifecycle actions.

Existing privileged control-plane operations such as provisioning or rename remain separate contracts/services. Merely being inside Support Mode must never authorize those actions.

## Exact-target / no-discovery boundary

Support Mode V1 must operate against an explicit exact support target.

- `clubId` must be a canonical exact document identifier.
- Any optional support subject UID must also be an exact canonical identifier.
- No generic Pro Club enumeration or hidden cross-tenant discovery is introduced by this contract.
- No fallback to another club is permitted when the selected club is missing, invalid, inactive, denied, or unreadable.
- Switching support targets must invalidate the previous target before resolving the next target.

`GENERIC_PRO_CLUB_DISCOVERY=FORBIDDEN`

`CROSS_TENANT_FALLBACK=FORBIDDEN`

## Read contract requirements for the later runtime slice

Any later runtime implementation must define a narrow allowlist of support-readable records before it is merged. Reads must be sufficient for support diagnostics but must not silently become business authority.

At minimum, every support read adapter must:

- bind the request to the authenticated SuperAdmin actor and exact target `clubId`;
- validate returned document identity and schema using canonical Pro Club validators where applicable;
- return explicit fail-closed states for missing, denied, invalid, or unexpected data;
- avoid using global `users.role` as a substitute for tenant Membership or football Staff authority;
- avoid exposing mutation methods through the same read adapter;
- avoid unrestricted collection scans or organization discovery;
- preserve the current account-status gate.

The exact read envelope is intentionally deferred to a separately reviewed implementation slice. This contract does not authorize new production reads by itself.

## Audit contract

Support activity must be attributable to the real SuperAdmin actor. A later runtime slice may add a dedicated append-only trusted control-plane support-session audit, but that audit mechanism must be separately reviewed and must not grant domain authority.

Any future support-session audit record must bind at least:

- immutable actor UID;
- exact target club ID;
- optional exact support subject UID, when a subject-specific view exists;
- support mode identifier `PRO_CLUB_SUPERADMIN_SUPPORT_V1`;
- support session start/end timestamps from trusted time;
- requested support capability/read surface;
- explicit outcome / fail-closed reason;
- schema version.

Client-only audit, mutable audit history, actor substitution, or audit records that can be used as authorization evidence are forbidden.

`AUDIT_AS_AUTHORITY=FORBIDDEN`

## Existing baseline guards that must remain intact in this slice

The contract depends on and preserves these current guards:

1. `src/components/pro-club/ProClubPortal.tsx` uses `actualUser` as the real UID and requires `currentUser?.uid === uid` and `!currentUser.supportPresentation` for the current normal Pro Club portal.
2. `src/contexts/OrganizationRuntimeContext.tsx` binds organization runtime ownership to `actualUser?.uid`.
3. `src/contexts/AuthContext.tsx` marks support presentation as client-only and does not make it Firestore authority.
4. `src/lib/proClubTechnicalGovernance.ts` limits technical authority to canonical ACTIVE `TECHNICAL_DIRECTOR` or `HEAD_COACH` candidates.
5. `src/lib/accountRolePolicy.ts` keeps `SUPERADMIN` / `DATA_ADMIN` privileged account roles separate from tenant membership roles.

This contract slice must not edit any of those files.

## Frozen changed-file scope

Exactly two new files are authorized for this slice:

1. `docs/PRO_CLUB_SUPERADMIN_SUPPORT_MODE_V1_CONTRACT_FREEZE.md`
2. `tests/proClubSuperAdminSupportModeV1Contract.test.ts`

No other file is authorized to change.

Explicitly frozen / out of scope:

- `src/**`
- `functions/**`
- `firestore.rules`
- `firestore.indexes.json`
- `firebase.json`
- `firebase.spark.json`
- `package.json`
- production environment/configuration
- Academy Support / Work As behavior
- Pro Club onboarding behavior
- Pro Club provisioning / rename behavior
- Technical Governance behavior
- Weekly Training runtime/persistence behavior
- Head Coach Phase 5E-2 files

## Acceptance gates

Before this contract branch can be considered reviewed:

1. Exact branch ancestry must prove the branch descends from baseline `a983681bc89e93eb8759f583158d314ed772fb7d`.
2. Changed-file scope must be exactly the two authorized docs/tests files.
3. Contract tests must pass.
4. `git diff --check` must pass.
5. Independent read-only review must report no blocking P0/P1/P2 finding on the exact branch head.
6. No production deploy, production HTTP call, production Firestore read/write, privileged live operation, or billing change may be performed as part of this slice.

Even after all contract-review gates pass, merge remains blocked while Head Coach Phase 5E-2 is unfinished.

`READY_FOR_INDEPENDENT_REVIEW=YES`

`MERGE_AUTHORIZATION=NOT_GRANTED`

## Required next-phase sequencing

After Head Coach Phase 5E-2 is complete and this contract is independently accepted, any Pro Club Support implementation must continue in small preservation-safe slices. A later runtime slice must separately freeze the exact read envelope, trusted authorization path, audit persistence boundary, UI entry/exit behavior, and regression tests before production activation is considered.
