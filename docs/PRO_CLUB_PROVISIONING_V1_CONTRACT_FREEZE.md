# FutVerse Pro Club Provisioning V1 Contract Freeze

Status: FROZEN ARCHITECTURAL CONTRACT (DOCUMENTATION AND CONTRACT TESTS ONLY)

## 1. Baseline and Scope

- Workspace: `C:\Users\asus\Documents\Futverse-app`
- Branch: `feat/pro-club-provisioning-v1-contract`
- Base Commit / Origin Main: `03866126fb98e034a6898b4ff6de99a8210e9f29`
- Pre-Review HEAD: `0ba128d26b96ea24611a8ad065d1ec6babddf971`
- Origin: `https://github.com/Jetsalit/Futverse-app.git`
- Origin/Main: `03866126fb98e034a6898b4ff6de99a8210e9f29`
- Governing Predecessors:
  - `docs/PRO_CLUB_AUTHORITY_FOUNDATION_V1_FREEZE.md`
  - `docs/PRO_CLUB_STAFF_ONBOARDING_V1_CONTRACT_FREEZE.md`
  - `docs/PRO_CLUB_INVITE_CLAIM_MEMBERSHIP_RULES_DATA_CONTRACT_V1.md`

### Allowed Files Boundary

This contract slice may introduce or modify exactly **two** files:

1. `docs/PRO_CLUB_PROVISIONING_V1_CONTRACT_FREEZE.md`
2. `tests/proClubProvisioningV1Contract.test.ts`

No production source file (`src/...`), Firestore Rules (`firestore.rules`), or configuration file is modified.
No test data in Firebase or Firestore writes are permitted.
No deployment, commit, push, PR, or merge is authorized.

---

## 2. Purpose and Problem Statement

This Contract Freeze defines the security, authority, atomicity, schema, audit, and lifecycle boundary for **Pro Club Provisioning V1**:

1. Canonical Pro Club creation:
   `proClubs/{clubId}`
2. Initial Pro Club Owner bootstrap:
   `proClubs/{clubId}/members/{ownerUid}`
   with exact membership payload:
   ```json
   {
     "authorizationRole": "OWNER",
     "status": "ACTIVE"
   }
   ```
3. Canonical Provisioning Audit evidence:
   `proClubProvisioningAudits/{provisioningId}`

### Current Repository Reality and the Genesis Problem

The governing onboarding and authority contracts establish the following facts:

- Production onboarding runtime (`src/lib/firestore/proClubOnboardingRuntime.ts`) provides:
  - `inspectInvitation`
  - `requestMembership`
  - `loadWorkspace`
  - `loadPending`
  - `reviewClaim`
- Local script `scripts/seedProClubOnboardingLocal.ts` uses `withSecurityRulesDisabled` in the local emulator only. It is strictly forbidden in production.
- Client Firestore Rules (`firestore.rules`) maintain strict tenant boundaries:
  - `match /proClubs/{clubId}`: `allow list, create, update, delete: if false;`
  - `match /members/{uid}`: `allow create: if validProClubMembershipCreateV1(clubId, uid);`
- In `firestore.rules`, `validProClubMembershipCreateV1` explicitly enforces:
  - `request.resource.data.get('authorizationRole', '') == 'MEMBER'`
  - Requires fresh approval proof from `onboardingApprovals/{uid}`, which in turn requires an active invitation created by an existing canonical `OWNER` or `ADMIN` of that exact club.

Consequently, there is an **authority genesis barrier**:
A new Pro Club cannot be created via client write because `proClubs/{clubId}` is default-deny.
An initial `OWNER` cannot be bootstrapped via client onboarding because client onboarding only creates `MEMBER` roles from invites issued by existing owners.
Therefore, Pro Club creation and initial OWNER bootstrap is inherently a **privileged control-plane lifecycle**.

---

## 3. Contract Decision: Architecture Comparison

We evaluate two possible architectural approaches for Pro Club Provisioning V1:

- **Option A**: Authenticated Privileged SuperAdmin + Strict Firestore Rules + Atomic Client Write
- **Option B**: Trusted Backend / Service Provisioning Boundary

### Comprehensive Architectural Evaluation

| Evaluation Criterion | Option A: Client SuperAdmin + Rules | Option B: Trusted Backend / Service Boundary |
| :--- | :--- | :--- |
| **Security** | **HIGH ATTACK SURFACE**: Requires opening client write rules on root `proClubs/{clubId}` and `members/{uid}` with `OWNER` role to client browser sessions. | **SUPERIOR**: Keeps client `firestore.rules` default-deny (`allow list, create, update, delete: if false;`) for `proClubs/{clubId}`. Zero client write surface. |
| **Privilege Escalation Risk** | **SIGNIFICANT EXPOSURE**: Does not require Admin SDK in the browser, but relies on client Firebase Auth sessions. A compromised or incorrectly-authorized privileged client session (e.g. session hijack, token compromise, or XSS against an active privileged session) interacting with widened sensitive Rules creates high exposure. If client Rules are widened to allow root club creation and sovereign OWNER bootstrap, any rule bug directly exposes tenant boundaries. | **MINIMAL**: Browser sessions have zero write surface on root clubs or OWNER elevation. Provisioning is accessible only through trusted server-side control-plane endpoints with strict authorization and identity verification. |
| **Atomicity** | **ATOMIC BUT COMPLEX & CLIENT-DRIVEN**: Firestore client batches (`writeBatch`) and client transactions (`runTransaction`) are atomic (all operations commit or none do; browser or network interruptions do NOT cause partial committed state in Firestore). However, client-driven atomicity requires complex cross-document Rules assertions (`existsAfter`, `getAfter`), exposes lifecycle to client retry behavior, and lacks server-orchestrated control-plane enforcement. | **PROVABLE & ROBUST**: Server-side Firestore transactions (`db.runTransaction`) execute atomically within a trusted authorization boundary with centralized audit/control-plane enforcement, reduced client Rules attack surface, and lower blast radius. |
| **Auditability** | **WEAK CONTROL-PLANE EVIDENCE**: Client writes cannot produce canonical durable immutable-by-contract provisioning evidence without complex client Rules constraints that could be distorted by a compromised privileged client session. | **CANONICAL DURABLE EVIDENCE**: Produces canonical durable immutable-by-contract provisioning evidence in `proClubProvisioningAudits/{provisioningId}`. Admin SDK bypasses Firestore Rules; audit immutability is governed by the trusted service boundary, IAM/service authorization, and application contract, while client access remains completely closed. |
| **Blast Radius** | **HIGH**: Modifies sensitive root collection rules in `firestore.rules`, creating risk of regression for existing onboarding, membership, and read protections. | **ZERO**: `firestore.rules` remains completely untouched. No client rule changes required. |
| **Credential Exposure** | **MIXED BOUNDARY**: Client operates using user Firebase ID tokens against widened Firestore Rules, blurring the distinction between tenant authority and platform control plane. | **STRICT ISOLATION**: Control-plane execution authority is held strictly by trusted backend service credentials in the managed cloud environment governed by IAM. Client holds zero provisioning authority. |
| **Production Deployment Complexity** | **HIGH**: Intertwines client rule updates with client application releases. | **LOW & ISOLATED**: Provisioning service is an isolated backend function/service that deploys independently without client side-effects. |
| **Architecture Consistency** | **CONFLICTING**: Contradicts FutVerse principles: `users.role != tenant authority`, `support presentation != authenticated provisioning actor`, and `proClubs/{clubId}` closed to client create. | **FULLY CONSISTENT**: Strictly upholds all FutVerse governing invariants and preserves exact runtime schemas. |

### Contract Decision Rationale

**OPTION B (Trusted Backend / Service Provisioning Boundary) IS SELECTED.**

Option B is selected based on:
1. **Trusted Authorization Boundary**: All provisioning preconditions, identity verifications, and eligibility requirements are validated authoritatively in a secure server-side environment.
2. **Reduced Client Rules Attack Surface**: Client `firestore.rules` remains default-deny for `proClubs/{clubId}` creation and `OWNER` role elevation, preventing any client-side exploit vector.
3. **Centralized Audit and Control-Plane Enforcement**: Dedicated, canonical durable immutable-by-contract provisioning evidence is created synchronously within the control plane, protected from client interference.
4. **Lower Blast Radius**: Zero modifications to existing client `firestore.rules`, eliminating regression risks for onboarding, invitations, and membership reads.

---

## 4. Requesting Principal vs Execution Authority

A fundamental architectural distinction governs Pro Club Provisioning V1:

```text
REQUESTING AUTHORITY != EXECUTION AUTHORITY
```

### 4.1 Requesting Authority (Who May Authorize Provisioning)

The only valid requesting authority for Pro Club Provisioning V1 is an **authenticated, explicitly ACTIVE platform SUPERADMIN**:

1. **Pre-Transaction Token Verification**: Verified Firebase authenticated UID (`request.auth.uid` or cryptographically verified decoded Firebase ID token UID).
2. **Inside-Transaction Re-verification**: Inside the SAME Firestore transaction, the server re-reads canonical `users/{requestingSuperAdminUid}` directly from Firestore server-side via `transaction.get(users/{requestingSuperAdminUid})`.
3. Explicitly ACTIVE account state: `status` must equal `"Active"` or `"ACTIVE"` (matching current canonical account policy).
4. Canonical privileged role: `role` must strictly equal `"SUPERADMIN"`.
5. **TOCTOU Elimination**: Pre-transaction user read alone is NOT sufficient authorization. A pre-transaction read is vulnerable to Time-Of-Check to Time-Of-Use (TOCTOU) race conditions if role or active status is revoked before the transaction commits. Both canonical requester (`users/{requestingSuperAdminUid}`) and canonical owner eligibility (`users/{initialOwnerUid}`) must be read and verified inside the SAME Firestore transaction.

**Forbidden for Requesting Authority:**
- `currentUser` presentation (client-side state is untrusted presentation only).
- Support presentation ("Work As Staff" / impersonation).
- `DATA_ADMIN`, `ADMIN`, `COACH`, `PLAYER`, `SCOUT`, `PARENT`, or `USER`.
- Academy Membership authority (`academies/{academyId}`).
- Football staff role (`staffRole`, e.g. `HEAD_COACH`).
- Requested role (`requestedRole`).
- Arbitrary caller-supplied UID in request payload.
- Client-claimed `SUPERADMIN` (must be re-read from canonical `users/{uid}` inside the transaction).
- Pre-transaction user read alone without transactional read.
- Service caller without authenticated requesting principal.

### 4.2 Execution Authority (How Provisioning Is Carried Out)

- **Trusted Backend / Service + Admin SDK is EXECUTION BOUNDARY ONLY.**
- Service identity alone is **never** sufficient for business authorization. An automated service or service account without a verified, authenticated ACTIVE SUPERADMIN requesting principal must fail closed.

### 4.3 Control-Plane Privilege vs Tenant Authority

```text
SUPERADMIN here is PLATFORM CONTROL-PLANE AUTHORITY, NOT PRO CLUB TENANT AUTHORITY.
users.role must never substitute for: proClubs/{clubId}/members/{uid}
```

- Platform `SUPERADMIN` status authorizes invoking the provisioning control plane to create a club.
- Platform `SUPERADMIN` status does **not** grant automatic tenant membership or tenant ownership.
- After provisioning is complete, tenant ownership authority derives **exclusively** from canonical `proClubs/{clubId}/members/{ownerUid}` where `authorizationRole == "OWNER"` and `status == "ACTIVE"`.
- The backend must re-read canonical requesting user document `users/{requestingSuperAdminUid}` and initial owner document `users/{initialOwnerUid}` inside the SAME Firestore transaction via transactional reads, and fail closed if identity, status, or role does not match. Pre-transaction user read alone is NOT sufficient authorization.

---

## 5. Required Governing Invariants

The Pro Club Provisioning V1 contract enforces the following strict invariants:

1. **`PUBLIC REGISTRATION != PRO CLUB CREATION`**
   Registering as a user or selecting any requested role (`COACH`, `PLAYER`, `SCOUT`, `PARENT`) never provisions a Pro Club.
2. **`users.role != tenant authority`**
   A global account role (such as `users.role == 'SUPERADMIN'` or `users.role == 'COACH'`) is never tenant authority and cannot be used by client applications to write or manage clubs directly.
3. **`staffRole != authorizationRole`**
   A football staff role (e.g. `HEAD_COACH`) is distinct from tenant membership authorization (`OWNER`, `ADMIN`, `MEMBER`). Functional staff assignment grants no tenant authority.
4. **`Academy authority != Pro Club provisioning authority`**
   Holding any role or membership in an Academy (`academies/{academyId}`) grants zero authority over Pro Club provisioning.
5. **`support presentation != authenticated provisioning actor`**
   SuperAdmin support presentation ("Work As Staff") is a read-only presentation mechanism. It must never act as the authenticated actor for club provisioning.
6. **`currentUser presentation != authenticated actor`**
   Client-side user presentation (`currentUser`) is never the authenticated actor. The only recognized actor is the cryptographically verified authenticated caller identity.
7. **`Pro Club creation must be privileged control-plane lifecycle`**
   Provisioning is restricted to trusted backend control-plane services. Client-side applications cannot invoke Firestore writes to create clubs.
8. **Valid and Canonical `clubId`**
   The `clubId` must satisfy `isValidDocumentIdentifier`: non-empty, trimmed, no slashes, no leading/trailing whitespace, and bounded length.
9. **Forbid Overwriting Existing Clubs (`CREATE_ONLY`)**
   A Pro Club cannot be overwritten. If `proClubs/{clubId}` already exists, provisioning must fail closed immediately (`ERROR_CLUB_EXISTS`).
10. **Initial Owner Must Be Exact Canonical Existing User**
    The initial owner UID (`ownerUid`) must correspond to an existing, valid canonical user document (`users/{ownerUid}`). Bootstrapping a synthetic, missing, or mismatched UID is strictly forbidden.
11. **Initial Owner Membership Exact Contract**
    The initial membership document at `proClubs/{clubId}/members/{ownerUid}` must have:
    - `authorizationRole: "OWNER"`
    - `status: "ACTIVE"`
12. **Forbid Initial Bootstrap of ADMIN or MEMBER**
    Initial provisioning must bootstrap an `OWNER`. Initializing a club with only `ADMIN` or `MEMBER` is strictly forbidden because a club requires an initial sovereign owner.
13. **Strict 3-Way Atomicity: No Partial State Permitted**
    Club creation, initial OWNER bootstrap, and Provisioning Audit must execute in a single atomic transaction:
    - **Forbidden**: Club exists, but owner membership does not exist.
    - **Forbidden**: Owner membership exists, but club does not exist.
    - **Forbidden**: Club and owner membership exist, but audit evidence does not exist.
    If any of the three writes fails, the entire transaction rolls back.
14. **OWNER Bootstrap Does Not Create Football Staff Assignment**
    `OWNER != HEAD_COACH`. Bootstrapping an OWNER must not auto-create a document at `proClubs/{clubId}/staff/{ownerUid}`. Football staff assignments require separate operational workflows.
15. **Provisioning Does Not Create Invitations**
    Provisioning must not auto-create documents in `proClubInvites/{inviteCode}`. Onboarding invitations are issued separately by the canonical OWNER/ADMIN.
16. **Provisioning Does Not Fabricate Runtime Authorization**
    Provisioning writes database records; it does not inject `AUTHORIZED` states into `OrganizationRuntimeContext` or bypass runtime validation.
17. **Provisioning Does Not Use `activeProClubId` as Authority**
    Authority is derived strictly from canonical documents (`proClubs/{clubId}/members/{uid}`), never from client pointers, local storage, or session state.
18. **Provisioning Does Not Bypass Canonical Authority Adapter**
    Runtime authority must still be evaluated via `hasActiveProClubMembershipAuthority`.
19. **Exact Schema Preservation**
    Stored payloads must strictly match frozen domain models:
    - `proClubs/{clubId}`: fields limited to `name`, `shortName`, `level`, `status`, `country`, `logoUrl`, `createdAt`, `updatedAt`.
    - `proClubs/{clubId}/members/{ownerUid}`: fields limited to `authorizationRole`, `status`.
    No identity fields (`id`, `clubId`, `uid`, `userId`) inside payloads.
20. **Audit Evidence Outside Exact Membership Payload**
    Adding audit fields to `ProClubMembership` would violate `validateProClubMembership` (which checks `hasOnlyFields(candidate, PRO_CLUB_MEMBERSHIP_FIELDS)`). Audit evidence is stored in `proClubProvisioningAudits/{provisioningId}`.
21. **Canonical Durable Immutable-by-Contract Provisioning Evidence**
    Application server runtime logs do not satisfy the canonical provisioning contract. Provisioning audit evidence must be persisted as canonical durable immutable-by-contract provisioning evidence in `proClubProvisioningAudits/{provisioningId}`.
    Because Admin SDK bypasses Firestore Rules, audit immutability relies on the trusted service boundary, IAM/service authorization, and application contract, while client access remains completely closed.
22. **Replay Safety, Fingerprint Integrity, and Takeover Prevention**
    - Duplicate provisioning requests for the same `clubId` fail closed.
    - Replay with the same `provisioningId` and identical normalized request fingerprint returns idempotent COMPLETED after verifying that canonical resources exist and are active.
    - Current club profile is NOT required to remain identical forever on replay, because legitimate post-provisioning club edits may occur.
    - Replay with the same `provisioningId` and different request fingerprint fails closed (`ERROR_PROVISIONING_ID_CONFLICT`).
    - Existing clubs cannot be taken over or overwritten (`ERROR_CLUB_EXISTS`).
    - Existing owners cannot be replaced or overwritten.
    - Cross-club mutations fail closed.
23. **Contract Freeze Scope Boundary**
    This contract slice is documentation and contract tests only. It does NOT authorize production implementation, client write paths, or deployment.

---

## 6. Exact V1 Provisioning and Audit Schema

### 6.1 Provisioning Request Contract (Input)

```typescript
export interface ProClubProvisioningRequestV1 {
  readonly provisioningId: string;
  readonly clubId: string;
  readonly name: string;
  readonly shortName?: string;
  readonly level: "T1" | "T2" | "T3";
  readonly country?: string;
  readonly logoUrl?: string;
  readonly initialOwnerUid: string;
}
```

### 6.2 Normalized Request & Deterministic Request Fingerprint Schema

To guarantee deterministic replay detection, the server derives a canonical normalized request snapshot and a deterministic SHA-256 fingerprint binding all 9 initial provisioning fields:

```typescript
export interface NormalizedProClubProvisioningRequestV1 {
  readonly clubId: string;
  readonly country: string | null;
  readonly initialOwnerUid: string;
  readonly level: "T1" | "T2" | "T3";
  readonly logoUrl: string | null;
  readonly name: string;
  readonly provisioningId: string;
  readonly requestingSuperAdminUid: string;
  readonly shortName: string | null;
}
```

#### Explicit Request Normalization Rules:
1. **String Trimming**: All string fields (`provisioningId`, `clubId`, `initialOwnerUid`, `name`, `shortName`, `level`, `country`, `logoUrl`, `requestingSuperAdminUid`) are trimmed of leading and trailing whitespace (`str.trim()`).
2. **Optional Nullability**: For optional fields (`shortName`, `country`, `logoUrl`):
   - If `undefined`, `null`, or empty string `""` after trimming -> normalize strictly to `null`.
   - If non-empty after trimming -> preserve trimmed string.
3. **Strict Level**: `level` must strictly equal `"T1" | "T2" | "T3"`.
4. **Canonical Key Ordering**: In the normalized snapshot and serialized canonical JSON, keys are ordered alphabetically:
   `clubId`, `country`, `initialOwnerUid`, `level`, `logoUrl`, `name`, `provisioningId`, `requestingSuperAdminUid`, `shortName`.
5. **Deterministic Fingerprint Calculation**:
   - Canonical JSON string: `JSON.stringify(normalizedRequest)` with alphabetically sorted keys.
   - Deterministic SHA-256 hex digest: `"sha256:" + sha256(canonicalJson)`.
   - Both `requestFingerprint` and the immutable `normalizedRequest` snapshot are persisted in `proClubProvisioningAudits/{provisioningId}`.

### 6.3 Target Firestore Paths

The single server-side atomic transaction writes exactly three documents:

1. **Club Root Document**:
   `proClubs/{clubId}`
2. **Initial Owner Membership Document**:
   `proClubs/{clubId}/members/{initialOwnerUid}`
3. **Dedicated Immutable Provisioning Audit Document**:
   `proClubProvisioningAudits/{provisioningId}`

### 6.4 Exact Target Document Payloads

#### 1. Pro Club Document (`proClubs/{clubId}`)
```json
{
  "name": "Lampang FC",
  "shortName": "LFC",
  "level": "T1",
  "status": "ACTIVE",
  "country": "TH",
  "logoUrl": "https://example.com/logo.png",
  "createdAt": "2026-09-04T00:00:00.000Z",
  "updatedAt": "2026-09-04T00:00:00.000Z"
}
```
*Stored payload contains no `id` or `clubId`.*

#### 2. Initial Owner Membership Document (`proClubs/{clubId}/members/{initialOwnerUid}`)
```json
{
  "authorizationRole": "OWNER",
  "status": "ACTIVE"
}
```
*Stored payload contains no `id`, `clubId`, `uid`, `userId`, or audit fields.*

#### 3. Exact Canonical Audit Document (`proClubProvisioningAudits/{provisioningId}`)

The V1 canonical audit collection is strictly `proClubProvisioningAudits/{provisioningId}`:

```json
{
  "schemaVersion": 1,
  "provisioningId": "prov-lampang-20260904-001",
  "clubId": "club-lampang",
  "ownerUid": "user-owner-123",
  "requestingSuperAdminUid": "user-superadmin-789",
  "requestFingerprint": "sha256:9e51527c280bde9ff8199cf21939b510bd0289e2a6769019a87b11646bd66332",
  "normalizedRequest": {
    "clubId": "club-lampang",
    "country": "TH",
    "initialOwnerUid": "user-owner-123",
    "level": "T1",
    "logoUrl": "https://example.com/logo.png",
    "name": "Lampang FC",
    "provisioningId": "prov-lampang-20260904-001",
    "requestingSuperAdminUid": "user-superadmin-789",
    "shortName": "LFC"
  },
  "createdAt": "2026-09-04T00:00:00.000Z",
  "status": "COMPLETED"
}
```

**Audit Immutability & Security Architecture:**
- `schemaVersion`: strictly `1`.
- `provisioningId`: matches the document ID and unique request token.
- `clubId`: exact canonical club ID.
- `ownerUid`: exact canonical owner UID.
- `requestingSuperAdminUid`: exact authenticated active SuperAdmin principal.
- `requestFingerprint`: deterministic SHA-256 hash binding all 9 initial provisioning fields.
- `normalizedRequest`: exact immutable normalized request snapshot.
- `createdAt`: server-authoritative timestamp.
- `status`: `"COMPLETED"`.
- The audit record serves as **canonical durable immutable-by-contract provisioning evidence**.
- **Admin SDK bypasses Firestore Rules**: Admin SDK database operations do not evaluate `firestore.rules`.
- Audit immutability does not depend on Firestore Rules; instead, it depends strictly on:
  1. **Trusted Service Boundary**: Provisioning and audit generation are executed exclusively within trusted backend services.
  2. **IAM / Service Authorization**: Access to backend credentials and the database is governed by least-privilege cloud IAM policies.
  3. **Application Contract**: Service code strictly enforces a `CREATE_ONLY` policy for `proClubProvisioningAudits/{provisioningId}` (no update or delete endpoints or methods exist).
  4. **Client Remains Closed**: Client Firestore Rules deny all client read and write operations (`allow read, write: if false;` or omitted from rules).

---

## 7. Exact Provisioning Decision Order & Atomic Execution Lifecycle

The server-side provisioning execution must follow this exact decision order.
Pre-transaction user read alone is NOT sufficient authorization; both requester authorization and owner eligibility must be verified inside the SAME Firestore transaction.

### Phase 1: Pre-Transaction Validation & Normalization (Pre-Flight)
1. **Firebase ID Token Verification**:
   - Cryptographically verify caller's Firebase ID token (valid signature, non-revoked, not expired).
   - Extract `requestingSuperAdminUid` from token claims.
2. **Document Identifier Validation**:
   - `isValidDocumentIdentifier(clubId) === true`
   - `isValidDocumentIdentifier(initialOwnerUid) === true`
   - `isValidDocumentIdentifier(provisioningId) === true`
   - If any identifier fails -> FAIL CLOSED (`ERROR_INVALID_IDENTIFIER`).
3. **Request Field Validation & Normalization**:
   - Validate `name` (non-empty string), `level in ["T1", "T2", "T3"]`.
   - Apply explicit normalization rules and compute deterministic `requestFingerprint`.

### Phase 2: Inside the SAME Firestore Transaction (`db.runTransaction`)
The transaction must perform reads in this strict order to eliminate TOCTOU race conditions:

#### Read 1: Transactional Requester Authorization Read
- Execute: `transaction.get(users/{requestingSuperAdminUid})`
- Assert document exists.
- Assert canonical requester status is active: `user.status in ["Active", "ACTIVE"]`.
- Assert canonical requester role is privileged: `user.role === "SUPERADMIN"`.
- Canonical requester must still be ACTIVE (`status in ["Active", "ACTIVE"]`) AND `role === "SUPERADMIN"` inside transaction.
- If missing, inactive, or not SUPERADMIN -> FAIL CLOSED (`ERROR_UNAUTHORIZED_REQUESTING_PRINCIPAL`).
- Pre-transaction user read alone is NOT sufficient authorization.

#### Read 2: Transactional Initial Owner Eligibility Read
- Execute: `transaction.get(users/{initialOwnerUid})`
- Assert document exists and has valid non-empty identity.
- Assert canonical owner status is active: `owner.status in ["Active", "ACTIVE"]`.
- If missing, inactive, or invalid -> FAIL CLOSED (`ERROR_INVALID_OWNER`).
- Pre-transaction owner read alone is NOT sufficient authorization.

#### Read 3: Read Provisioning Audit Document
- Execute: `transaction.get(proClubProvisioningAudits/{provisioningId})`

---

### Branch A: IF AUDIT EXISTS (Replay & Idempotency Verification)

1. **Verify Request Fingerprint & Identity Binding**:
   - Compare `audit.provisioningId === provisioningId`.
   - Compare `audit.requestFingerprint === requestFingerprint` (and/or exact match of `audit.normalizedRequest` snapshot).
   - Also verify `audit.clubId === clubId`, `audit.ownerUid === initialOwnerUid`, `audit.requestingSuperAdminUid === requestingSuperAdminUid`.
   - If `provisioningId` matches but `requestFingerprint` (or any bound initial field) differs:
     FAIL CLOSED (`ERROR_PROVISIONING_ID_CONFLICT`).
2. **Read Canonical Resources Inside Transaction**:
   - Read `proClubs/{clubId}` and `proClubs/{clubId}/members/{initialOwnerUid}`.
   - Execute: `transaction.get(proClubs/{clubId})`
   - Execute: `transaction.get(proClubs/{clubId}/members/{initialOwnerUid})`
3. **Verify Canonical Resources Integrity**:
   - Both documents must exist.
   - `proClubs/{clubId}` status must be `"ACTIVE"`.
   - Membership payload must exactly match `{ authorizationRole: "OWNER", status: "ACTIVE" }`.
   - Club and OWNER evidence must agree with the audit record.
   - If club is missing, OWNER is missing, or payload mismatches -> FAIL CLOSED (`ERROR_PROVISIONING_INTEGRITY`).
   - **Post-Provisioning Club Edits**: Current club profile fields (`name`, `shortName`, `level`, `country`, `logoUrl`) are NOT required to remain identical forever, because legitimate post-provisioning club edits may occur.
   - **Audit alone can never prove successful provisioning.**
4. **Idempotent Return**:
   - Only when audit, Club, and OWNER all match completely:
     RETURN existing COMPLETED result idempotently.
     NO WRITE is performed.

---

### Branch B: IF AUDIT DOES NOT EXIST (New Provisioning Verification)

1. **Target Club Precondition Read**:
   - Execute: `transaction.get(proClubs/{clubId})`
   - If `proClubs/{clubId}` exists -> FAIL CLOSED (`ERROR_CLUB_EXISTS`).
2. **Owner Membership Precondition Read**:
   - Execute: `transaction.get(proClubs/{clubId}/members/{initialOwnerUid})`
   - If `proClubs/{clubId}/members/{initialOwnerUid}` exists without a valid matching provisioning audit:
     FAIL CLOSED (`ERROR_PROVISIONING_INTEGRITY`).
     (Orphan or pre-existing OWNER membership without valid audit evidence is an integrity violation).
3. **Atomic 3-Way Multi-Document Write (SAME Server Transaction)**:
   - `transaction.set(proClubs/{clubId}, clubPayload)`
   - `transaction.set(proClubs/{clubId}/members/{initialOwnerUid}, membershipPayload)`
   - `transaction.set(proClubProvisioningAudits/{provisioningId}, auditPayload)`
   - All three documents are committed together in the **SAME SERVER TRANSACTION**.
   - If any write or precondition fails, the entire transaction rolls back with zero state mutation.

---

## 8. Replay Safety, Conflict, and Takeover Prevention

- **Exact Decision Ordering**:
  Audit check and replay verification occur before club-exists conflict detection, ensuring exact completed retries return idempotently before triggering conflicts.
- **Binding Replay Detection**:
  `provisioningId` and deterministic request fingerprint bind together `clubId`, `ownerUid`, and `requestingSuperAdminUid` along with all initial creation parameters.
- **Same Request Retry**:
  A repeated request with identical `provisioningId`, `clubId`, `ownerUid`, and `requestingSuperAdminUid` (and matching normalized `requestFingerprint`) verifies matching audit evidence and existing canonical resources, returning idempotently without duplicate writes.
- **Post-Provisioning Edits Preservation**:
  Legitimate post-provisioning club profile updates (e.g. updating logo, country, or names) do not invalidate idempotent retries, because replay integrity checks assert club active status and sovereign OWNER membership rather than demanding mutable profile fields remain frozen forever.
- **Provisioning ID Conflict**:
  Reusing an existing `provisioningId` with altered `clubId`, `ownerUid`, or `requestingSuperAdminUid` fails closed immediately (`ERROR_PROVISIONING_ID_CONFLICT`).
  Reusing an existing `provisioningId` with a different `requestFingerprint` fails closed immediately (`ERROR_PROVISIONING_ID_CONFLICT`).
- **Existing Club Takeover Prevention**:
  If `proClubs/{clubId}` exists without matching valid audit evidence, provisioning fails closed (`ERROR_CLUB_EXISTS`). Existing clubs cannot be taken over, overwritten, or re-parented.
- **Existing Owner Replacement Prevention**:
  An existing club cannot have its owner replaced or overwritten.
- **Orphan Membership Integrity**:
  Pre-existing OWNER membership without valid provisioning audit fails closed (`ERROR_PROVISIONING_INTEGRITY`).
- **Cross-Club Tenant Isolation**:
  A provisioning transaction for `clubId_A` cannot touch, mutate, or reference paths under `clubId_B`.

---

## 9. Required Implementation Succession

To ensure preservation and zero production risk, Pro Club provisioning must follow strict succession slices:

1. **Slice 1: Provisioning Contract Freeze** *(Current slice)*:
   - Freeze requirements, decision B rationale, requesting authority, 3-way atomicity, exact audit schema, invariants, and test coverage in documentation and contract tests only.
   - No production code or Firestore Rules changes.
2. **Slice 2: Trusted Control-Plane Service Implementation**:
   - Implement trusted backend service with Admin SDK and 3-way transactional atomicity.
   - Unit and emulator integration tests proving atomic success, audit creation, and fail-closed rollbacks.
3. **Slice 3: Provisioning Audit Verification and Observability**:
   - Independent verification of immutable audit logs in `proClubProvisioningAudits/{provisioningId}`.
4. **Slice 4: Privileged Control-Plane UI / API Integration**:
   - Dedicated authenticated management interface restricted to verified ACTIVE SUPERADMIN principals.

No client write path to `proClubs/{clubId}`, `members/{uid}` with `OWNER`, or `proClubProvisioningAudits/{provisioningId}` will ever be opened.
