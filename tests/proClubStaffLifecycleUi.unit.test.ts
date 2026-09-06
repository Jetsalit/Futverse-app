import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  getProClubStaffReactivationUiPolicyV1,
} from "../src/lib/proClubStaffManagementUi.ts";

const inactiveMember = {
  schemaVersion: 1 as const,
  clubId: "club-1",
  userId: "staff-1",
  displayName: "Staff One",
  authorizationRole: "MEMBER" as const,
  membershipStatus: "INACTIVE" as const,
  staffRole: "ANALYST" as const,
  staffStatus: "INACTIVE" as const,
};

test("owner and admin can reactivate eligible inactive member", () => {
  assert.equal(getProClubStaffReactivationUiPolicyV1({ actorRole: "OWNER", actorUid: "owner", entry: inactiveMember }).canReactivate, true);
  assert.equal(getProClubStaffReactivationUiPolicyV1({ actorRole: "ADMIN", actorUid: "admin", entry: inactiveMember }).canReactivate, true);
});

test("self, owner target, admin-target-by-admin and LEFT are blocked", () => {
  assert.equal(getProClubStaffReactivationUiPolicyV1({ actorRole: "OWNER", actorUid: "staff-1", entry: inactiveMember }).canReactivate, false);
  assert.equal(getProClubStaffReactivationUiPolicyV1({ actorRole: "OWNER", actorUid: "owner", entry: { ...inactiveMember, authorizationRole: "OWNER" } }).canReactivate, false);
  assert.equal(getProClubStaffReactivationUiPolicyV1({ actorRole: "ADMIN", actorUid: "admin", entry: { ...inactiveMember, authorizationRole: "ADMIN" } }).canReactivate, false);
  assert.equal(getProClubStaffReactivationUiPolicyV1({
    actorRole: "OWNER",
    actorUid: "owner",
    entry: { ...inactiveMember, membershipStatus: "LEFT", staffStatus: "LEFT" },
  }).canReactivate, false);
});

test("lifecycle UI uses repositories only, confirms reactivation and keeps LEFT terminal", () => {
  const source = readFileSync("src/components/pro-club/StaffLifecycleReview.tsx", "utf8");
  assert.match(source, /proClubStaffLifecycleReviewRepository\.loadReview\(clubId, uid\)/);
  assert.match(source, /proClubStaffManagementRepository\.manageStaff/);
  assert.match(source, /action: \{ type: "REACTIVATE" \}/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /Left is terminal in Staff Management V1/);
  assert.doesNotMatch(source, /firebase\/firestore/);
  assert.doesNotMatch(source, /collection\(/);
  assert.doesNotMatch(source, /updateDoc|setDoc|deleteDoc/);
});

test("portal exposes lifecycle review only inside reviewer branch", () => {
  const source = readFileSync("src/components/pro-club/ProClubPortal.tsx", "utf8");
  assert.match(source, /import StaffLifecycleReview from "\.\/StaffLifecycleReview"/);
  assert.match(source, /isProClubReviewer\(authority\)[\s\S]*?<StaffLifecycleReview clubId=\{clubId\} uid=\{uid\} actorRole=\{authority\.membershipAuthorizationRole\}/);
});

test("functions index wires lifecycle review with App Check and constrained resources", () => {
  const source = readFileSync("functions/src/index.ts", "utf8");
  assert.match(source, /export const loadProClubStaffLifecycleReviewV1 = onCall/);
  assert.match(source, /createProClubStaffLifecycleReviewServiceV1/);
  assert.match(source, /createFirestoreProClubStaffLifecycleReviewSourceV1/);
  assert.match(source, /executeLoadProClubStaffLifecycleReviewCallableV1/);
  const block = source.slice(source.indexOf("export const loadProClubStaffLifecycleReviewV1"));
  assert.match(block, /enforceAppCheck: true/);
  assert.match(block, /timeoutSeconds: 15/);
  assert.match(block, /memory: "256MiB"/);
  assert.match(block, /concurrency: 10/);
  assert.match(block, /maxInstances: 5/);
});
