# FutVerse Pro Club Invite / Claim / Membership Rules & Data Contract V1

## 1. Purpose

This document freezes the Rules and data contract for Pro Club Coach/Staff onboarding before any Pro Club client write path is opened.

It is a preservation-safe contract sub-slice. It does **not** modify `firestore.rules`, production application source, registration UI, routing, Organization Runtime, Academy onboarding, or deployment behavior.

Governing invariants:

`REGISTRATION INTENT != ACCOUNT AUTHORITY`

`INVITE != TENANT AUTHORITY`

`CLAIM != TENANT AUTHORITY`

`MEMBERSHIP AUTHORITY != FOOTBALL STAFF ROLE`

`STAFF DOCUMENT ALONE != TENANT AUTHORITY`

`PRESENTED USER != AUTHENTICATED ACTOR`

`APPROVAL MUST BE ATOMIC`

## 2. Exact baseline and scope

- base branch: `main`
- base commit: `c4c55e1aeaf30c797d845cffbfe80587a5472051`
- branch: `feat/pro-club-invite-claim-membership-rules-data-contract-v1`
- predecessor: `docs/PRO_CLUB_STAFF_ONBOARDING_V1_CONTRACT_FREEZE.md`
- frozen Firestore Rules blob: `78f16bc6f05e53adff514674cb7a2362c77e5ae9`
- frozen `src/types/ProClub.ts` blob: `e0b95171b4cc1c0c783d6ac010feb8d27a98f2ea`
- frozen `src/lib/proClubModel.ts` blob: `beabe59dd006084e8ac407de1f35d1684dfdd8f2`
- frozen `src/lib/firestore/proClubReadAdapter.ts` blob: `6a992bf2d89165c6b94c4d06899d658b470c82ef`
- frozen `src/lib/firestore/proClubOrganizationAdapter.ts` blob: `52bb75b33d00231bb5142640c51bb78c10b42cc6`

This contract sub-slice may add exactly:

- `docs/PRO_CLUB_INVITE_CLAIM_MEMBERSHIP_RULES_DATA_CONTRACT_V1.md`
- `tests/proClubInviteClaimMembershipRulesDataContractV1.test.ts`

No production file is changed by this freeze.

## 3. Existing authority shapes are preserved

Canonical Pro Club tenant authority remains:

`proClubs/{clubId}/members/{uid}`

with the exact runtime-compatible payload:

```text
{
  authorizationRole: "OWNER" | "ADMIN" | "MEMBER",
  status: "ACTIVE" | "INACTIVE" | "LEFT" | "REVOKED"
}
```

Canonical football staff assignment remains:

`proClubs/{clubId}/staff/{uid}`

with the exact runtime-compatible payload:

```text
{
  staffRole: "HEAD_COACH" | "ASSISTANT_COACH" | "FITNESS_COACH" |
             "ANALYST" | "PHYSIO" | "TEAM_MANAGER" | "STAFF",
  status: "ACTIVE" | "INACTIVE" | "LEFT"
}
```

V1 onboarding must not add audit fields to Membership or Staff documents because the current model validates those documents as exact shapes. Audit evidence belongs in invite and claim records.

## 4. Exact V1 Firestore paths

The V1 onboarding contract introduces only these future paths:

1. Invitation registry:

`proClubInvites/{inviteCode}`

2. Tenant-scoped claim:

`proClubs/{clubId}/onboardingClaims/{claimId}`

3. Existing canonical Membership:

`proClubs/{clubId}/members/{uid}`

4. Existing canonical Staff assignment:

`proClubs/{clubId}/staff/{uid}`

No other Pro Club onboarding collection is authorized by V1.

## 5. Invitation identity and format

`inviteCode` is both the invitation document ID and the stored `inviteCode` field.

Future Rules/service implementation must require:

- exact document ID equality;
- prefix `FUT-PC-`;
- uppercase alphanumeric secret suffix;
- a sufficiently long, service-generated random suffix;
- no slash, whitespace, or caller-supplied club identity embedded as authority;
- exact lookup only; no list/search endpoint.

Rules can validate format and length. Cryptographic randomness is a service responsibility and must be tested in the service slice.

## 6. Invitation schema

`proClubInvites/{inviteCode}` must contain exactly the V1 invitation fields appropriate to its lifecycle.

Immutable identity fields:

- `schemaVersion: 1`
- `inviteCode`
- `clubId`
- `targetUid`
- `membershipAuthorizationRole: "MEMBER"`
- `staffRole`
- `createdAt`
- `createdBy`
- `expiresAt`

Mutable lifecycle fields:

- `status: "ACTIVE" | "CONSUMED" | "REVOKED"`
- `updatedAt`
- `updatedBy`

`CONSUMED` additionally requires:

- `consumedAt`
- `consumedBy`
- `claimId`

`REVOKED` additionally requires:

- `revokedAt`
- `revokedBy`

Identity fields must never change after creation.

An `ACTIVE` invite must be unexpired at claim creation and approval time.

## 7. Invitation creation authority

Only the exact authenticated actor with a canonical active Membership at:

`proClubs/{clubId}/members/{request.auth.uid}`

whose `authorizationRole` is `OWNER` or `ADMIN` may create a V1 onboarding invite for that exact club.

Global `users.role`, support presentation, `currentUser`, registration intent, Academy Membership, or staff role must not satisfy reviewer/issuer authority.

Invite creation must also require:

- the Pro Club exists and is `ACTIVE`;
- `targetUid` is an existing user identity;
- `targetUid` has no existing Membership at that exact Pro Club;
- `membershipAuthorizationRole` is exactly `MEMBER`;
- `staffRole` is one allowed Pro Club staff role;
- timestamps are server-authoritative;
- `createdBy` and `updatedBy` are exactly `request.auth.uid`;
- `expiresAt` is in the future and bounded by the reviewed V1 maximum lifetime.

Public onboarding cannot issue `OWNER` or `ADMIN` Membership authority.

## 8. Invitation read boundary

A claimant may `get` an exact invitation only when:

- authenticated;
- the exact invite document exists;
- `targetUid == request.auth.uid`;
- status is `ACTIVE`;
- invite is not expired.

A canonical `OWNER`/`ADMIN` reviewer for the exact `clubId` may read invitations needed for management.

Collection listing or account-wide Pro Club discovery is not authorized for claimants.

## 9. Claim identity

Claims are tenant scoped:

`proClubs/{clubId}/onboardingClaims/{claimId}`

V1 deterministic identity is:

`claimId = userId + "_PRO_CLUB_" + inviteCode`

The claimant cannot choose a second claim identity for the same invite.

The claim path `clubId`, claim payload `clubId`, invite `clubId`, target `userId`, and authenticated `request.auth.uid` must all agree exactly.

## 10. Pending claim schema

A newly created claim must contain exactly:

- `schemaVersion: 1`
- `type: "PRO_CLUB_STAFF_JOIN"`
- `userId`
- `clubId`
- `inviteCode`
- `membershipAuthorizationRole: "MEMBER"`
- `staffRole`
- `status: "PENDING"`
- `createdAt`
- `updatedAt`

The values of `membershipAuthorizationRole` and `staffRole` are copied from canonical invite evidence, not selected as authority by the claimant.

A claimant may create only their own deterministic `PENDING` claim and only from a valid exact `ACTIVE` unexpired invite targeted to their UID.

## 11. Claim immutable identity

After claim creation these fields are immutable:

- `schemaVersion`
- `type`
- `userId`
- `clubId`
- `inviteCode`
- `membershipAuthorizationRole`
- `staffRole`
- `createdAt`

Only reviewed lifecycle fields may be added/changed during approval or rejection.

The claimant can never approve, reject, retarget, or elevate their own claim.

## 12. Reviewer authority

A claim reviewer is authorized only by canonical active Membership in the exact claim club with:

`authorizationRole in ["OWNER", "ADMIN"]`

`staffRole` never grants review authority.

Global `users.role == "SUPERADMIN"` is not a V1 onboarding reviewer proof. A future SuperAdmin bootstrap/repair lifecycle requires its own audited contract.

## 13. Approval must be atomic

A V1 approval is valid only as one atomic Firestore transaction/batch that makes all four canonical results true together:

1. claim transitions `PENDING -> APPROVED`;
2. exact Membership is created at `proClubs/{clubId}/members/{userId}`;
3. exact Staff assignment is created at `proClubs/{clubId}/staff/{userId}`;
4. exact invite transitions `ACTIVE -> CONSUMED` and records the same `claimId`.

No partial approval is valid.

Future Rules must use post-write evidence (`existsAfter` / `getAfter` where appropriate) so each authority-bearing write proves the matching approved claim and consumed invite in the same atomic operation.

## 14. Approved claim schema

Approval preserves all immutable claim identity and adds exactly:

- `status: "APPROVED"`
- `approvedAt`
- `approvedBy`
- `updatedAt`

`approvedBy` must equal the exact authenticated canonical reviewer.

The approved claim's role fields must remain exactly those from the invitation.

## 15. Membership creation ceiling

Public Pro Club Staff onboarding may create only:

```text
proClubs/{clubId}/members/{userId}
{
  authorizationRole: "MEMBER",
  status: "ACTIVE"
}
```

It must never create or transform a public claimant into `OWNER` or `ADMIN`.

Membership creation must fail unless the matching claim becomes `APPROVED` in the same atomic write and all identity evidence agrees.

V1 onboarding does not authorize Membership update or delete after creation. Membership lifecycle management is a separate reviewed contract.

## 16. Staff creation boundary

V1 approval may create exactly:

```text
proClubs/{clubId}/staff/{userId}
{
  staffRole: <exact role from invite and approved claim>,
  status: "ACTIVE"
}
```

Staff creation must fail without the matching active Membership creation and approved claim in the same transaction.

A staff document alone must never grant tenant access.

V1 onboarding does not authorize Staff update or delete after creation.

## 17. Invite consumption and replay safety

Approval must consume the exact invite in the same atomic write.

`CONSUMED` invite evidence must preserve immutable identity and add:

- `status: "CONSUMED"`
- `consumedAt == request.time`
- `consumedBy == request.auth.uid`
- `claimId == approved claim document ID`
- `updatedAt == request.time`
- `updatedBy == request.auth.uid`

A consumed or revoked invite cannot create another claim or another Membership.

The deterministic claim ID plus targeted UID plus consumed invite makes V1 replay-safe by construction.

## 18. Rejection boundary

A reviewer may reject only a `PENDING` claim for their exact Pro Club.

Rejection is terminal in V1 and must atomically:

- transition claim `PENDING -> REJECTED`;
- add `rejectedAt`, `rejectedBy`, `updatedAt`;
- transition the matching invite `ACTIVE -> REVOKED`;
- add `revokedAt`, `revokedBy`, `updatedAt`, `updatedBy`.

No Membership or Staff document may be created by a rejection transaction.

A future retry requires a newly issued invitation with a new invite code.

## 19. No arbitrary update path

The future Rules implementation must not expose generic writes to:

- `proClubs/{clubId}`;
- Membership role/status management beyond the exact onboarding create;
- Staff management beyond the exact onboarding create;
- claim identity;
- invite identity;
- any Academy path.

All unreviewed operations remain fail-closed.

## 20. No discovery shortcut

V1 forbids:

- listing/searching all Pro Clubs for onboarding;
- listing all `proClubInvites` as a claimant;
- collection-group claim discovery;
- account-wide membership scans;
- guessing `clubId` as authorization;
- persisting `activeProClubId` as authority;
- using local/session storage, cookies, IndexedDB, URL state, or client cache as authority.

## 21. Academy preservation

Slice 2 must not modify or weaken:

- `academy_invites`;
- `profile_claims`;
- Academy Membership Rules;
- `JoinAcademy`;
- `AcademyProvider`;
- Academy Match authority;
- existing Academy activation behavior.

Pro Club onboarding is not a renamed Academy flow.

## 22. Required Rules implementation tests

Before any Pro Club onboarding service is allowed, the dedicated Rules implementation sub-slice must run Firestore Emulator tests proving at least:

1. anonymous invite get denied;
2. wrong target UID invite get denied;
3. claimant cannot list invite registry;
4. MEMBER cannot issue invite;
5. staff role cannot issue invite without OWNER/ADMIN Membership;
6. canonical OWNER can issue exact MEMBER-role invite;
7. canonical ADMIN can issue exact MEMBER-role invite;
8. invite cannot grant OWNER;
9. invite cannot grant ADMIN;
10. expired invite cannot create claim;
11. revoked invite cannot create claim;
12. consumed invite cannot create claim;
13. wrong UID cannot create claim;
14. wrong club path cannot create claim;
15. nondeterministic claim ID denied;
16. claimant cannot alter role fields;
17. claimant cannot self-approve;
18. unrelated Pro Club admin cannot review;
19. MEMBER cannot approve;
20. staff-only actor cannot approve;
21. approval without Membership create denied;
22. approval without Staff create denied;
23. approval without invite consumption denied;
24. Membership create without approved claim denied;
25. Staff create without Membership denied;
26. public onboarding OWNER escalation denied;
27. public onboarding ADMIN escalation denied;
28. exact atomic approval succeeds;
29. replay of consumed invite denied;
30. second claim for same invite denied;
31. claim identity mutation denied;
32. invite identity mutation denied;
33. rejection without invite revocation denied;
34. exact atomic rejection succeeds;
35. Academy Rules regression suite remains green;
36. current Pro Club exact-read adapter behavior remains green;
37. production default deny remains intact.

## 23. Required implementation succession

This contract freeze is **Slice 2A** of the broader Rules/Data program because opening production Rules in the same unreviewed change would unnecessarily increase blast radius.

Required succession:

1. Slice 2A — this Rules/Data Contract Freeze (docs/tests only).
2. Slice 2B — Firestore Rules implementation + dedicated emulator tests only.
3. Slice 3 — Pro Club Onboarding Service implementation using the reviewed Rules contract.
4. Slice 4 — Registration Organization Intent / Routing.
5. Slice 5 — Organization-aware Onboarding UI.
6. Slice 6 — Pro Club Workspace Entry.

No Slice 3 service write is authorized until Slice 2B has passed independent review and emulator tests.

## 24. Review gate

This freeze must receive independent architecture/security review before merge.

Review must confirm:

- exact paths and schemas;
- role ceiling remains `MEMBER`;
- reviewer authority comes only from canonical Pro Club Membership;
- Membership/Staff runtime exact-shape compatibility is preserved;
- approval/rejection are atomic;
- replay protection is deterministic;
- Academy behavior is untouched;
- no UI, routing, service, deployment, or production Rule mutation is included in Slice 2A.

## 25. Staff Management V1 successor role-set amendment

The historical baseline above froze the legacy seven-role set.
Pro Club Staff Management V1 supersedes only the functional football
staff-role enumeration with the following canonical set of exactly 10 roles:

- `TECHNICAL_DIRECTOR`
- `MANAGER`
- `HEAD_COACH`
- `ASSISTANT_COACH`
- `GK_COACH`
- `FITNESS_COACH`
- `ANALYST`
- `PHYSIO`
- `TEAM_MANAGER`
- `STAFF`

MANAGER and TEAM_MANAGER are distinct.

This successor amendment does NOT change:

- authorization roles: OWNER / ADMIN / MEMBER
- membership authority semantics
- staffRole != authorizationRole
- lifecycle states
- exact-path authority
- default-deny behavior
- historical baseline SHA
- historical implementation scope
