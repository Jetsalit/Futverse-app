# FutVerse Pro Club Provisioning Audit Verification V1 Contract Freeze

Status: FROZEN ARCHITECTURAL CONTRACT — DOCUMENTATION AND CONTRACT TESTS ONLY

## 1. Baseline, Branch, and Exact Scope

- Repository: `Jetsalit/Futverse-app`
- Production source of truth: `main`
- Exact production baseline: `d2f2db5fe4fabd6d94ecb188338c5be23a400a1b`
- Branch: `feat/pro-club-provisioning-v1-audit-verification-contract`
- Governing predecessor: `docs/PRO_CLUB_PROVISIONING_V1_CONTRACT_FREEZE.md`
- Governing authority predecessor: `docs/PRO_CLUB_AUTHORITY_FOUNDATION_V1_FREEZE.md`

This contract slice may introduce exactly two files:

1. `docs/PRO_CLUB_PROVISIONING_AUDIT_VERIFICATION_V1_CONTRACT_FREEZE.md`
2. `tests/proClubProvisioningAuditVerificationV1Contract.test.ts`

No production source, Firebase Function implementation, Firestore Rules, UI, routing, configuration, deployment artifact, or existing frozen contract is modified by this slice.

This slice freezes the architecture for **Provisioning Slice 3 — Audit Verification and Observability** only. It does not authorize production implementation or production deployment.

---

## 2. Purpose

Pro Club Provisioning V1 already creates canonical durable provisioning evidence at:

`proClubProvisioningAudits/{provisioningId}`

Provisioning Slice 3 defines an independent, privileged, read-only verification boundary that proves whether that canonical audit evidence still agrees with the canonical Pro Club and its sovereign initial OWNER membership.

The verifier exists to **detect and report integrity state**. It must never repair, mutate, backfill, recreate, normalize in place, or otherwise change production data.

Core rule:

```text
VERIFY != REPAIR
READ AUTHORITY != WRITE AUTHORITY
OBSERVABILITY != TENANT AUTHORITY
```

---

## 3. Requesting Authority

Only an authenticated platform principal that is canonically verified as an **ACTIVE SUPERADMIN** may request V1 provisioning audit verification.

The verifier must:

1. cryptographically verify the authenticated caller identity;
2. derive `requestingSuperAdminUid` only from verified authentication context, never from request payload;
3. read canonical `users/{requestingSuperAdminUid}` server-side;
4. require `role === "SUPERADMIN"`;
5. require `status === "Active"` or `status === "ACTIVE"`;
6. fail closed if the user document is missing, unreadable, inactive, malformed, or not SUPERADMIN.

The following are never sufficient verification authority:

- `OWNER`, `ADMIN`, or `MEMBER` Pro Club membership;
- any football `staffRole`;
- `TECHNICAL_DIRECTOR`, `MANAGER`, `HEAD_COACH`, `ASSISTANT_COACH`, `GK_COACH`, `FITNESS_COACH`, `ANALYST`, `PHYSIO`, `TEAM_MANAGER`, or `STAFF`;
- Academy membership or Academy role;
- `requestedRole`;
- support presentation / Work As Staff identity;
- client-side `currentUser` presentation;
- caller-supplied UID;
- service identity without an authenticated ACTIVE SUPERADMIN requesting principal.

`SUPERADMIN` authorizes access to this platform control-plane verification operation only. It does not grant Pro Club tenant authority.

---

## 4. Execution Boundary

Verification executes only inside a trusted backend / Admin SDK boundary.

Admin SDK execution authority is not business authorization. The service must independently enforce the requesting-principal rules in Section 3.

The verifier is strictly read-only.

### 4.1 Absolute Zero-Mutation Rule

A verification request must perform **zero Firestore writes**.

Forbidden operations include:

- create;
- set;
- update;
- delete;
- transaction write;
- batch write;
- repair;
- backfill;
- owner replacement;
- membership mutation;
- staff assignment mutation;
- invite or claim mutation;
- audit mutation.

A mismatch is evidence to report, not data to repair.

---

## 5. Exact V1 Input Contract

The V1 request contains exactly one domain input:

```typescript
export interface ProClubProvisioningAuditVerificationRequestV1 {
  readonly provisioningId: string;
}
```

Rules:

- `provisioningId` must be a string;
- it must be trimmed and non-empty;
- it must satisfy the same canonical document-identifier policy used by Provisioning V1;
- no `clubId`, `ownerUid`, `requestingSuperAdminUid`, role, status, or target path may be supplied as an authority-bearing request field;
- the target club and owner are derived only from a successfully validated canonical audit document.

V1 permits **exact document lookup only**.

Forbidden:

- collection list;
- collection query;
- prefix search;
- club-wide discovery;
- owner-wide discovery;
- audit browsing;
- enumeration of provisioning records.

---

## 6. Exact Read Set and Decision Order

After authentication and input validation, the verifier reads only the minimum canonical documents needed for verification.

Required decision order:

1. `users/{requestingSuperAdminUid}`
2. `proClubProvisioningAudits/{provisioningId}`
3. `proClubs/{audit.clubId}`
4. `proClubs/{audit.clubId}/members/{audit.ownerUid}`

The verifier must not read a caller-supplied club or owner target. `audit.clubId` and `audit.ownerUid` become usable lookup keys only after the audit itself passes structural and binding validation.

No staff document and no invitation document is required to verify provisioning integrity.

---

## 7. Canonical Audit Integrity Contract

A provisioning audit is VERIFIED only if the document exists and satisfies the complete canonical V1 shape.

### 7.1 Exact Top-Level Allowed Fields

The audit document must contain exactly these nine fields and no others:

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
- `clubId`, `ownerUid`, and `requestingSuperAdminUid` are valid canonical document identifiers;
- `createdAt` is a valid server-authoritative timestamp representation accepted by the Provisioning V1 contract;
- `requestFingerprint` matches `/^sha256:[a-f0-9]{64}$/`.

### 7.2 Exact Normalized Request Shape

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
- `level` is exactly `T1`, `T2`, or `T3`;
- optional normalized fields are canonical string-or-null values;
- `name` is a non-empty normalized string.

The verifier must reconstruct canonical JSON using the frozen Provisioning V1 key order and recompute SHA-256. The recomputed value must exactly equal `audit.requestFingerprint`.

Any missing field, extra field, malformed value, invalid binding, or fingerprint mismatch is an integrity failure. It must never be reported as VERIFIED.

---

## 8. Canonical Resource Integrity Contract

Only after Section 7 passes may the verifier inspect the resources bound by that audit.

### 8.1 Pro Club

`proClubs/{audit.clubId}` must:

- exist;
- satisfy the canonical Pro Club stored-shape validator;
- have `status === "ACTIVE"`.

Legitimate post-provisioning edits to mutable profile fields such as name, shortName, country, logoUrl, or level do not by themselves invalidate provisioning integrity, provided the current club document remains a valid canonical ACTIVE Pro Club.

### 8.2 Sovereign Initial OWNER Membership

`proClubs/{audit.clubId}/members/{audit.ownerUid}` must exist and match the exact membership payload:

```json
{
  "authorizationRole": "OWNER",
  "status": "ACTIVE"
}
```

No extra fields are permitted.

Provisioning integrity does not require the OWNER to have a football staff assignment. `OWNER != staffRole` remains preserved.

Provisioning integrity does not require an invite, onboarding claim, Academy membership, or global football role.

---

## 9. Verification Result Contract

The domain verifier may classify a request internally as:

- `VERIFIED`
- `NOT_FOUND`
- `INTEGRITY_FAILURE`
- `UNAUTHORIZED`
- `INTERNAL_ERROR`

Only an authenticated ACTIVE SUPERADMIN may receive domain verification detail.

Unauthorized callers must receive a generic authorization failure and must not learn whether the requested `provisioningId`, club, owner, or audit exists.

A successful privileged verification response may contain a minimal summary:

```typescript
export interface ProClubProvisioningAuditVerificationResultV1 {
  readonly status: "VERIFIED";
  readonly provisioningId: string;
  readonly clubId: string;
  readonly ownerUid: string;
  readonly createdAt: string;
}
```

The V1 public response must not expose:

- Firebase ID token;
- Authorization header;
- App Check token;
- raw user document;
- user email;
- phone number;
- profile data;
- raw Firebase Auth record;
- service credentials;
- stack traces;
- entire raw audit object;
- entire raw `normalizedRequest` object.

Endpoint transport shape and any App Check requirement are implementation-slice decisions; authenticated identity plus canonical ACTIVE SUPERADMIN revalidation are non-negotiable.

---

## 10. Safe Observability Contract

Observability exists to diagnose verification behavior without creating a new privacy or authority leak.

Structured logs may include only the minimum safe operational metadata required for diagnosis, such as:

- operation name;
- `provisioningId`;
- safe result classification;
- stable domain error code;
- duration / execution metadata;
- privileged `clubId` only after canonical audit validation when operationally necessary.

Logs must never include authentication tokens, Authorization headers, service credentials, email, phone, raw Auth user records, raw Firestore user documents, full raw audit payloads, or full normalized request snapshots.

Integrity failures must be observable through a stable safe error code. Internal exceptions must not dump sensitive raw objects into client responses.

---

## 11. Fail-Closed Matrix

The verifier must fail closed as follows:

1. missing/invalid auth -> `UNAUTHORIZED`;
2. missing canonical requester -> `UNAUTHORIZED`;
3. requester not ACTIVE -> `UNAUTHORIZED`;
4. requester role not exact SUPERADMIN -> `UNAUTHORIZED`;
5. invalid `provisioningId` -> validation failure with zero reads beyond authority checks as implementation ordering permits and zero writes;
6. audit not found -> `NOT_FOUND` for authorized caller only;
7. malformed audit -> `INTEGRITY_FAILURE`;
8. extra audit field -> `INTEGRITY_FAILURE`;
9. malformed normalized request -> `INTEGRITY_FAILURE`;
10. fingerprint mismatch -> `INTEGRITY_FAILURE`;
11. missing club -> `INTEGRITY_FAILURE`;
12. malformed or inactive club -> `INTEGRITY_FAILURE`;
13. missing OWNER membership -> `INTEGRITY_FAILURE`;
14. OWNER membership not exact ACTIVE OWNER -> `INTEGRITY_FAILURE`;
15. Firestore read failure -> `INTERNAL_ERROR`;
16. unexpected exception -> `INTERNAL_ERROR`;
17. no failure path may fabricate `VERIFIED`;
18. every path performs zero Firestore writes.

Repeated verification of the same `provisioningId` is naturally idempotent because the operation is read-only.

---

## 12. Security and Authority Preservation

This slice must not change or weaken any existing FutVerse invariant:

- public registration does not create a Pro Club;
- `users.role != tenant authority`;
- Pro Club authorization roles remain exactly `OWNER`, `ADMIN`, `MEMBER`;
- football staff roles remain exactly the canonical ten-role set;
- `MANAGER` and `TEAM_MANAGER` remain distinct;
- `staffRole != authorizationRole`;
- staff assignment never creates membership authority;
- Academy authority does not grant Pro Club authority;
- support presentation does not become authenticated actor identity;
- client Firestore root Pro Club creation remains closed;
- OWNER bootstrap remains trusted-control-plane only;
- provisioning audit client write access remains closed;
- verification introduces no list/discovery capability;
- verification introduces no mutation capability.

---

## 13. Required Future Implementation Tests

A later implementation slice must prove at minimum:

1. ACTIVE SUPERADMIN can verify a valid exact audit;
2. inactive SUPERADMIN is denied;
3. non-SUPERADMIN is denied;
4. tenant OWNER without platform SUPERADMIN is denied;
5. staff role never authorizes verification;
6. caller-supplied requester UID cannot authorize;
7. exact `provisioningId` lookup succeeds;
8. list/query/discovery is absent;
9. missing audit does not leak to unauthorized caller;
10. exact audit whitelist is enforced;
11. exact normalized-request whitelist is enforced;
12. deterministic fingerprint is recomputed and compared;
13. binding mismatch fails closed;
14. missing club fails closed;
15. malformed/inactive club fails closed;
16. missing OWNER fails closed;
17. non-exact OWNER membership fails closed;
18. post-provisioning mutable club profile edits do not create a false integrity failure when the current club remains canonical and ACTIVE;
19. no staff assignment is required;
20. no invitation is required;
21. zero writes occur on VERIFIED;
22. zero writes occur on NOT_FOUND;
23. zero writes occur on INTEGRITY_FAILURE;
24. zero writes occur on UNAUTHORIZED;
25. zero writes occur on INTERNAL_ERROR;
26. safe logs contain no token/header/email/raw audit/raw normalized request;
27. repeated verification is idempotent;
28. no Pro Club membership or tenant authority is created or changed;
29. Academy behavior remains unchanged;
30. existing provisioning service behavior remains unchanged.

---

## 14. Succession and Review Gate

This contract is the architecture freeze for Provisioning Slice 3.

Next approved implementation slice after independent architecture/security review:

`PRO CLUB PROVISIONING AUDIT VERIFICATION V1 — TRUSTED READ-ONLY SERVICE IMPLEMENTATION`

That implementation slice must remain read-only and must preserve the exact authority, integrity, privacy, and no-discovery boundaries frozen here.

A later, separately reviewed **Slice 4 — Privileged Control-Plane UI / API Integration** may consume the trusted verifier only after the verifier implementation independently passes its own tests and review.

No production implementation, merge to `main`, or production deployment is authorized merely by this Contract Freeze.
