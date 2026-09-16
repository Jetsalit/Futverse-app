# Pro Club Membership Discovery V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authenticated Pro Club user discover their canonical Pro Club association without typing a raw club reference, while preserving the existing authority bridge as the only access decision.

**Architecture:** Add a minimal reverse discovery pointer at `users/{uid}/proClubMemberships/{clubId}` containing only `schemaVersion: 1` and `clubId`. The pointer is discovery evidence only: every candidate club must still be resolved through the existing canonical Pro Club organization authority path before the workspace can open. Pointer creation must occur atomically with the canonical membership creation path; browser users may read their own pointers but may never create, update, or delete them directly.

**Tech Stack:** React 19, TypeScript, Firebase Client SDK, Firebase Admin SDK, Firestore Security Rules, Firebase Emulator, Node test runner.

**Spec:** Frozen Membership Discovery V1 contract agreed in chat on 2026-09-16.

## Global Constraints

- Exact baseline: `main@861302beca3abe98d987778d7aa382c98fa83658`.
- Feature branch: `feat/pro-club-membership-discovery-v1`.
- No production deployment or production data write in implementation/acceptance work.
- No Cloud Functions dependency for production discovery; Spark production remains Hosting-only.
- No hard-coded `tnsu-lampang`, Maxcoach UID, club name, role, or staff role.
- Discovery pointer stores exactly `schemaVersion` and `clubId`; it stores no authorization role, staff role, membership status, club status, or display name.
- A pointer never grants access. `resolveProClubOrganizationAuthority` / Organization Runtime remains the authorization boundary.
- Browser clients may never create/update/delete discovery pointers.
- Staff pointer creation must be in the same atomic approval batch as approval proof + membership + staff + invite consumption.
- Initial-owner pointer creation must be in the same trusted provisioning transaction as club + owner membership + provisioning audit.
- Existing-member backfill is a separate controlled create-only production gate after code/rules deployment and verification; it is not part of implementation writes.
- Preserve manual onboarding/reference fallback for zero valid memberships and recovery cases.
- Multiple valid clubs must not auto-select arbitrarily; the user must choose by authoritative club name.
- Do not modify Match, Attendance, Weekly Training, Squad behavior or schemas.
- TDD is mandatory: observe RED before each production-code slice.

---

### Task 1: Membership Discovery Firestore Contract

**Files:**
- Create: `tests/proClubMembershipDiscoveryV1.rules.test.ts`
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: existing `users/{uid}` account status, `proClubs/{clubId}/members/{uid}`, approval proof and onboarding claim/invite relationships.
- Produces: own-user list/get access to `users/{uid}/proClubMemberships/{clubId}` and a create rule that is valid only as part of the canonical fresh approval transaction.

- [ ] **Step 1: Write failing emulator tests**

Cover these exact behaviors:

```ts
// ACTIVE target can list/get own seeded pointers.
// Another user cannot get/list target pointers.
// INACTIVE target cannot read own pointers.
// Target cannot create/update/delete its own pointer.
// Reviewer cannot create a pointer alone.
// Approved staff flow must create exact pointer { schemaVersion: 1, clubId }.
```

- [ ] **Step 2: Run RED**

Run:

```powershell
firebase emulators:exec --project demo-futverse-pro-club-membership-discovery --only firestore "node --import tsx --test --test-concurrency=1 tests/proClubMembershipDiscoveryV1.rules.test.ts"
```

Expected RED reason: current Rules do not allow own pointer discovery and current approval batch does not create the pointer. The test must fail for missing feature behavior, not syntax/import errors.

- [ ] **Step 3: Implement minimal Rules contract**

Add a nested match under the canonical user document:

```text
/users/{uid}/proClubMemberships/{clubId}
```

Required stored shape:

```ts
{
  schemaVersion: 1,
  clubId: clubId,
}
```

Read requirements:
- signed in;
- `request.auth.uid == uid`;
- canonical `users/{uid}` is active.

Write requirements:
- no browser update/delete;
- create only when the same atomic request also creates the canonical ACTIVE membership from the existing fresh approval proof relationship;
- pointer `clubId` must equal the document id/path clubId;
- no extra keys.

- [ ] **Step 4: Run GREEN rules test**

Run the exact command from Step 2. Expected: PASS.

- [ ] **Step 5: Run existing Pro Club Rules/onboarding regression**

```powershell
npm run test:pro-club-emulator-regression
```

Expected: PASS with no weakening of existing tenant/identity boundaries.

- [ ] **Step 6: Commit Task 1**

Commit only the new Rules test and `firestore.rules`.

---

### Task 2: Staff Approval Atomic Pointer Writers

**Files:**
- Modify: `src/lib/firestore/proClubOnboardingRepository.ts`
- Modify: `src/lib/firestore/proClubSuperAdminOnboardingControlRepository.ts`
- Test: `tests/proClubMembershipDiscoveryV1.rules.test.ts`
- Test/regression: `tests/proClubOnboardingRuntime.test.ts`

**Interfaces:**
- Consumes: `clubId`, approved `claim.userId`, existing approval proof/member/staff/invite batch.
- Produces: pointer write at `users/{claim.userId}/proClubMemberships/{clubId}` in the same `writeBatch.commit()`.

- [ ] **Step 1: Extend RED test to require pointer after normal reviewer approval**

Expected pointer:

```ts
assert.deepEqual(pointer, {
  schemaVersion: 1,
  clubId: CLUB,
});
```

- [ ] **Step 2: Run RED and observe missing pointer**

Use Task 1 emulator command. Expected: failure because repository approval has not yet added the pointer.

- [ ] **Step 3: Add minimal normal-reviewer batch write**

Within `decision === "APPROVED"`, add exactly one `batch.set` for the target user's discovery pointer. Do not add any status/role/name fields.

- [ ] **Step 4: Run GREEN**

Run Task 1 emulator command and `npm run test:pro-club-emulator-regression`.

- [ ] **Step 5: Add RED coverage for SuperAdmin approval path**

The same approved staff outcome must create the same exact pointer shape.

- [ ] **Step 6: Observe RED**

Run the targeted SuperAdmin onboarding-control test that exercises `reviewClaim`.

- [ ] **Step 7: Add minimal SuperAdmin batch pointer write**

Add the pointer to the existing approval batch only. Rejection creates no pointer.

- [ ] **Step 8: Run GREEN and commit Task 2**

No unrelated onboarding changes.

---

### Task 3: Initial Owner Provisioning Atomic Pointer

**Files:**
- Modify: `functions/src/proClubProvisioning/service.ts`
- Modify: `tests/firestore.pro-club-provisioning.service.test.ts`

**Interfaces:**
- Consumes: normalized `clubId` and `initialOwnerUid` inside the trusted provisioning transaction.
- Produces: exact owner discovery pointer in the same transaction as club + owner membership + audit.

- [ ] **Step 1: Add RED assertion to provisioning integration test**

After successful provisioning, assert:

```ts
const pointerSnap = await firestore
  .collection("users")
  .doc("user-owner-123")
  .collection("proClubMemberships")
  .doc("club-lampang")
  .get();

assert.deepEqual(pointerSnap.data(), {
  schemaVersion: 1,
  clubId: "club-lampang",
});
```

Also assert replay performs no pointer mutation beyond validating canonical state.

- [ ] **Step 2: Run RED**

Run the existing provisioning emulator test command used by the repository. Expected failure: pointer document absent.

- [ ] **Step 3: Implement one additional transaction write**

Create `users/{initialOwnerUid}/proClubMemberships/{clubId}` inside the existing new-provisioning transaction. Keep the pointer exact and minimal.

For replay, read/validate the expected pointer as integrity evidence; do not write on replay.

- [ ] **Step 4: Run GREEN provisioning tests**

Existing club/member/audit invariants must remain green.

- [ ] **Step 5: Commit Task 3**

No provisioning API/request schema change.

---

### Task 4: Membership Discovery Read Adapter

**Files:**
- Create: `src/lib/firestore/proClubMembershipDiscoveryRepository.ts`
- Create: `tests/proClubMembershipDiscoveryRepository.unit.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ProClubMembershipDiscovery {
  clubId: string;
}

export async function loadOwnProClubMembershipDiscoveries(
  uid: string,
): Promise<ProClubMembershipDiscovery[]>;
```

The production repository must bind the read to Firebase Auth's current UID and return only validated document IDs/clubIds.

- [ ] **Step 1: Write RED tests for parsing and auth drift**

Cases:
- exact `{schemaVersion: 1, clubId}` accepted;
- mismatched document id / clubId rejected;
- extra authorization fields do not become authority inputs;
- malformed ids fail closed;
- auth changes during read return a safe failure.

- [ ] **Step 2: Observe RED**

Run only the new repository test.

- [ ] **Step 3: Implement minimal repository**

Use direct Firestore client SDK collection read under the authenticated user's own user document. No Functions and no collection-group scan.

- [ ] **Step 4: Run GREEN and TypeScript**

```powershell
node --import tsx --test tests/proClubMembershipDiscoveryRepository.unit.test.ts
npm run lint
```

- [ ] **Step 5: Commit Task 4**

---

### Task 5: Portal Auto-Open and Multi-Club Choice

**Files:**
- Modify: `src/components/pro-club/ProClubPortal.tsx`
- Create or modify targeted Pro Club portal UI test under `tests/`.

**Interfaces:**
- Consumes: remembered session candidate first, then `loadOwnProClubMembershipDiscoveries(uid)`.
- Uses: existing `selectProClub(clubId)` and Organization Runtime authority bridge.
- Produces: zero/one/many valid-authority UX.

- [ ] **Step 1: Write RED UI contract tests**

Required behavior:
- remembered valid club remains fastest path but still resolves canonical authority;
- with no remembered club, one discovered candidate that resolves authority opens workspace automatically;
- stale pointer that fails authority is ignored as access and cannot open workspace;
- zero valid candidates leaves onboarding/manual workspace recovery available;
- more than one valid club shows a selector using authoritative `organizationName`, never raw club id as the primary label;
- no candidate is selected merely because it appears first in discovery results.

- [ ] **Step 2: Observe RED**

Run only the targeted Portal tests.

- [ ] **Step 3: Implement minimal discovery orchestration**

Do not reimplement authority logic. For every pointer candidate call the existing runtime/authority path. Store only UX state needed to display the valid candidates.

- [ ] **Step 4: Run GREEN targeted UI tests**

Then run existing Pro Club Team Dashboard/Direct Entry regressions and `npm run lint`.

- [ ] **Step 5: Commit Task 5**

---

### Task 6: Controlled Existing-Membership Backfill Tool (No Production Execution)

**Files:**
- Create: `scripts/backfillProClubMembershipDiscoveryLocal.ts`
- Create: `tests/proClubMembershipDiscoveryBackfill.unit.test.ts`
- Add one explicit npm script only if repository conventions require it.

**Interfaces:**
- Input: explicit `--club-id` and `--uid` only; trusted local operator identity remains environment-bound.
- Reads: canonical user + club + `proClubs/{clubId}/members/{uid}`.
- Writes: create-only exact pointer, only in live mode.

- [ ] **Step 1: Write RED safety tests**

Cases:
- dry-run performs zero writes;
- wrong project fails before reads/writes;
- missing/inactive canonical user fails;
- missing canonical membership fails;
- mismatched/existing malformed pointer fails closed;
- live create writes exact two-field pointer only;
- no update/delete behavior exists.

- [ ] **Step 2: Observe RED**

Run targeted unit test.

- [ ] **Step 3: Implement minimal trusted-local backfill command**

No broad collection scan and no automatic backfill. One explicitly identified `(uid, clubId)` per invocation.

- [ ] **Step 4: Run GREEN**

Do not execute against production during this task.

- [ ] **Step 5: Commit Task 6**

---

### Task 7: Final Local Acceptance and Independent Review

**Files:** No source edits unless a gate reveals an in-scope defect.

- [ ] **Step 1: Provenance and exact-scope gate**

Verify branch, base SHA ancestry, worktree clean, and changed files belong only to Membership Discovery V1.

- [ ] **Step 2: Run targeted new tests**

Run Rules, onboarding writer, provisioning, repository, Portal, and backfill tests.

- [ ] **Step 3: Run existing regressions**

Run Pro Club emulator regression, Team Dashboard/Direct Entry targeted UI regression, `npm run lint`, and `npm run build`.

- [ ] **Step 4: Verify no production action**

Acceptance output must explicitly record:

```text
DEPLOY=NO
PRODUCTION_DATA_WRITE=NO
FUNCTIONS_DEPLOY=NO
FIRESTORE_RULES_DEPLOY=NO
```

- [ ] **Step 5: Independent exact-HEAD review**

Reviewer checks data-contract shape, Rules privilege boundary, atomic writer coverage, authority revalidation, multi-club behavior, and backfill safety.

Only after exact-HEAD review passes may a PR be prepared. Rules deployment, code deployment, and the one-user Lampang/Maxcoach backfill remain later controlled production gates and are not bundled into implementation acceptance.

## Self-Review

- Spec coverage: discovery data shape, own-user read, no client write, atomic staff and owner creation, authority revalidation, zero/one/many UX, fallback flow, and controlled existing-member backfill are all mapped to explicit tasks.
- Placeholder scan: no TBD/TODO/unspecified implementation steps remain.
- Type consistency: discovery result exposes only `clubId`; authorization continues through existing organization authority types and is intentionally absent from discovery types.
