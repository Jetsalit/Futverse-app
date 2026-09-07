# FutVerse Pro Club Provisioning Audit Verification V1 Contract Freeze

Status: FROZEN ARCHITECTURAL CONTRACT — DOCUMENTATION AND CONTRACT TESTS ONLY

## 1. Baseline and exact slice scope

- Repository: `Jetsalit/Futverse-app`
- Production source of truth: `main`
- Exact production baseline: `d2f2db5fe4fabd6d94ecb188338c5be23a400a1b`
- Branch: `feat/pro-club-provisioning-v1-audit-verification-contract`
- Governing predecessor: `docs/PRO_CLUB_PROVISIONING_V1_CONTRACT_FREEZE.md`
- Governing authority predecessor: `docs/PRO_CLUB_AUTHORITY_FOUNDATION_V1_FREEZE.md`

This contract slice may introduce or modify exactly two files:

1. `docs/PRO_CLUB_PROVISIONING_AUDIT_VERIFICATION_V1_CONTRACT_FREEZE.md`
2. `tests/proClubProvisioningAuditVerificationV1Contract.test.ts`

No production source, Firebase Function implementation, Firestore Rules, UI, routing, configuration, deployment artifact, or predecessor contract is modified by this slice.

This slice freezes **Provisioning Slice 3 — Audit Verification and Observability** only. It does not authorize production implementation, merge to `main`, or production deployment.

## 2. Purpose and non-goals

Provisioning V1 creates canonical durable evidence at:

`proClubProvisioningAudits/{provisioningId}`

Slice 3 defines a separate privileged read-only verifier that determines whether one exact provisioning audit still agrees with the canonical Pro Club and its sovereign initial OWNER membership.

Core invariants:

```text
VERIFY != REPAIR
READ AUTHORITY != WRITE AUTHORITY
OBSERVABILITY != TENANT AUTHORITY
```

The verifier detects and reports integrity state. It must never repair, mutate, backfill, recreate, normalize in place, replace ownership, create staff, create invitations, or change production data.

## 3. Actor terminology and authority separation

Two different identities exist and MUST NOT be conflated:

1. `verifyingSuperAdminUid` — the current authenticated caller requesting verification.
2. `audit.requestingSuperAdminUid` — historical evidence identifying the ACTIVE SUPERADMIN who originally authorized provisioning.

These identities **MAY be different**.

A valid audit created by SuperAdmin A must remain verifiable by a different currently ACTIVE SuperAdmin B. The verifier MUST NOT require:

`verifyingSuperAdminUid === audit.requestingSuperAdminUid`

The historical provisioning actor does not need to remain currently active or currently SUPERADMIN for the historical audit to remain valid evidence. Slice 3 therefore MUST NOT read `users/{audit.requestingSuperAdminUid}` merely to re-authorize the historical provisioning event.

Only the current `verifyingSuperAdminUid` is authorization-bearing for the verification operation.

## 4. Current verifier requesting authority

Only an authenticated platform principal canonically verified as an **ACTIVE SUPERADMIN** may request verification.

The trusted service must:

1. cryptographically verify the current caller;
2. derive `verifyingSuperAdminUid` only from verified authentication context, never from request payload;
3. read `users/{verifyingSuperAdminUid}` server-side before any audit existence lookup;
4. require `role === "SUPERADMIN"`;
5. require `status === "Active"` or `status === "ACTIVE"`;
6. fail closed if the user document is missing, unreadable, inactive, malformed, or not exact SUPERADMIN.

The following never authorize verification by themselves:

- Pro Club `OWNER`, `ADMIN`, or `MEMBER`;
- any football staff role;
- `TECHNICAL_DIRECTOR`, `MANAGER`, `HEAD_COACH`, `ASSISTANT_COACH`, `GK_COACH`, `FITNESS_COACH`, `ANALYST`, `PHYSIO`, `TEAM_MANAGER`, or `STAFF`;
- Academy membership or Academy role;
- `requestedRole`;
- support presentation / Work As Staff identity;
- client-side `currentUser` presentation;
- caller-supplied UID;
- service identity without an authenticated ACTIVE SUPERADMIN principal.

Platform SUPERADMIN verification authority is control-plane authority only and never becomes Pro Club tenant authority.

## 5. Trusted execution boundary and zero mutation

Verification executes only inside a trusted backend / Admin SDK boundary. Admin SDK execution authority is not business authorization; Section 4 must still be enforced.

The verifier is strictly read-only and every outcome performs **zero Firestore writes**.

Forbidden operations include create, set, update, delete, transaction write, batch write, repair, backfill, owner replacement, membership mutation, staff mutation, invite/claim mutation, and audit mutation.

A mismatch is evidence to report, never permission to repair.

## 6. Exact V1 request contract

The V1 JSON domain request is exactly:

```typescript
export interface ProClubProvisioningAuditVerificationRequestV1 {
  readonly provisioningId: string;
}
```

Runtime shape is strict:

- request body must be a non-null plain JSON object;
- arrays are rejected;
- it must contain exactly one own key: `provisioningId`;
- every extra key is rejected, including `clubId`, `ownerUid`, `requestingSuperAdminUid`, `verifyingSuperAdminUid`, role, status, or target path;
- `provisioningId` must be a string;
- it must already be trimmed, non-empty, contain no slash, and satisfy the Provisioning V1 canonical document-identifier policy;
- target club and target owner are derived only from a structurally valid canonical audit document.

V1 supports exact document lookup only. It forbids collection list, collection query, prefix search, club-wide discovery, owner-wide discovery, audit browsing, and enumeration of provisioning records.

## 7. Decision order and exact read set

The security-critical decision order is:

1. verify current caller authentication and derive `verifyingSuperAdminUid`;
2. read and authorize `users/{verifyingSuperAdminUid}`;
3. validate the exact request shape and canonical `provisioningId`;
4. exact-get `proClubProvisioningAudits/{provisioningId}`;
5. validate the complete stored audit before using audit-derived paths;
6. read `proClubs/{audit.clubId}`;
7. read `proClubs/{audit.clubId}/members/{audit.ownerUid}`;
8. return a minimal result or stable safe failure.

Unauthorized callers must be rejected before audit existence is read, preventing an audit-existence oracle.

The verifier reads no staff document, no invitation, no onboarding claim, and no Academy document. It does not read `users/{audit.requestingSuperAdminUid}` as part of current verification authority.

## 8. Replay validator separation

The existing Provisioning V1 replay validator `validateStoredAuditOnReplay` is replay-specific. It currently validates an incoming request fingerprint and requires the stored historical `requestingSuperAdminUid` to equal the authenticated provisioning retry caller.

Slice 3 MUST NOT reuse that replay-specific caller-equality requirement as verification authority or audit-integrity semantics.

Slice 3 implementation must use a verification-specific pure validator (or a safely refactored shared structural validator) that:

- validates the stored audit exact shape;
- validates normalized-request exact shape and bindings;
- recomputes the fingerprint from stored normalized evidence;
- does not require an incoming provisioning request fingerprint;
- does not require current `verifyingSuperAdminUid` to equal historical `audit.requestingSuperAdminUid`;
- performs no writes.

Any refactor of shared Provisioning V1 validator code must preserve existing provisioning replay behavior exactly and receive regression coverage.

## 9. Canonical audit integrity

A provisioning audit is VERIFIED only if it exists and has exactly these nine top-level fields and no others:

1. `schemaVersion`
2. `provisioningId`
3. `clubId`
4. `ownerUid`
5. `requestingSuperAdminUid`
6. `requestFingerprint`
7. `normalizedRequest`
8. `createdAt`
9. `status`

Required values and bindings:

- `schemaVersion === 1`;
- `status === "COMPLETED"`;
- document ID equals requested `provisioningId`;
- `audit.provisioningId === provisioningId`;
- `clubId`, `ownerUid`, and historical `requestingSuperAdminUid` are valid canonical document identifiers;
- `createdAt` satisfies the existing canonical Provisioning V1 timestamp validator;
- `requestFingerprint` matches `/^sha256:[a-f0-9]{64}$/`.

`normalizedRequest` must contain exactly these nine fields and no others:

1. `clubId`
2. `country`
3. `initialOwnerUid`
4. `level`
5. `logoUrl`
6. `name`
7. `provisioningId`
8. `requestingSuperAdminUid`
9. `shortName`

Bindings must satisfy:

- `normalizedRequest.provisioningId === audit.provisioningId`;
- `normalizedRequest.clubId === audit.clubId`;
- `normalizedRequest.initialOwnerUid === audit.ownerUid`;
- `normalizedRequest.requestingSuperAdminUid === audit.requestingSuperAdminUid`;
- `level` is exact `T1`, `T2`, or `T3`;
- `name` is a trimmed non-empty string;
- `shortName`, `country`, and `logoUrl` are null or trimmed non-empty strings.

The verifier reconstructs canonical JSON using the frozen Provisioning V1 key order and recomputes SHA-256 from the stored normalized request. The recomputed fingerprint must exactly equal `audit.requestFingerprint`.

Missing fields, extra fields, malformed values, invalid binding, or fingerprint mismatch are `INTEGRITY_FAILURE` and can never produce VERIFIED.

## 10. Canonical resource integrity

Only after Section 9 succeeds may audit-derived resource paths be read.

`proClubs/{audit.clubId}` must exist, satisfy the existing canonical stored Pro Club validator, and remain `status === "ACTIVE"`.

Legitimate post-provisioning changes to mutable profile fields such as name, shortName, country, logoUrl, or level do not alone invalidate provisioning integrity when the current stored club still satisfies the canonical ACTIVE shape.

`proClubs/{audit.clubId}/members/{audit.ownerUid}` must exist and match exactly:

```json
{
  "authorizationRole": "OWNER",
  "status": "ACTIVE"
}
```

No extra membership fields are permitted.

No football staff assignment, invitation, onboarding claim, Academy membership, or global football role is required. `OWNER != staffRole` remains preserved.

## 11. Result and error contract

Internal domain classifications are:

- `VERIFIED`
- `NOT_FOUND`
- `INTEGRITY_FAILURE`
- `UNAUTHORIZED`
- `INVALID_REQUEST`
- `INTERNAL_ERROR`

Unauthorized callers receive only generic authorization failure and must not learn whether the audit, club, or owner exists.

An authorized VERIFIED response is minimal:

```typescript
export interface ProClubProvisioningAuditVerificationResultV1 {
  readonly status: "VERIFIED";
  readonly provisioningId: string;
  readonly clubId: string;
  readonly ownerUid: string;
  readonly createdAt: string;
}
```

The public response never exposes tokens, Authorization headers, raw user documents, email, phone, raw Auth records, service credentials, stack traces, full raw audit payloads, or full normalized request snapshots.

## 12. Safe observability

Structured logs may contain only minimum operational metadata: operation name, exact `provisioningId`, safe result classification, stable domain error code, duration/execution metadata, and privileged `clubId` only after canonical audit validation when operationally necessary.

Logs must never include authentication tokens, Authorization headers, App Check tokens, service credentials, email, phone, raw Auth user records, raw Firestore user documents, full raw audit payloads, or full normalized request snapshots.

Internal exceptions must be mapped to stable safe errors without dumping sensitive raw objects to clients.

## 13. Fail-closed matrix

The verifier fails closed as follows:

1. missing/invalid authentication -> `UNAUTHORIZED`;
2. missing canonical current verifier -> `UNAUTHORIZED`;
3. current verifier inactive -> `UNAUTHORIZED`;
4. current verifier not exact SUPERADMIN -> `UNAUTHORIZED`;
5. malformed request body, array body, missing key, extra key, or invalid `provisioningId` -> `INVALID_REQUEST`;
6. audit not found -> `NOT_FOUND` for an authorized caller only;
7. malformed/extra-field audit -> `INTEGRITY_FAILURE`;
8. malformed/extra-field normalized request -> `INTEGRITY_FAILURE`;
9. fingerprint mismatch -> `INTEGRITY_FAILURE`;
10. missing, malformed, or inactive club -> `INTEGRITY_FAILURE`;
11. missing or non-exact ACTIVE OWNER membership -> `INTEGRITY_FAILURE`;
12. Firestore read failure -> `INTERNAL_ERROR`;
13. unexpected exception -> `INTERNAL_ERROR`;
14. no path may fabricate VERIFIED;
15. every path performs zero Firestore writes.

Repeated verification is naturally idempotent because the operation is read-only.

## 14. Preserved FutVerse boundaries

This slice preserves all existing boundaries:

- public registration does not create Pro Clubs;
- `users.role != tenant authority`;
- authorization roles remain exactly `OWNER`, `ADMIN`, `MEMBER`;
- football staff roles remain exactly the canonical ten-role set;
- `MANAGER` and `TEAM_MANAGER` remain distinct;
- `staffRole != authorizationRole`;
- staff assignment never creates membership authority;
- Academy authority does not grant Pro Club authority;
- support presentation is not authenticated actor identity;
- client Pro Club root create remains closed;
- OWNER bootstrap remains trusted-control-plane only;
- client provisioning-audit writes remain closed;
- Slice 3 adds no list/discovery capability;
- Slice 3 adds no mutation capability.

## 15. Required implementation regressions

A later trusted read-only implementation must prove at minimum:

1. current ACTIVE SUPERADMIN can verify a valid exact audit;
2. a different ACTIVE SUPERADMIN can verify an audit created by another historical SuperAdmin;
3. historical provisioning actor does not need to remain currently ACTIVE/SUPERADMIN;
4. current inactive SUPERADMIN is denied;
5. current non-SUPERADMIN is denied;
6. tenant OWNER without platform SUPERADMIN is denied;
7. staff role never authorizes verification;
8. caller-supplied verifier/requester UID cannot authorize;
9. request body rejects arrays, missing key, and every extra key;
10. exact `provisioningId` get succeeds and list/query/discovery is absent;
11. unauthorized caller cannot distinguish missing from existing audit;
12. exact audit whitelist is enforced;
13. exact normalized-request whitelist and bindings are enforced;
14. fingerprint is recomputed solely from stored normalized evidence;
15. verifier does not inherit replay-only current-caller equality or incoming-fingerprint requirements;
16. missing/malformed/inactive club fails closed;
17. missing/non-exact OWNER fails closed;
18. mutable canonical club profile edits do not cause false failure;
19. no staff assignment/invitation/Academy document is required;
20. zero writes occur on VERIFIED, NOT_FOUND, INTEGRITY_FAILURE, UNAUTHORIZED, INVALID_REQUEST, and INTERNAL_ERROR;
21. safe logs contain no token/header/email/raw audit/raw normalized request;
22. repeated verification is idempotent;
23. no tenant authority is created or changed;
24. Academy behavior remains unchanged;
25. existing Provisioning V1 service and replay behavior remain unchanged.

## 16. Succession and review gate

Independent architecture/security review finding addressed by this freeze:

- current verifier identity is explicitly separated from historical provisioning-requester evidence;
- exact one-key request-body shape is explicit.

Next approved implementation slice after this contract independently passes review:

`PRO CLUB PROVISIONING AUDIT VERIFICATION V1 — TRUSTED READ-ONLY SERVICE IMPLEMENTATION`

A later separately reviewed **Slice 4 — Privileged Control-Plane UI / API Integration** may consume the verifier only after the trusted verifier implementation passes its own tests and review.

No production implementation, merge to `main`, or production deployment is authorized merely by this Contract Freeze.
