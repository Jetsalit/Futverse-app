import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { Root } from "react-dom/client";
import { Timestamp } from "firebase/firestore";

test("rendered SuperAdmin control selects clubs, keeps invite/reject, and accepts the selected pending claimant", async (t) => {
  const dom = new JSDOM("<!doctype html><div id=\"root\"></div>", {
    url: "http://localhost:3000",
  });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }

  const actorUid = "superadmin-ui";
  const clubs = [
    { id: "club-a", name: "Alpha United", status: "ACTIVE" },
    { id: "club-b", name: "Beta City", status: "ACTIVE" },
  ];
  const pendingByClub: Record<string, Array<{
    claimId: string;
    claim: {
      userId: string;
      clubId: string;
      staffRole: string;
      status: string;
      claimantIdentity: { displayName: string; email: string };
    };
    invite: { inviteCode: string };
  }>> = {
    "club-a": [{
      claimId: "claim-a",
      claim: {
        userId: "claimant-a",
        clubId: "club-a",
        staffRole: "HEAD_COACH",
        status: "PENDING",
        claimantIdentity: { displayName: "Ada Coach", email: "ada@example.test" },
      },
      invite: { inviteCode: "invite-a" },
    }],
    "club-b": [{
      claimId: "claim-b",
      claim: {
        userId: "claimant-b",
        clubId: "club-b",
        staffRole: "FITNESS_COACH",
        status: "PENDING",
        claimantIdentity: { displayName: "Ben Coach", email: "ben@example.test" },
      },
      invite: { inviteCode: "invite-b" },
    }],
  };
  const loads: unknown[][] = [];
  const decisions: unknown[][] = [];
  const invitations: unknown[][] = [];
  const repository = {
    async issueInvitation(...args: unknown[]) {
      invitations.push(args);
      return {
        inviteCode: "created-invite",
        targetUid: "invite-target",
        staffRole: "HEAD_COACH",
      };
    },
    async loadPending(clubId: string, uid: string) {
      loads.push([clubId, uid]);
      return pendingByClub[clubId] ?? [];
    },
    async reviewClaim(...args: unknown[]) {
      decisions.push(args);
    },
  };

  const moduleMocks = [
    t.mock.module("../src/contexts/AuthContext.tsx", {
      namedExports: {
        useAuth: () => ({
          actualUser: {
            uid: actorUid,
            role: "SUPERADMIN",
            status: "ACTIVE",
            name: "Pilot SuperAdmin",
          },
        }),
      },
    }),
    t.mock.module("../src/contexts/SuperAdminSupportContext.tsx", {
      namedExports: { useSuperAdminSupport: () => ({ isSupportActive: false }) },
    }),
    t.mock.module("../src/lib/firebase.ts", {
      namedExports: { db: { testDb: true } },
    }),
    t.mock.module("firebase/firestore", {
      namedExports: {
        Timestamp,
        collection: (_db: unknown, ...path: string[]) => path,
        getDocsFromServer: async (path: string[]) => {
          assert.deepEqual(path, ["proClubs"]);
          return {
            docs: clubs.map((club) => ({
              id: club.id,
              data: () => ({ name: club.name, status: club.status }),
            })),
          };
        },
      },
    }),
    t.mock.module("../src/lib/firestore/proClubSuperAdminOnboardingControlRepository.ts", {
      namedExports: { proClubSuperAdminOnboardingControlRepository: repository },
    }),
  ];

  const { createRoot } = await import("react-dom/client");
  const { default: ProClubStaffOnboardingControlPlane } = await import(
    "../src/components/superadmin/ProClubStaffOnboardingControlPlane"
  );
  const container = dom.window.document.getElementById("root")!;
  let root: Root | null = null;

  const flush = async () => {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  };
  const button = (label: string, parent: ParentNode = container) => {
    const found = [...parent.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    assert.ok(found, `Expected rendered ${label} button`);
    return found as HTMLButtonElement;
  };
  const selectClub = async (clubId: string) => {
    const select = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Pro Club"]',
    );
    assert.ok(select, "Pro Club selector should render");
    await act(async () => {
      select.value = clubId;
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
  };
  const refresh = async () => {
    await act(async () => { button("Refresh").click(); });
    await flush();
  };

  try {
    root = createRoot(container);
    await act(async () => {
      root!.render(<ProClubStaffOnboardingControlPlane onClose={() => {}} />);
    });
    await flush();

    const clubSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Pro Club"]',
    );
    assert.ok(clubSelect, "Pro Club selector should render");
    assert.deepEqual(
      [...clubSelect.options].map((option) => [option.value, option.textContent?.trim()]),
      [
        ["", "Select a Pro Club…"],
        ["club-a", "Alpha United"],
        ["club-b", "Beta City"],
      ],
    );

    await selectClub("club-a");
    await refresh();
    assert.deepEqual(loads, [["club-a", actorUid]]);
    let row = container.querySelector("article");
    assert.ok(row);
    assert.match(row.textContent ?? "", /Ada Coach/);
    assert.match(row.textContent ?? "", /ada@example\.test/);
    assert.match(row.textContent ?? "", /Role: HEAD_COACH/);
    assert.match(row.textContent ?? "", /Club: Alpha United · club-a/);
    assert.match(row.textContent ?? "", /Status: Pending/);

    await act(async () => { button("Reject", row!).click(); });
    assert.deepEqual(decisions, [["club-a", "claim-a", "REJECTED", actorUid]]);
    assert.equal(container.querySelector("article"), null);

    await refresh();
    assert.ok(container.querySelector("article"), "Club A queue can be refreshed again");
    await selectClub("club-b");
    assert.equal(container.querySelector("article"), null, "Club A claimant must clear immediately on club change");
    assert.match(container.textContent ?? "", /Select a Pro Club and refresh the queue/);

    await refresh();
    row = container.querySelector("article");
    assert.ok(row);
    assert.match(row.textContent ?? "", /Ben Coach/);
    assert.match(row.textContent ?? "", /ben@example\.test/);
    assert.match(row.textContent ?? "", /Role: FITNESS_COACH/);
    assert.match(row.textContent ?? "", /Club: Beta City · club-b/);
    assert.match(row.textContent ?? "", /Status: Pending/);

    await act(async () => { button("Accept", row!).click(); });
    assert.deepEqual(decisions.at(-1), ["club-b", "claim-b", "APPROVED", actorUid]);
    assert.equal(pendingByClub["club-b"][0].claim.userId, "claimant-b");
    assert.equal(container.querySelector("article"), null);

    const uidInput = container.querySelector<HTMLInputElement>(
      'input[placeholder="exact registered account UID"]',
    );
    assert.ok(uidInput, "existing Invite control input should remain");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(uidInput, "invite-target");
      uidInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await act(async () => { button("Create staff invitation").click(); });
    assert.deepEqual(invitations, [[{
      clubId: "club-b",
      targetUid: "invite-target",
      staffRole: "HEAD_COACH",
    }, actorUid]]);
    assert.match(container.textContent ?? "", /Invitation ready/);
  } finally {
    await act(async () => { root?.unmount(); });
    for (const moduleMock of moduleMocks) moduleMock.restore();
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  }
});
