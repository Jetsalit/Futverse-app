import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";
import { createEmptyTrainingSession } from "../src/components/pro-club/operations/weeklyTrainingDraftComposerModel";

function authority(staffRole: "GK_COACH" | "HEAD_COACH"): ProClubOrganizationAuthority {
  return {
    organizationType: "PRO_CLUB" as const,
    organizationId: "club-a",
    organizationName: "Test United",
    organizationLevel: "T1",
    organizationStatus: "ACTIVE",
    userId: staffRole === "GK_COACH" ? "gk-1" : "head-1",
    membershipAuthorizationRole: "MEMBER",
    membershipStatus: "ACTIVE",
    hasMembershipAuthority: true,
    staffRole,
  };
}

function drill(id: string, createdBy: string) {
  return {
    id,
    title: `Submitted ${id}`,
    category: "Goalkeeping",
    created_by: createdBy,
    organizationType: "PRO_CLUB" as const,
    organizationId: "club-a",
    is_shared: false,
    canvas_data: {
      fieldType: "half",
      elements: [],
      lines: [],
    },
  };
}

function submission(
  id: string,
  status: "SUBMITTED" | "IN_REVIEW" | "NEEDS_REVISION" | "APPROVED" = "IN_REVIEW",
  submittedBy = "gk-1",
  reviewerUid = "head-1",
) {
  const reviewerRole = reviewerUid === "td-1" ? "TECHNICAL_DIRECTOR" as const : "HEAD_COACH" as const;
  const reviewTimestamp = new Date("2026-10-06T00:01:00.000Z");
  return {
    id,
    schemaVersion: 1 as const,
    organizationType: "PRO_CLUB" as const,
    organizationId: "club-a",
    sourceDrillId: "drill-gk-exact",
    sourceCreatorUid: submittedBy,
    sourceCreatorRoleAtSubmission: submittedBy === "head-1" ? "HEAD_COACH" as const : "GK_COACH" as const,
    submittedBy,
    submittedAt: new Date("2026-10-06T00:00:00.000Z"),
    snapshot: {
      details: {
        title: "Exact keeper transition",
        category: "Goalkeeping",
        duration: "45 minutes",
        ageGroup: "U17",
        phase: "Recovery",
        trainingMethod: "Circuit",
        coachingPoints: "Set feet before contact.",
        description: "Recover to the goal line.",
        date: "2026-10-06",
      },
      visualType: "BOTH" as const,
      canvasData: {
        fieldType: "half",
        elements: [],
        lines: [],
      },
      previewImage: "data:image/png;base64,SUBMITTED_IMAGE",
    },
    effectiveStatus: status,
    review: status === "SUBMITTED" ? null : {
      schemaVersion: 1 as const,
      submissionId: id,
      status,
      reviewerUid,
      reviewerRole,
      reviewNote: status === "NEEDS_REVISION" ? "Please add the recovery phase." : status === "APPROVED" ? "Approved for training." : null,
      reviewStartedAt: reviewTimestamp,
      reviewStartedBy: reviewerUid,
      revisionRequestedAt: status === "NEEDS_REVISION" ? reviewTimestamp : null,
      revisionRequestedBy: status === "NEEDS_REVISION" ? reviewerUid : null,
      approvedAt: status === "APPROVED" ? reviewTimestamp : null,
      approvedBy: status === "APPROVED" ? reviewerUid : null,
      updatedAt: reviewTimestamp,
      updatedBy: reviewerUid,
    },
  };
}

const textSubmission = {
  submissionId: "text-submission-1",
  schemaVersion: 1 as const,
  authorUid: "assistant-1",
  authorRole: "ASSISTANT_COACH" as const,
  workType: "TRAINING_SUPPORT" as const,
  title: "Existing text submission",
  summary: "Existing text content remains visible.",
  module: "TRAINING" as const,
  targetPlanId: null,
  targetSessionDate: null,
  status: "IN_REVIEW" as const,
  reviewerUid: "head-1",
  reviewerRole: "HEAD_COACH" as const,
  reviewNote: null,
  createdAt: new Date("2026-10-06T00:00:00.000Z"),
  createdBy: "assistant-1",
  updatedAt: new Date("2026-10-06T00:01:00.000Z"),
  updatedBy: "head-1",
  submittedAt: new Date("2026-10-06T00:00:30.000Z"),
  submittedBy: "assistant-1",
  reviewStartedAt: new Date("2026-10-06T00:01:00.000Z"),
  reviewStartedBy: "head-1",
  revisionRequestedAt: null,
  revisionRequestedBy: null,
  approvedAt: null,
  approvedBy: null,
};

async function createDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const values: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Node: dom.window.Node,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const original = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries(values)) {
    original.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const container = dom.window.document.getElementById("root")!;
  const { createRoot } = await import("react-dom/client");
  let root: Root | null = null;
  return {
    dom,
    container,
    async render(element: React.ReactNode) {
      if (root) await act(async () => root?.unmount());
      root = createRoot(container);
      await act(async () => root!.render(element));
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    },
    async click(label: string) {
      const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === label);
      assert.ok(button, `Missing button: ${label}`);
      await act(async () => button.click());
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    },
    async setTextarea(id: string, value: string) {
      const field = container.querySelector<HTMLTextAreaElement>(`#${id}`);
      assert.ok(field, `Missing text area: ${id}`);
      const setter = Object.getOwnPropertyDescriptor(
        dom.window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      assert.ok(setter);
      field.focus();
      setter.call(field, value);
      await act(async () => {
        field.dispatchEvent(new dom.window.InputEvent("input", {
          bubbles: true,
          data: value,
          inputType: "insertText",
        }));
        field.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      });
    },
    text() {
      return container.textContent ?? "";
    },
    cleanup() {
      if (root) void act(() => root?.unmount());
      for (const [name, descriptor] of original) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
      dom.window.close();
    },
  };
}

test("Pro Club drill submission UI retains the selected drill and review controls", async (t) => {
  let myDrills = [drill("drill-gk-exact", "gk-1")];
  let drillInbox: ReturnType<typeof submission>[] = [];
  let reviewerInboxDenied = false;
  let staffInbox = [textSubmission];
  const created: Array<{ clubId: string; submissionId: string; sourceDrillId: string }> = [];
  const staffDecisions: Array<{ action: "APPROVED" | "NEEDS_REVISION"; submissionId: string; note: string }> = [];
  const drillDecisions: Array<{ action: "APPROVED" | "NEEDS_REVISION"; submissionId: string; note: string }> = [];
  const mockModule = (specifier: string, exports: Record<string, unknown>) =>
    t.mock.module(
      specifier,
      { exports } as unknown as Parameters<typeof t.mock.module>[1],
    );
  mockModule("../src/hooks/useDrillDatabase.ts", {
    useDrillDatabase: () => ({
      myDrills,
      drills: myDrills,
      academyDrills: [],
      saveDrill: async () => true,
      updateDrill: async () => true,
      deleteDrill: async () => undefined,
      currentUser: "test-owner",
      authenticatedActor: "test-owner",
      isAssisted: false,
    }),
  });
  mockModule("../src/components/TacticBoard.tsx", { default: () => null });
  mockModule("../src/lib/firestore/proClubDrillSubmissionsRepository.ts", {
    createProClubDrillSubmission: async (clubId: string, submissionId: string, sourceDrillId: string) => {
      created.push({ clubId, submissionId, sourceDrillId });
    },
    listMyProClubDrillSubmissions: async () => drillInbox,
    listProClubDrillSubmissionsForReview: async () => {
      if (reviewerInboxDenied) throw new Error("Exact active Technical Governance authority is required.");
      return drillInbox;
    },
    beginProClubDrillSubmissionReview: async () => undefined,
    requestProClubDrillSubmissionRevision: async (_clubId: string, submissionId: string, note: string) => {
      drillDecisions.push({ action: "NEEDS_REVISION", submissionId, note });
    },
    approveProClubDrillSubmission: async (_clubId: string, submissionId: string, note: string) => {
      drillDecisions.push({ action: "APPROVED", submissionId, note });
    },
  });
  mockModule("../src/lib/firestore/proClubStaffSubmissionsRepository.ts", {
    approveProClubStaffSubmission: async (_clubId: string, submissionId: string, note: string) => {
      staffDecisions.push({ action: "APPROVED", submissionId, note });
    },
    beginProClubStaffSubmissionReview: async () => undefined,
    createProClubStaffSubmissionDraft: async () => undefined,
    listMyProClubStaffSubmissions: async () => [],
    listProClubStaffSubmissionsForReview: async () => staffInbox,
    requestProClubStaffSubmissionRevision: async (_clubId: string, submissionId: string, note: string) => {
      staffDecisions.push({ action: "NEEDS_REVISION", submissionId, note });
    },
    submitProClubStaffSubmission: async () => undefined,
    updateProClubStaffSubmissionDraftContent: async () => undefined,
  });

  const { default: GKWorkspace } = await import(
    "../src/components/pro-club/operations/ProClubGKTrainingWorkspace"
  );
  const { default: DrillPicker } = await import(
    "../src/components/pro-club/operations/ProClubTrainingDrillReferencePicker"
  );
  const { default: WeeklyTrainingDraftComposer } = await import(
    "../src/components/pro-club/operations/WeeklyTrainingDraftComposer"
  );
  const { default: StaffSubmissions } = await import(
    "../src/components/pro-club/operations/ProClubStaffSubmissions"
  );

  const runtime = await createDom();
  try {
    await t.test("sendsSelectedGkDrillWithoutRepicking", async () => {
      myDrills = [drill("drill-gk-exact", "gk-1")];
      await runtime.render(<GKWorkspace authority={authority("GK_COACH")} />);
      await runtime.click("Send Work");
      assert.equal(created.at(-1)?.clubId, "club-a");
      assert.match(created.at(-1)?.submissionId ?? "", /^drill_submission_/);
      assert.equal(created.at(-1)?.sourceDrillId, "drill-gk-exact");
    });

    await t.test("sendsSelectedHeadCoachDrillWithoutRepicking", async () => {
      myDrills = [drill("drill-head-exact", "head-1")];
      await runtime.render(
        <DrillPicker authority={authority("HEAD_COACH")} onClose={() => {}} onSelectDrill={() => {}} />,
      );
      await runtime.click("Send Work");
      assert.equal(created.at(-1)?.sourceDrillId, "drill-head-exact");

      const session = createEmptyTrainingSession();
      const initialDraft = {
        weekStartDate: "",
        squadLabel: "First Team",
        mainObjective: "",
        sessions: [{
          ...session,
          blocks: [{ ...session.blocks[0], drillReference: "drill-head-exact" }],
        }],
      };
      await runtime.render(
        <WeeklyTrainingDraftComposer authority={authority("HEAD_COACH")} initialDraft={initialDraft} />,
      );
      await runtime.click("Send Work");
      assert.equal(created.at(-1)?.sourceDrillId, "drill-head-exact");
    });

    await t.test("showsEffectiveSubmittedStatusWithoutReviewDoc", async () => {
      drillInbox = [submission("drill-submitted", "SUBMITTED")];
      staffInbox = [];
      await runtime.render(<StaffSubmissions authority={authority("HEAD_COACH")} />);
      assert.match(runtime.text(), /SUBMITTED|Submitted/);
      assert.match(runtime.text(), /Exact keeper transition/);
      const card = runtime.container.querySelector('[data-testid="pro-club-drill-submission-card"]');
      assert.ok(card);
      const buttonText = [...card.querySelectorAll("button")]
        .map((button) => button.textContent ?? "")
        .join(" ");
      assert.doesNotMatch(buttonText, /Approve|Request changes/);
    });

    await t.test("headCoachAuthorSeesOwnSubmissionWhenTechnicalDirectorIsAuthority", async () => {
      reviewerInboxDenied = true; // Technical Governance is held by TD B, not this Head Coach author.
      drillInbox = [submission("head-own-submission", "SUBMITTED", "head-1")];
      staffInbox = [];
      await runtime.render(<StaffSubmissions authority={authority("HEAD_COACH")} />);
      reviewerInboxDenied = false;
      const card = runtime.container.querySelector('[data-submission-id="head-own-submission"]');
      assert.ok(card, "The Head Coach must retain their own submitted drill history.");
      assert.match(card.textContent ?? "", /SUBMITTED|Submitted/);
      assert.doesNotMatch([...card.querySelectorAll("button")].map((button) => button.textContent).join(" "), /Begin review|Approve|Request changes/);
      reviewerInboxDenied = false;
    });

    await t.test("headCoachAuthorSeesOwnNeedsRevisionHistory", async () => {
      reviewerInboxDenied = true;
      drillInbox = [submission("head-needs-revision", "NEEDS_REVISION", "head-1", "td-1")];
      staffInbox = [];
      await runtime.render(<StaffSubmissions authority={authority("HEAD_COACH")} />);
      reviewerInboxDenied = false;
      const card = runtime.container.querySelector('[data-submission-id="head-needs-revision"]');
      assert.ok(card, "The Head Coach must see their revision history while TD B is current authority.");
      assert.match(card.textContent ?? "", /Changes Requested/);
      assert.match(card.textContent ?? "", /Please add the recovery phase\./);
      assert.doesNotMatch([...card.querySelectorAll("button")].map((button) => button.textContent).join(" "), /Begin review|Approve|Request changes/);
      reviewerInboxDenied = false;
    });

    await t.test("headCoachAuthorSeesOwnApprovedHistory", async () => {
      reviewerInboxDenied = true;
      drillInbox = [submission("head-approved", "APPROVED", "head-1", "td-1")];
      staffInbox = [];
      await runtime.render(<StaffSubmissions authority={authority("HEAD_COACH")} />);
      reviewerInboxDenied = false;
      const card = runtime.container.querySelector('[data-submission-id="head-approved"]');
      assert.ok(card, "The Head Coach must see their approved history while TD B is current authority.");
      assert.match(card.textContent ?? "", /Approved/);
      assert.match(card.textContent ?? "", /Approved for training\./);
      assert.doesNotMatch([...card.querySelectorAll("button")].map((button) => button.textContent).join(" "), /Begin review|Approve|Request changes/);
      reviewerInboxDenied = false;
    });

    await t.test("opensSnapshotBeforeReviewDecision", async () => {
      drillInbox = [submission("drill-in-review", "IN_REVIEW")];
      staffInbox = [];
      await runtime.render(<StaffSubmissions authority={authority("HEAD_COACH")} />);
      const card = runtime.container.querySelector('[data-testid="pro-club-drill-submission-card"]');
      assert.ok(card);
      const beforeOpenButtons = [...card.querySelectorAll("button")]
        .map((button) => button.textContent ?? "")
        .join(" ");
      assert.doesNotMatch(beforeOpenButtons, /Approve|Request changes/);
      await runtime.click("Open submitted drill");
      assert.match(runtime.text(), /Submitted work/);
      assert.match(runtime.text(), /Approve/);
      assert.match(runtime.text(), /Request changes/);
      await runtime.setTextarea("drill-review-note-drill-in-review", "Exact board reviewed");
      assert.equal(runtime.container.querySelector<HTMLTextAreaElement>("#drill-review-note-drill-in-review")?.value, "Exact board reviewed");
      assert.equal([...card.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Approve"))?.disabled, false);
      await runtime.click("Approve");
      assert.deepEqual(drillDecisions.at(-1), {
        action: "APPROVED",
        submissionId: "drill-in-review",
        note: "Exact board reviewed",
      });
      await runtime.click("Open submitted drill");
      await runtime.setTextarea("drill-review-note-drill-in-review", "Please update the recovery step");
      await runtime.click("Request changes");
      assert.deepEqual(drillDecisions.at(-1), {
        action: "NEEDS_REVISION",
        submissionId: "drill-in-review",
        note: "Please update the recovery step",
      });
    });

    await t.test("showsAllPresentDrillDetails", async () => {
      drillInbox = [submission("drill-details", "IN_REVIEW")];
      staffInbox = [];
      await runtime.render(<StaffSubmissions authority={authority("HEAD_COACH")} />);
      await runtime.click("Open submitted drill");
      for (const value of ["45 minutes", "U17", "Recovery", "Circuit", "Set feet before contact.", "Recover to the goal line.", "2026-10-06"]) {
        assert.match(runtime.text(), new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
    });

    await t.test("showsLegacyPreviewFallback", async () => {
      reviewerInboxDenied = false;
      drillInbox = [];
      staffInbox = [textSubmission];
      await runtime.render(<StaffSubmissions authority={authority("HEAD_COACH")} />);
      assert.match(runtime.text(), /Submitted work preview unavailable for this legacy submission\./);
    });

    await t.test("preservesExistingTextSubmissionReviewControls", async () => {
      drillInbox = [];
      staffInbox = [textSubmission];
      await runtime.render(<StaffSubmissions authority={authority("HEAD_COACH")} />);
      assert.ok([...runtime.container.querySelectorAll("button")].some((button) => button.textContent?.includes("ขอแก้ไข")));
      assert.ok([...runtime.container.querySelectorAll("button")].some((button) => button.textContent?.includes("อนุมัติ")));
      await runtime.setTextarea("review-note-text-submission-1", "Reviewed existing work");
      await runtime.click("อนุมัติ");
      assert.deepEqual(staffDecisions.at(-1), {
        action: "APPROVED",
        submissionId: "text-submission-1",
        note: "Reviewed existing work",
      });
      await runtime.setTextarea("review-note-text-submission-1", "Please revise the text");
      await runtime.click("ขอแก้ไข");
      assert.deepEqual(staffDecisions.at(-1), {
        action: "NEEDS_REVISION",
        submissionId: "text-submission-1",
        note: "Please revise the text",
      });
    });
  } finally {
    runtime.cleanup();
  }
});
