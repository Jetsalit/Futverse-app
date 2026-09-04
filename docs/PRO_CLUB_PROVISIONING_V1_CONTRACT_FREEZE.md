# FutVerse Pro Club Provisioning V1 Contract Freeze

Status: FROZEN ARCHITECTURAL CONTRACT (DOCUMENTATION AND CONTRACT TESTS ONLY)

## 1. Baseline and Scope

- Workspace: `C:\Users\asus\Documents\Futverse-app`
- Branch: `main`
- Base Commit / HEAD: `03866126fb98e034a6898b4ff6de99a8210e9f29`
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
| **Security** | **POOR**: Opens top-level `proClubs/{clubId}` and `members/{uid}` with `OWNER` role to client write operations from browsers. | **SUPERIOR**: Keeps client `firestore.rules` default-deny (`allow list, create, update, delete: if false;`) for `proClubs/{clubId}`. Zero client write surface. |
| **Privilege Escalation Risk** | **HIGH**: Relies on browser-presented credentials. If a client user account is compromised or sets `users/{uid}.role = 'SUPERADMIN'`, or via XSS/token theft, the browser client could inject arbitrary OWNER memberships or overwrite clubs. Violates `users.role != tenant authority`. | **MINIMAL**: Untrusted browser sessions cannot write root clubs or grant OWNER. Provisioning is accessible only through authenticated, privileged control-plane service endpoints with server-side authorization. |
| **Atomicity** | **FRAGILE**: Client batch writes (`writeBatch`) depend on client network stability, browser execution lifecycle, and complex cross-document Rules assertions (`existsAfter`, `getAfter`). Browser interruptions can cause failed transactions without robust server rollback. | **PROVABLE & ROBUST**: Server-side Firestore transactions (`db.runTransaction`) execute atomically in a managed environment with true ACID guarantees, reliable rollback, and immediate consistency. |
| **Auditability** | **POOR**: Rules cannot capture rich server telemetry (service account, caller IP, request trace, correlation ID) without polluting domain schemas. | **COMPREHENSIVE**: Complete, tamper-proof server-side audit trails stored in dedicated audit log collections outside domain payloads. |
| **Blast Radius** | **HIGH**: Modifies sensitive root collection rules in `firestore.rules`, creating risk of regression for existing onboarding and read protections. | **ZERO**: `firestore.rules` remains completely untouched. No client rule changes required. |
| **Credential Exposure** | **HIGH**: Requires elevated permissions or admin tokens accessible to client applications. | **MINIMAL**: Service credentials stay strictly in the trusted server/cloud environment; client holds zero provisioning credentials. |
| **Production Deployment Complexity** | **HIGH**: Intertwines client rule updates with client application releases. | **LOW & ISOLATED**: Provisioning service is an isolated backend function/service that deploys independently without client side-effects. |
| **Architecture Consistency** | **CONFLICTING**: Contradicts FutVerse principles: `users.role != tenant authority`, `support presentation != authenticated provisioning actor`, and `proClubs/{clubId}` closed to client create. | **FULLY CONSISTENT**: Strictly upholds all FutVerse governing invariants and preserves exact runtime schemas. |

### Contract Decision

**OPTION B (Trusted Backend / Service Provisioning Boundary) IS SELECTED.**

Option B is chosen because it is the safest and most architecturally sound approach, not the easiest.
It completely avoids opening client-side Firestore write rules for root tenant creation and OWNER elevation, preserving zero attack surface on the client.

---

## 4. Requesting Principal vs Execution Authority

A fundamental architectural distinction governs Pro Club Provisioning V1:

```text
REQUESTING AUTHORITY != EXECUTION AUTHORITY
```

### 4.1 Requesting Authority (Who May Authorize Provisioning)

The only valid requesting authority for Pro Club Provisioning V1 is an **authenticated, explicitly ACTIVE platform SUPERADMIN**:

1. Verified Firebase authenticated UID (`request.auth.uid` or verified decoded Firebase ID token UID).
2. Backend re-reads canonical `users/{requestingUid}` directly from Firestore server-side before execution.
3. Explicitly ACTIVE account state: `status` must equal `"Active"` or `"ACTIVE"` (matching current canonical account policy).
4. Canonical privileged role: `role` must strictly equal `"SUPERADMIN"`.

**Forbidden for Requesting Authority:**
- `currentUser` presentation (client-side state is untrusted presentation only).
- Support presentation ("Work As Staff" / impersonation).
- `DATA_ADMIN`, `ADMIN`, `COACH`, `PLAYER`, `SCOUT`, `PARENT`, or `USER`.
- Academy Membership authority (`academies/{academyId}`).
- Football staff role (`staffRole`, e.g. `HEAD_COACH`).
- Requested role (`requestedRole`).
- Arbitrary caller-supplied UID in request payload.
- Client-claimed `SUPERADMIN` (must be re-read from canonical `users/{uid}` server-side).
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
- Backend must re-read the canonical requesting user server-side immediately before the transaction and fail closed if identity, status, or role does not match.

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
21. **Server Logs Alone Are Not Canonical Audit Evidence**
    Application server runtime logs do not satisfy the canonical provisioning contract. Provisioning audit evidence must be persisted as an immutable Firestore document in `proClubProvisioningAudits/{provisioningId}`.
22. **Replay Safety and Takeover Prevention**
    - Duplicate provisioning requests for the same `clubId` fail closed.
    - Replay with the same `provisioningId` and different parameters fails closed.
    - Existing clubs cannot be taken over or overwritten.
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

### 6.2 Target Firestore Paths

The single server-side atomic transaction writes exactly three documents:

1. **Club Root Document**:
   `proClubs/{clubId}`
2. **Initial Owner Membership Document**:
   `proClubs/{clubId}/members/{initialOwnerUid}`
3. **Dedicated Immutable Provisioning Audit Document**:
   `proClubProvisioningAudits/{provisioningId}`

### 6.3 Exact Target Document Payloads

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
  "createdAt": "2026-09-04T00:00:00.000Z",
  "status": "COMPLETED"
}
```

**Audit Immutability & Security Rules:**
- `schemaVersion`: strictly `1`.
- `provisioningId`: matches the document ID and unique request token.
- `clubId`: exact canonical club ID.
- `ownerUid`: exact canonical owner UID.
- `requestingSuperAdminUid`: exact authenticated active SuperAdmin principal.
- `createdAt`: server-authoritative timestamp.
- `status`: `"COMPLETED"`.
- Audit documents are **immutable** in V1: no update or delete is permitted.
- Audit collection is **closed to client access** (`allow read, write: if false;` or omitted from client Rules).

---

## 7. Exact Provisioning Decision Order & Atomic Execution Lifecycle

The server-side provisioning execution must follow this exact decision order within a single Firestore transaction:

### Step 1: Verify Authenticated Requesting Principal
- Verify caller has valid authenticated Firebase token (`requestingSuperAdminUid`).
- Re-read canonical `users/{requestingSuperAdminUid}` directly from Firestore server-side.
- Assert `user.status in ["Active", "ACTIVE"]`.
- Assert `user.role === "SUPERADMIN"`.
- If any assertion fails -> FAIL CLOSED (`ERROR_UNAUTHORIZED_REQUESTING_PRINCIPAL`).

### Step 2: Validate Document Identifiers
- `isValidDocumentIdentifier(clubId) === true`
- `isValidDocumentIdentifier(initialOwnerUid) === true`
- `isValidDocumentIdentifier(provisioningId) === true`
- If any identifier fails -> FAIL CLOSED (`ERROR_INVALID_IDENTIFIER`).

### Step 3: Read Provisioning Audit
- Read `proClubProvisioningAudits/{provisioningId}`.

### Step 4: IF AUDIT EXISTS (Replay & Integrity Verification):
- **4.1 Verify Audit Tuple**:
  - `audit.provisioningId === provisioningId`
  - `audit.clubId === clubId`
  - `audit.ownerUid === initialOwnerUid`
  - `audit.requestingSuperAdminUid === requestingSuperAdminUid`
  - If tuple does not match -> FAIL CLOSED (`ERROR_PROVISIONING_ID_CONFLICT`).
- **4.2 Verify Canonical Resources Exist and Match**:
  - Read `proClubs/{clubId}` and `proClubs/{clubId}/members/{initialOwnerUid}`.
  - Both documents must exist.
  - `proClubs/{clubId}` status must be `"ACTIVE"`.
  - Membership payload must exactly match `{ authorizationRole: "OWNER", status: "ACTIVE" }`.
  - Club and OWNER evidence must agree with the audit record.
  - If club is missing, OWNER is missing, or payload mismatches -> FAIL CLOSED (`ERROR_PROVISIONING_INTEGRITY`).
  - **Audit alone can never prove successful provisioning.**
- **4.3 Idempotent Return**:
  - Only when audit, Club, and OWNER all match completely:
    RETURN existing COMPLETED result idempotently.
    NO WRITE is performed.

### Step 5: IF AUDIT DOES NOT EXIST (New Provisioning Verification):
- **5.1 Verify Target Club Precondition**:
  - Read `proClubs/{clubId}`.
  - If `proClubs/{clubId}` exists -> FAIL CLOSED (`ERROR_CLUB_EXISTS`).
- **5.2 Verify Owner Membership Precondition**:
  - Read `proClubs/{clubId}/members/{initialOwnerUid}`.
  - If `proClubs/{clubId}/members/{initialOwnerUid}` exists without a valid matching provisioning audit:
    FAIL CLOSED (`ERROR_PROVISIONING_INTEGRITY`).
    (Orphan or pre-existing OWNER membership without valid audit evidence is an integrity violation).
- **5.3 Verify Canonical Owner User Document**:
  - Read `users/{initialOwnerUid}`.
  - User document must exist, have valid non-empty identity, and valid active account state (`status in ["Active", "ACTIVE"]`).
  - If user document does not exist or is invalid -> FAIL CLOSED (`ERROR_INVALID_OWNER`).

### Step 6: Atomic 3-Way Multi-Document Write (Same Server Transaction):
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
  `provisioningId` binds together `clubId`, `ownerUid`, and `requestingSuperAdminUid`.
- **Same Request Retry**:
  A repeated request with identical `provisioningId`, `clubId`, `ownerUid`, and `requestingSuperAdminUid` verifies matching audit evidence and existing canonical resources, returning idempotently without duplicate writes.
- **Provisioning ID Conflict**:
  Reusing an existing `provisioningId` with altered `clubId`, `ownerUid`, or `requestingSuperAdminUid` fails closed immediately (`ERROR_PROVISIONING_ID_CONFLICT`).
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
