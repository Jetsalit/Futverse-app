# FutVerse Pro Club Onboarding Approval Proof Contract V1

## 1. Purpose

This remediation contract closes an enforceability gap discovered before Slice 2B Firestore Rules implementation.

The approved Slice 2A contract requires atomic creation of:

- an approved onboarding claim;
- a canonical Pro Club Membership;
- a canonical Pro Club Staff assignment;
- consumed invitation evidence.

However, the canonical Membership and Staff payloads are intentionally exact and identity-free:

`proClubs/{clubId}/members/{uid}`

```text
{
  authorizationRole: "MEMBER",
  status: "ACTIVE"
}
```

`proClubs/{clubId}/staff/{uid}`

```text
{
  staffRole: <approved role>,
  status: "ACTIVE"
}
```

Because those documents contain no `claimId` or `inviteCode`, Firestore Rules cannot deterministically resolve a random invite-derived claim document from only `clubId + uid` while validating a Membership or Staff create.

This contract introduces a deterministic non-authority approval proof so Rules can verify the atomic relationship without weakening canonical runtime payloads.

## 2. Exact baseline and scope

- base branch: `main`
- base commit: `f95793672aabef9b976b3ce6ab5b1f0cef61239f`
- branch: `fix/pro-club-onboarding-approval-proof-contract-v1`
- predecessor contract: `docs/PRO_CLUB_INVITE_CLAIM_MEMBERSHIP_RULES_DATA_CONTRACT_V1.md`

This remediation may add exactly:

- `docs/PRO_CLUB_ONBOARDING_APPROVAL_PROOF_CONTRACT_V1.md`
- `tests/proClubOnboardingApprovalProofContractV1.test.ts`

It does not modify `firestore.rules`, production application source, UI, routing, runtime adapters, Membership types, Staff types, or deployment behavior.

## 3. New deterministic approval proof path

The remediation adds one future non-authoritative path:

`proClubs/{clubId}/onboardingApprovals/{uid}`

The document ID is the exact claimant UID.

This path is not tenant authority and is never an authorization source for runtime workspace access.

Canonical tenant authority remains only:

`proClubs/{clubId}/members/{uid}`

## 4. Approval proof schema

`proClubs/{clubId}/onboardingApprovals/{uid}` must contain exactly:

- `schemaVersion: 1`
- `userId`
- `clubId`
- `claimId`
- `inviteCode`
- `membershipAuthorizationRole: "MEMBER"`
- `staffRole`
- `status: "APPROVED"`
- `approvedAt`
- `approvedBy`

The proof identity must satisfy:

- document ID == `uid`;
- `userId == uid`;
- payload `clubId == path clubId`;
- `claimId` equals the exact approved onboarding claim document ID;
- `inviteCode` equals the exact consumed invite document ID;
- `membershipAuthorizationRole == "MEMBER"`;
- `staffRole` equals the approved claim and consumed invite staff role;
- `approvedAt == request.time`;
- `approvedBy == request.auth.uid`.

No additional fields are allowed in V1.

## 5. Approval proof is not authority

`APPROVAL PROOF != TENANT AUTHORITY`

The approval proof cannot authorize:

- reading a Pro Club;
- selecting a Pro Club runtime;
- entering a workspace;
- acting as `OWNER`, `ADMIN`, or `MEMBER`;
- deriving a football staff capability.

Only a valid active canonical Membership can provide tenant authority.

## 6. Atomic approval becomes five-way

Slice 2B approval must be one atomic Firestore transaction/batch that makes all five results true together:

1. claim transitions `PENDING -> APPROVED`;
2. deterministic approval proof is created at `proClubs/{clubId}/onboardingApprovals/{userId}`;
3. exact Membership is created at `proClubs/{clubId}/members/{userId}`;
4. exact Staff assignment is created at `proClubs/{clubId}/staff/{userId}`;
5. exact invite transitions `ACTIVE -> CONSUMED` and records the same `claimId`.

No partial approval is valid.

## 7. Why this proof is required

For Membership creation, Rules know only `clubId` and `uid` from the path plus the exact Membership payload. They do not know which random invitation/claim should be trusted.

The deterministic approval proof at `onboardingApprovals/{uid}` gives Rules a path that can be resolved directly from the Membership/Staff path identity.

Rules can then require `existsAfter()` and `getAfter()` on the approval proof and validate its referenced `claimId` and `inviteCode` against the matching post-write approved claim and consumed invite.

This closes the bypass where a canonical `OWNER` or `ADMIN` could otherwise create `{ authorizationRole: "MEMBER", status: "ACTIVE" }` without approved onboarding evidence.

## 8. Membership creation proof

Future Rules must reject Membership creation unless all are true in the same atomic write:

- path UID equals approval proof `userId`;
- path club equals approval proof `clubId`;
- Membership payload is exactly `{ authorizationRole: "MEMBER", status: "ACTIVE" }`;
- approval proof status is `APPROVED`;
- approval proof role is `MEMBER`;
- referenced claim is post-write `APPROVED`;
- referenced claim matches exact UID, club, invite, role, and staff role;
- referenced invite is post-write `CONSUMED`;
- referenced invite matches exact UID, club, claim, role, and staff role;
- reviewer is canonical active `OWNER`/`ADMIN` for that exact Pro Club.

## 9. Staff creation proof

Future Rules must reject Staff creation unless all are true in the same atomic write:

- matching active Membership exists after the write;
- deterministic approval proof exists after the write;
- Staff payload is exactly `{ staffRole: <approved role>, status: "ACTIVE" }`;
- Staff role equals approval proof, approved claim, and consumed invite staff role;
- UID and club identities agree across every path and payload.

A Staff document still cannot provide tenant authority by itself.

## 10. Claim approval proof

The claim transition to `APPROVED` must require the matching deterministic approval proof to exist after the same write and to reference the same `claimId` and invite.

The claim cannot be approved if the approval proof is absent, mismatched, forged, or already existed independently from another approval lifecycle.

## 11. Invite consumption proof

The invite transition `ACTIVE -> CONSUMED` must require the matching deterministic approval proof to exist after the same atomic write.

The consumed invite must record the same `claimId` referenced by the approval proof.

## 12. Creation-only lifecycle

V1 onboarding approval proof is creation-only.

Client update and delete are denied.

This preserves an immutable audit relationship between the approval event and the authority-bearing Membership/Staff creation.

A later Membership lifecycle change does not rewrite this proof.

## 13. Read boundary

The claimant may `get` only their own exact approval proof for the exact Pro Club path.

A canonical active Pro Club `OWNER`/`ADMIN` may `get` an exact approval proof when needed for reviewed administration.

Listing `onboardingApprovals` is not authorized in V1.

## 14. No runtime coupling

The current Pro Club runtime adapters must remain unchanged.

They continue reading only:

- `proClubs/{clubId}`;
- `proClubs/{clubId}/members/{uid}`;
- `proClubs/{clubId}/staff/{uid}`.

The approval proof is onboarding audit/evidence only and must not be added to runtime authorization resolution.

## 15. Academy preservation

This remediation must not modify:

- Academy invite or claim paths;
- Academy Membership schemas;
- Academy Firestore Rules;
- `JoinAcademy`;
- `AcademyProvider`;
- Academy runtime or Match authority.

## 16. Required Slice 2B emulator tests

Slice 2B must additionally prove:

1. Membership create without approval proof denied;
2. Staff create without approval proof denied;
3. approved claim without approval proof denied;
4. invite consumption without approval proof denied;
5. approval proof with wrong UID denied;
6. approval proof with wrong club denied;
7. approval proof with wrong claim denied;
8. approval proof with wrong invite denied;
9. approval proof with role other than `MEMBER` denied;
10. approval proof with mismatched staff role denied;
11. approval proof cannot be created by `MEMBER`;
12. approval proof cannot be created by staff-only actor;
13. approval proof cannot be created by unrelated Pro Club admin;
14. approval proof cannot authorize club read without Membership;
15. approval proof update denied;
16. approval proof delete denied;
17. approval proof list denied;
18. exact five-way atomic approval succeeds;
19. partial four-way approval without proof denied;
20. current runtime adapter tests remain green.

## 17. Succession

Required order becomes:

1. Slice 2A — Rules/Data Contract Freeze — completed.
2. Slice 2A.1 — this Approval Proof remediation contract.
3. Slice 2B — Firestore Rules implementation + dedicated emulator tests.
4. Slice 3 — Pro Club Onboarding Service.
5. Slice 4 — Registration Organization Intent / Routing.
6. Slice 5 — Organization-aware Onboarding UI.
7. Slice 6 — Pro Club Workspace Entry.

No production Rule write path is authorized until this remediation contract passes independent review.
