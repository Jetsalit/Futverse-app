import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { Root } from "react-dom/client";
import { Timestamp } from "firebase/firestore";
import type { PendingStaffRequest } from "../src/lib/firestore/proClubOnboardingRepository";

test("P2 mounted reviewer identity cards and confirmations", async (t) => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost:3000" });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import("react-dom/client");
  const at = Timestamp.now();
  function request(name: string, prefix: string): PendingStaffRequest {
    const uid = name.toLowerCase(), code = `FUT-PC-${prefix}${"A".repeat(23)}`;
    return {
      claimId: `${uid}_PRO_CLUB_${code}`,
      claim: { schemaVersion: 1, type: "PRO_CLUB_STAFF_JOIN", userId: uid, clubId: "club-a", inviteCode: code,
        claimantIdentity: { displayName: `${name} Coach`, email: `${uid}@example.test` }, membershipAuthorizationRole: "MEMBER",
        staffRole: "HEAD_COACH", status: "PENDING", createdAt: at, updatedAt: at },
      invite: { schemaVersion: 1, inviteCode: code, clubId: "club-a", targetUid: uid, membershipAuthorizationRole: "MEMBER",
        staffRole: "HEAD_COACH", status: "ACTIVE", createdAt: at, createdBy: "owner", updatedAt: at, updatedBy: "owner",
        expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000) },
    };
  }
  let requests: PendingStaffRequest[] = [];
  let readDenied = false;
  const decisions: unknown[][] = [];
  const repositoryMock = t.mock.module("../src/lib/firestore/proClubOnboardingRepository.ts", { namedExports: {
    proClubOnboardingRepository: {
      async loadPending() { if (readDenied) throw new Error("denied"); return requests; },
      async reviewClaim(...args: unknown[]) { decisions.push(args); requests = []; },
    },
  } });
  const { default: PendingStaffRequests } = await import("../src/components/pro-club/PendingStaffRequests");
  const container = dom.window.document.getElementById("root")!;
  let root: Root | null = null;
  const text = () => container.textContent ?? "";
  async function mount(uid = "owner") {
    await act(async () => { root?.unmount(); });
    root = createRoot(container);
    await act(async () => { root!.render(<PendingStaffRequests clubId="club-a" clubName="Test United" uid={uid} />); });
  }
  async function click(parent: Element, label: string) {
    const button = [...parent.querySelectorAll("button")].find((item) => item.textContent === label);
    assert.ok(button, `Missing ${label}`);
    await act(async () => { button.click(); });
  }
  try {
    for (const reviewer of ["owner", "admin"]) {
      await t.test(`${reviewer} can distinguish same-role, same-time and same-suffix applicants by identity`, async () => {
        requests = [request("Ada", "A"), request("Bea", "B")];
        await mount(reviewer);
        const cards = container.querySelectorAll("article");
        assert.equal(cards.length, 2);
        for (const [index, name] of ["Ada", "Bea"].entries()) {
          assert.match(cards[index].textContent!, new RegExp(`${name} Coach`));
          assert.ok(cards[index].textContent!.includes(`${name.toLowerCase()}@example.test`));
          assert.ok(cards[index].textContent!.includes(`Account reference: ${name.toLowerCase()}`));
          assert.match(cards[index].textContent!, /Head coach.*Invitation ending AAAAAA.*Requested/);
        }
      });
    }
    for (const [label, decision] of [["Approve", "APPROVED"], ["Reject", "REJECTED"]] as const) {
      await t.test(`${label} confirmation repeats the selected claimant, role and club before the exact claim decision`, async () => {
        requests = [request("Ada", "A"), request("Bea", "B")];
        const expectedClaim = requests[1].claimId;
        const before = decisions.length;
        await mount(); await click(container.querySelectorAll("article")[1], label);
        const confirmation = container.querySelector('[role="group"][aria-label="Confirm staff decision"]')!;
        assert.match(confirmation.textContent!, /Bea Coach/);
        assert.match(confirmation.textContent!, /bea@example.test/);
        assert.match(confirmation.textContent!, /Account reference: bea/);
        assert.match(confirmation.textContent!, /Head coach · Test United/);
        assert.doesNotMatch(confirmation.textContent!, /Ada Coach|ada@example.test/);
        assert.equal(decisions.length, before);
        await click(confirmation, decision === "APPROVED" ? "Confirm approval" : "Confirm rejection");
        assert.deepEqual(decisions.at(-1), ["club-a", expectedClaim, decision, "owner"]);
      });
    }
    for (const identity of [undefined, null, {}, { displayName: " \t" }, { email: 42 }, { displayName: "Ada", unexpected: "field" }]) {
      await t.test(`unavailable identity ${JSON.stringify(identity)} explicitly blocks both decisions`, async () => {
        requests = [request("Ada", "A")];
        requests[0].claim.claimantIdentity = identity as PendingStaffRequest["claim"]["claimantIdentity"];
        const before = decisions.length;
        await mount(); assert.match(text(), /Identity unavailable/);
        assert.doesNotMatch(text(), /Ada Coach|ada@example.test/);
        const card = container.querySelector("article")!;
        for (const label of ["Approve", "Reject"]) {
          const button = [...card.querySelectorAll("button")].find((item) => item.textContent === label)!;
          assert.equal(button.disabled, true);
          await click(card, label);
        }
        assert.equal(decisions.length, before);
        assert.equal(container.querySelector('[aria-label="Confirm staff decision"]'), null);
      });
    }
    for (const identity of [{ displayName: "Ada Coach" }, { email: "ada@example.test" }]) {
      await t.test(`single canonical identity ${JSON.stringify(identity)} retains its claimant reference`, async () => {
        requests = [request("Ada", "A")]; requests[0].claim.claimantIdentity = identity;
        await mount();
        assert.ok(text().includes(Object.values(identity)[0]));
        assert.match(text(), /Account reference: ada/);
        assert.doesNotMatch(text(), /Identity unavailable/);
      });
    }
    await t.test("denied pending read renders no claimant data or decision controls", async () => {
      requests = [request("Ada", "A")]; readDenied = true;
      await mount("outsider");
      assert.ok(container.querySelector('[role="alert"]'));
      assert.equal(container.querySelector("article"), null);
      assert.doesNotMatch(text(), /Ada Coach|ada@example.test/);
    });
  } finally {
    await act(async () => { root?.unmount(); }); repositoryMock.restore();
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  }
});
