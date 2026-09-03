import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Timestamp } from "firebase/firestore";
import { createOrganizationResolutionResult } from "../src/lib/organizationRuntimeSelection";

test("mounted Pro Club screens preserve confirmation, errors and canonical runtime entry", async (t) => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost:3000" });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const at = Timestamp.now();
  const code = `FUT-PC-${"A".repeat(24)}`;
  let uid = "coach";
  let membership = false;
  let reviewer = true;
  let fail = false;
  let decided = false;
  let claimStatus: "PENDING" | "APPROVED" | "REJECTED" | null = null;
  let reviewCalls = 0;
  const resolutionRequests: Array<{ uid: string; organizationId: string }> = [];
  const claim = () => ({ schemaVersion: 1, type: "PRO_CLUB_STAFF_JOIN", userId: "coach", clubId: "club-a",
    inviteCode: code, membershipAuthorizationRole: "MEMBER", staffRole: "HEAD_COACH", status: claimStatus ?? "PENDING", createdAt: at, updatedAt: at });
  const invite = () => ({ schemaVersion: 1, inviteCode: code, clubId: "club-a", targetUid: "coach",
    membershipAuthorizationRole: "MEMBER", staffRole: "HEAD_COACH", status: membership ? "CONSUMED" : "ACTIVE",
    createdAt: at, updatedAt: at, createdBy: "owner", updatedBy: "owner", expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000) });
  const authority = () => ({ organizationType: "PRO_CLUB", organizationId: "club-a", userId: uid,
    organizationName: "Test United", organizationStatus: "ACTIVE", organizationLevel: "T3", membershipStatus: "ACTIVE",
    membershipAuthorizationRole: reviewer ? "OWNER" : "MEMBER", hasMembershipAuthority: true, staffRole: "HEAD_COACH" });
  const repo = {
    async inspectInvitation() { if (fail) throw new Error("raw firestore secret"); return { invite: invite(), claim: claimStatus ? claim() : null, membershipExists: membership }; },
    async requestMembership() { claimStatus = "PENDING"; return claim(); },
    async loadWorkspace() { return authority(); },
    async loadPending() { return decided ? [] : [{ claimId: `coach_PRO_CLUB_${code}`, claim: claim(), invite: invite() }]; },
    async reviewClaim(_club: string, _claim: string, decision: "APPROVED" | "REJECTED") {
      ++reviewCalls; if (fail) throw new Error("raw firestore secret");
      claimStatus = decision; decided = true;
    },
  };
  const mocks = [
    t.mock.module("../src/contexts/AuthContext.tsx", { namedExports: { useAuth: () => ({ actualUser: { uid }, currentUser: { uid } }) } }),
    t.mock.module("../src/lib/firestore/proClubOnboardingRepository.ts", { namedExports: {
      proClubOnboardingRepository: repo,
      isProClubReviewer: (value: ReturnType<typeof authority>) => value.membershipAuthorizationRole === "OWNER",
    } }),
    t.mock.module("../src/lib/organizationRuntimeProClubAuthorityBridge.ts", { namedExports: {
      resolveProClubRuntimeAuthority: async (request: { uid: string; organizationId: string }) => {
        resolutionRequests.push(request);
        return { sourceState: "FOUND", runtimeResult: createOrganizationResolutionResult(request, "AUTHORIZED") };
      },
    } }),
  ];
  const { default: StaffOnboarding } = await import("../src/components/pro-club/StaffOnboarding");
  const { default: PendingStaffRequests } = await import("../src/components/pro-club/PendingStaffRequests");
  const { default: ProClubPortal } = await import("../src/components/pro-club/ProClubPortal");
  const { OrganizationRuntimeProvider } = await import("../src/contexts/OrganizationRuntimeContext");
  let root: Root | null = null;
  const container = dom.window.document.getElementById("root")!;
  const text = () => container.textContent ?? "";
  async function mount(element: React.ReactNode) {
    await act(async () => { root?.unmount(); });
    root = createRoot(container);
    await act(async () => { root!.render(element); });
  }
  async function click(label: string) {
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent === label);
    assert.ok(button, `Missing button: ${label}`);
    await act(async () => { button.click(); });
  }
  async function inspect() {
    // Submit the form; repository mocking isolates rendering from Firestore.
    await act(async () => { container.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
  }
  try {
    await t.test("staff submits an invitation and sees PENDING without duplicate submit controls", async () => {
      await mount(<StaffOnboarding uid={uid} onOpenClub={() => {}} />);
      await inspect();
      await click("Confirm request to join ");
      assert.match(text(), /Request sent — awaiting review/);
      assert.match(text(), /PENDING/);
      assert.doesNotMatch(text(), /Confirm request to join/);
    });
    await t.test("approved status opens the existing provider selection and workspace", async () => {
      membership = true; claimStatus = "APPROVED"; reviewer = false;
      await mount(<OrganizationRuntimeProvider><ProClubPortal onBack={() => {}} onLogout={() => {}} /></OrganizationRuntimeProvider>);
      await inspect();
      await click("Open club workspace");
      assert.equal(resolutionRequests.length, 1);
      assert.equal(resolutionRequests[0].uid, uid);
      assert.equal(resolutionRequests[0].organizationId, "club-a");
      assert.match(text(), /Test United/);
      assert.match(text(), /MEMBER/);
      assert.doesNotMatch(text(), /Pending staff requests|Confirm approval|Confirm rejection/);
    });
    await t.test("approval requires confirmation and cancel does not write", async () => {
      membership = false; claimStatus = "PENDING"; decided = false;
      await mount(<PendingStaffRequests clubId="club-a" uid="owner" />);
      await click("Approve"); assert.equal(reviewCalls, 0);
      await click("Cancel"); assert.equal(reviewCalls, 0);
      await click("Approve"); await click("Confirm approval");
      assert.equal(reviewCalls, 1); assert.match(text(), /Request approved/); assert.match(text(), /all caught up/);
    });
    await t.test("rejection requires a second click and refreshes to success", async () => {
      decided = false;
      await mount(<PendingStaffRequests clubId="club-a" uid="owner" />);
      await click("Reject"); assert.equal(reviewCalls, 1);
      assert.match(text(), /new invitation/);
      await click("Confirm rejection"); assert.equal(reviewCalls, 2);
      assert.match(text(), /Request rejected/); assert.match(text(), /all caught up/);
    });
    await t.test("failed decision shows safe error without reporting success", async () => {
      decided = false; fail = true;
      await mount(<PendingStaffRequests clubId="club-a" uid="owner" />);
      await click("Approve"); await click("Confirm approval");
      assert.ok(container.querySelector('[role="alert"]'));
      assert.doesNotMatch(text(), /raw firestore|secret|Request approved/);
    });
    await t.test("invite lookup errors are readable without backend details", async () => {
      await mount(<StaffOnboarding uid={uid} onOpenClub={() => {}} />);
      await inspect();
      assert.match(text(), /Check your connection/);
      assert.doesNotMatch(text(), /raw firestore|secret/);
    });
  } finally {
    await act(async () => { root?.unmount(); });
    mocks.forEach((mock) => mock.restore());
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  }
});
