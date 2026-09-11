# FutVerse Pro Club SuperAdmin Onboarding Control V1 — Contract Freeze

## 1. Purpose

This document freezes the architecture and security contract for a future Spark-native Pro Club SuperAdmin onboarding control path.

The product requirement is that an ACTIVE FutVerse SUPERADMIN may, from the central control plane:

- issue a Pro Club staff invitation for an existing FutVerse account;
- review a pending Pro Club staff onboarding claim;
- approve or reject that claim;

without first becoming OWNER, ADMIN, MEMBER, or staff of the target Pro Club.

This is a control-plane authority. It is not tenant membership and must never be persisted as tenant membership merely to make the action work.

This freeze is preservation-safe and changes no production Rules, runtime source, UI, deployment configuration, billing, Functions exposure, or production data.

## 2. Baseline

- repository: `Jetsalit/Futverse-app`
- base branch: `main`
- base commit: `a983681bc89e93eb8759f583158d314ed772fb7d`
- branch: `feat/pro-club-superadmin-onboarding-control-v1-contract`

The current baseline intentionally keeps Pro Club invite/review authority tenant-scoped to canonical active OWNER/ADMIN membership. The future implementation defined here must be introduced as an explicit, separately tested SuperAdmin control-plane authority rather than by weakening the tenant authority model.

## 3. Governing invariants

The following invariants are mandatory:

`SUPERADMIN CONTROL AUTHORITY != PRO CLUB MEMBERSHIP AUTHORITY`

`SUPERADMIN CONTROL AUTHORITY != FOOTBALL STAFF ROLE`

`SUPPORT PRESENTATION != SUPERADMIN WRITE AUTHORITY`

`PRESENTED USER != AUTHENTICATED ACTOR`

`INVITATION TARGET UID != CALLER-SUPPLIED EMAIL LOOKUP AUTHORITY`

`APPROVAL MUST REMAIN ATOMIC`

`SUPERADMIN CONTROL WRITE + AUDIT = SAME ATOMIC COMMIT`

`SUPERADMIN ACTIONS MUST BE AUDITABLE`

`ACADEMY AUTHORITY MUST REMAIN UNCHANGED`

`SPARK PRODUCTION MUST NOT REQUIRE CLOUD FUNCTIONS FOR UID-BASED INVITATION ISSUANCE`

## 4. Authority sources

Two independent authority paths may exist after implementation.

### 4.1 Tenant reviewer path

Existing canonical Pro Club reviewer authority remains valid:

`proClubs/{clubId}/members/{request.auth.uid}`

with:

- `authorizationRole in ["OWNER", "ADMIN"]`;
- `status == "ACTIVE"`;
- target Pro Club status `ACTIVE`.

### 4.2 SuperAdmin control-plane path

A SuperAdmin control action is authorized only when the authenticated actor's canonical user document proves:

- `users/{request.auth.uid}.role == "SUPERADMIN"`;
- account status is ACTIVE under the existing canonical active-account policy;
- the actor is the real authenticated user, not support presentation or a presented/current user identity;
- the target Pro Club exists and is ACTIVE.

The implementation must never satisfy this path by creating a Pro Club membership for the SuperAdmin.

## 5. Spark-native invitation issuance

The production Spark path may issue an invitation by exact existing FutVerse Account Reference / UID.

Required input:

- exact `clubId`;
- exact `targetUid`;
- exact allowed Pro Club `staffRole`.

The Spark-native path must not require email-to-UID discovery in the browser.

The existing server-backed email candidate-resolution path remains fail-closed in Spark production. This contract does not authorize enabling `resolveProClubStaffCandidateV1`, Cloud Functions, billing, server rewrites, or browser user-directory search.

The target UID must already correspond to an existing canonical FutVerse user document.

## 6. Invitation authority ceiling

A SuperAdmin-issued public staff onboarding invitation may create only:

- `membershipAuthorizationRole: "MEMBER"`;
- one allowed Pro Club football `staffRole`.

It must never issue OWNER or ADMIN tenant membership authority.

Allowed football staff roles remain the canonical role set already defined by Pro Club Staff Management V1, including `HEAD_COACH`.

## 7. Invitation schema and lifecycle

The existing V1 invitation registry remains canonical:

`proClubInvites/{inviteCode}`

The existing invite identity, role fields, ACTIVE / CONSUMED / REVOKED lifecycle, expiration rules, deterministic claim relationship, and replay protection must remain unchanged unless a later reviewed contract explicitly changes them.

A SuperAdmin-issued invite must remain targeted to one exact `targetUid`.

## 8. Claimant boundary

The invited user must continue to:

1. authenticate as their own account;
2. present the exact invitation code;
3. pass the exact `targetUid == request.auth.uid` check;
4. create only their own deterministic PENDING claim.

SuperAdmin authority must not allow a claimant to self-approve, retarget an invite, alter role fields, or create another person's claim.

## 9. Review and approval

A pending claim may be reviewed by either:

- the existing canonical active OWNER/ADMIN reviewer for that exact Pro Club; or
- an ACTIVE authenticated SUPERADMIN through the explicit control-plane path.

Approval must remain one atomic operation producing the same canonical result set:

1. claim `PENDING -> APPROVED`;
2. approval proof created;
3. `proClubs/{clubId}/members/{userId}` created as `MEMBER / ACTIVE`;
4. `proClubs/{clubId}/staff/{userId}` created with the exact invited staff role and `ACTIVE`;
5. invitation `ACTIVE -> CONSUMED` with the same claim identity;
6. when the approver is SUPERADMIN, matching append-only SuperAdmin audit evidence is created in the same atomic commit.

Rejection must remain atomic and must revoke the invitation without creating Membership or Staff authority. When the rejecting actor is SUPERADMIN, matching append-only audit evidence must be created in that same atomic commit.

## 10. SuperAdmin audit requirement

Every successful SuperAdmin onboarding control write must leave durable append-only audit evidence.

The implementation slice must define one exact audit path and exact schema before writes are opened. At minimum the audit evidence must bind:

- schema version;
- action type (`INVITE_ISSUED`, `CLAIM_APPROVED`, or `CLAIM_REJECTED`);
- authenticated SuperAdmin UID;
- `clubId`;
- target user UID;
- invitation code and/or claim ID as applicable;
- staff role as applicable;
- server-authoritative timestamp;
- immutable action identity.

The client must not be able to forge the acting SuperAdmin UID or timestamp.

Audit documents must be append-only. Update and delete remain denied.

For every SuperAdmin authority-bearing action, the domain/authority write and matching audit write must succeed or fail together in one Firestore transaction/batch. A SuperAdmin invitation may not become ACTIVE without its matching `INVITE_ISSUED` audit evidence in the same commit. A SuperAdmin approval may not create Membership/Staff authority or consume an invitation without its matching `CLAIM_APPROVED` audit evidence in the same commit. A SuperAdmin rejection may not revoke an invitation without its matching `CLAIM_REJECTED` audit evidence in the same commit.

Rules must use same-commit evidence (`existsAfter` / `getAfter` where appropriate) so that missing, mismatched, forged, or separately written audit evidence causes the entire SuperAdmin control write to fail closed.

Forced commit failure, stale-state failure, or audit-write failure must leave neither the SuperAdmin domain/authority mutation nor the corresponding audit record partially committed.

## 11. Support presentation boundary

SuperAdmin support presentation must remain read/support-oriented and must not become a write-authority shortcut.

A control-plane write must bind to the actual authenticated SuperAdmin identity. Presented user, `currentUser`, impersonation state, URL state, local storage, cookies, or client-selected organization state must never authorize the write.

## 12. UI contract

The future SuperAdmin UI may expose a Pro Club onboarding control surface only to the actual ACTIVE SUPERADMIN.

For Spark-native invitation issuance the UI must use exact Account Reference / UID, not browser-side email lookup.

Minimum invitation controls:

- target Pro Club;
- target Account Reference / UID;
- staff role selector;
- create invitation action;
- resulting invitation code.

Minimum review controls:

- pending claimant identity snapshot;
- target Pro Club;
- staff role;
- invite/claim verification state;
- explicit approve/reject confirmation.

The UI must not grant authority by itself. Rules and repository/runtime checks remain authoritative.

## 13. Firestore Rules requirements

The implementation slice must prove at least:

1. inactive SuperAdmin cannot issue an invite;
2. normal USER cannot use the SuperAdmin path;
3. global ADMIN cannot use the SuperAdmin path unless separately authorized by existing tenant OWNER/ADMIN membership;
4. support presentation cannot create write authority;
5. ACTIVE SuperAdmin can issue a MEMBER-ceiling staff invite to an existing target UID;
6. SuperAdmin cannot issue OWNER or ADMIN membership authority;
7. invalid or nonexistent target UID is denied;
8. self-invite is denied unless a later contract explicitly permits it;
9. target user with existing membership in that club cannot receive a duplicate onboarding membership path;
10. wrong target UID cannot claim the invite;
11. claimant cannot self-approve;
12. ACTIVE SuperAdmin can approve a valid PENDING claim;
13. inactive SuperAdmin cannot approve;
14. approval without approval proof is denied;
15. approval without Membership creation is denied;
16. approval without Staff creation is denied;
17. approval without invitation consumption is denied;
18. exact atomic SuperAdmin approval succeeds;
19. exact atomic SuperAdmin rejection succeeds;
20. every successful SuperAdmin control action produces immutable audit evidence;
21. missing or forged audit evidence denies the SuperAdmin control write;
22. audit update/delete is denied;
23. SuperAdmin invite creation without same-commit `INVITE_ISSUED` audit is denied;
24. SuperAdmin approval without same-commit `CLAIM_APPROVED` audit is denied;
25. SuperAdmin rejection without same-commit `CLAIM_REJECTED` audit is denied;
26. mismatched audit actor, club, target, invite/claim identity, role, or timestamp is denied;
27. forced failure proves rollback of both the domain/authority mutation and audit evidence;
28. existing OWNER/ADMIN onboarding continues to pass;
29. existing claimant onboarding continues to pass;
30. Academy regression remains green;
31. production default-deny remains intact.

## 14. Runtime requirements

The implementation must not globally flip `FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE` to true in production.

Spark-native UID invitation issuance must be separated from function-backed email candidate resolution.

The existing server-backed candidate resolution may remain available in local/dev/trusted environments exactly as currently reviewed.

## 15. Required implementation succession

The required succession is:

1. Contract Freeze — this document and dedicated contract tests only.
2. Independent architecture/security review of exact HEAD.
3. Rules + audit data contract implementation with emulator tests.
4. Repository/runtime adapter implementation for explicit SuperAdmin control authority.
5. SuperAdmin UI wiring for Spark-native Account Reference / UID invitation and pending review.
6. Regression / build / TypeScript / production-boundary verification.
7. Independent exact-HEAD review.
8. Merge only after review approval.
9. Production deployment only after a separate explicit deployment authorization.
10. Production Head Coach pilot only after deployment verification.

## 16. Out of scope for this freeze

This freeze does not authorize:

- editing `firestore.rules`;
- editing production application source;
- enabling Cloud Functions in Spark production;
- changing Firebase billing;
- deploying Hosting, Rules, Functions, or indexes;
- invoking production callables;
- writing production data;
- changing Academy onboarding;
- changing Pro Club owner/admin membership semantics;
- merging this branch without independent review.

## 17. Acceptance gate

This contract slice passes only if independent review confirms that the future design:

- gives ACTIVE SUPERADMIN explicit central onboarding control authority;
- does not turn SuperAdmin into a tenant member;
- preserves MEMBER as the public onboarding membership ceiling;
- preserves exact-target invitation identity and replay safety;
- keeps claimant self-approval impossible;
- keeps approval/rejection atomic;
- requires append-only SuperAdmin audit evidence;
- requires every SuperAdmin control mutation and its audit evidence to succeed or fail in the same atomic commit;
- keeps support presentation from becoming write authority;
- keeps function-backed email lookup disabled in Spark production;
- preserves Academy behavior and production default-deny.
