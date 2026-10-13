import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-pro-club-drill-submissions";
const CLUB_ID = "club-a";
const OTHER_CLUB_ID = "club-b";
const GK_UID = "gk-1";
const OTHER_GK_UID = "gk-2";
const HEAD_UID = "head-1";
const TD_UID = "td-1";
const SUBMISSION_ID = "submission-1";

let testEnv: RulesTestEnvironment;

function dbFor(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

async function seed(entries: Array<[string, DocumentData]>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)));
  });
}

function user(uid: string): DocumentData {
  return { uid, role: "USER", status: "ACTIVE" };
}

function club(): DocumentData {
  return { name: "Club A", level: "T3", status: "ACTIVE" };
}

function drill(createdBy: string, organizationId = CLUB_ID): DocumentData {
  return {
    title: "Keeper transition",
    category: "Goalkeeping",
    created_by: createdBy,
    organizationType: "PRO_CLUB",
    organizationId,
    canvas_data: { elements: [], lines: [], fieldType: "half" },
    previewImage: "data:image/png;base64,PHOTO_A",
  };
}

function photoOnlyDrill(createdBy: string): DocumentData {
  const value = drill(createdBy);
  delete value.canvas_data;
  return value;
}

function boardOnlyDrill(createdBy: string): DocumentData {
  const value = drill(createdBy);
  delete value.previewImage;
  return value;
}

const RICH_DETAILS: DocumentData = {
  title: "Keeper transition",
  category: "Goalkeeping",
  duration: "60 minutes",
  ageGroup: "U15",
  phase: "Recovery",
  trainingMethod: "Circuit",
  coachingPoints: "Set feet before the shot.",
  description: "A recovery and positioning drill.",
  date: "2026-10-06",
};

function richDrill(): DocumentData {
  return { ...drill(GK_UID), ...RICH_DETAILS };
}

function richEvidence(details: DocumentData = RICH_DETAILS): DocumentData {
  return evidence({
    sourceDrillId: "drill-rich",
    snapshot: {
      details,
      visualType: "BOTH",
      canvasData: { elements: [], lines: [], fieldType: "half" },
      previewImage: "data:image/png;base64,PHOTO_A",
    },
  });
}

function evidence(overrides: DocumentData = {}): DocumentData {
  return {
    schemaVersion: 1,
    organizationType: "PRO_CLUB",
    organizationId: CLUB_ID,
    sourceDrillId: "drill-a",
    sourceCreatorUid: GK_UID,
    sourceCreatorRoleAtSubmission: "GK_COACH",
    submittedBy: GK_UID,
    submittedAt: serverTimestamp(),
    snapshot: {
      details: { title: "Keeper transition", category: "Goalkeeping" },
      visualType: "BOTH",
      canvasData: { elements: [], lines: [], fieldType: "half" },
      previewImage: "data:image/png;base64,PHOTO_A",
    },
    ...overrides,
  };
}

function withoutField(value: DocumentData, field: string): DocumentData {
  const copy = { ...value };
  delete copy[field];
  return copy;
}

function reviewCreate(submissionId = SUBMISSION_ID): DocumentData {
  return {
    schemaVersion: 1,
    submissionId,
    status: "IN_REVIEW",
    reviewerUid: HEAD_UID,
    reviewerRole: "HEAD_COACH",
    reviewNote: null,
    reviewStartedAt: serverTimestamp(),
    reviewStartedBy: HEAD_UID,
    revisionRequestedAt: null,
    revisionRequestedBy: null,
    approvedAt: null,
    approvedBy: null,
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_UID,
  };
}

function reviewUpdate(status: "NEEDS_REVISION" | "APPROVED", note = "Reviewed") {
  return status === "APPROVED"
    ? {
        status,
        reviewNote: note,
        approvedAt: serverTimestamp(),
        approvedBy: HEAD_UID,
        updatedAt: serverTimestamp(),
        updatedBy: HEAD_UID,
      }
    : {
        status,
        reviewNote: note,
        revisionRequestedAt: serverTimestamp(),
        revisionRequestedBy: HEAD_UID,
        updatedAt: serverTimestamp(),
        updatedBy: HEAD_UID,
      };
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulatorHost, "Rules tests must run through the Firestore Emulator.");
  const separator = emulatorHost.lastIndexOf(":");
  const host = emulatorHost.slice(0, separator);
  const port = Number(emulatorHost.slice(separator + 1));
  assert.ok(host && Number.isInteger(port), "Invalid FIRESTORE_EMULATOR_HOST.");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port,
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed([
    [`users/${GK_UID}`, user(GK_UID)],
    [`users/${OTHER_GK_UID}`, user(OTHER_GK_UID)],
    [`users/${HEAD_UID}`, user(HEAD_UID)],
    [`users/${TD_UID}`, user(TD_UID)],
    [`proClubs/${CLUB_ID}`, club()],
    [`proClubs/${OTHER_CLUB_ID}`, { ...club(), name: "Club B" }],
    [`proClubs/${CLUB_ID}/members/${GK_UID}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/members/${OTHER_GK_UID}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/members/${HEAD_UID}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/members/${TD_UID}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${OTHER_CLUB_ID}/members/${HEAD_UID}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/staff/${GK_UID}`, { staffRole: "GK_COACH", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/staff/${OTHER_GK_UID}`, { staffRole: "GK_COACH", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/staff/${HEAD_UID}`, { staffRole: "HEAD_COACH", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/staff/${TD_UID}`, { staffRole: "TECHNICAL_DIRECTOR", status: "ACTIVE" }],
    [`proClubs/${OTHER_CLUB_ID}/staff/${HEAD_UID}`, { staffRole: "HEAD_COACH", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/technicalGovernance/current`, {
      schemaVersion: 1,
      status: "ACTIVE",
      authorityUid: HEAD_UID,
      authorityRole: "HEAD_COACH",
    }],
    [`proClubs/${OTHER_CLUB_ID}/technicalGovernance/current`, {
      schemaVersion: 1,
      status: "ACTIVE",
      authorityUid: HEAD_UID,
      authorityRole: "HEAD_COACH",
    }],
    [`drills/drill-a`, drill(GK_UID)],
    [`drills/drill-b`, drill(OTHER_GK_UID)],
    [`drills/drill-other-club`, drill(GK_UID, OTHER_CLUB_ID)],
    [`drills/drill-head`, drill(HEAD_UID)],
    [`drills/drill-photo-only`, photoOnlyDrill(GK_UID)],
    [`drills/drill-board-only`, boardOnlyDrill(GK_UID)],
    [`drills/drill-rich`, richDrill()],
    [`drills/legacy`, {
      title: "Legacy",
      category: "Goalkeeping",
      created_by: GK_UID,
      canvas_data: { elements: [], lines: [], fieldType: "half" },
    }],
  ]);
});

after(async () => {
  await testEnv.cleanup();
});

test("allowsProvenancedHeadCoachAndGkDrillCreate", async () => {
  const headDrill = {
    title: "Head Coach drill",
    category: "Tactical",
    created_by: HEAD_UID,
    organizationType: "PRO_CLUB",
    organizationId: CLUB_ID,
    canvas_data: { elements: [], lines: [], fieldType: "half" },
  };
  await assertSucceeds(setDoc(doc(dbFor(GK_UID), "drills", "new-gk"), drill(GK_UID)));
  await assertSucceeds(setDoc(doc(dbFor(HEAD_UID), "drills", "new-head"), headDrill));
  await assertFails(setDoc(doc(dbFor(OTHER_GK_UID), "drills", "forged-club"), drill(OTHER_GK_UID, "missing-club")));
});

test("freezesProClubProvenanceAndCreator", async () => {
  await assertSucceeds(getDoc(doc(dbFor(GK_UID), "drills", "drill-a")));
  await assertFails(updateDoc(doc(dbFor(GK_UID), "drills", "drill-a"), { organizationId: OTHER_CLUB_ID }));
  await assertFails(updateDoc(doc(dbFor(GK_UID), "drills", "drill-a"), { created_by: OTHER_GK_UID }));
  await assertFails(updateDoc(doc(dbFor(GK_UID), "drills", "legacy"), {
    organizationType: "PRO_CLUB",
    organizationId: CLUB_ID,
  }));
});

test("keepsLegacyDrillReadableButNotSubmittable", async () => {
  await assertSucceeds(getDoc(doc(dbFor(GK_UID), "drills", "legacy")));
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", SUBMISSION_ID),
    evidence({ sourceDrillId: "legacy" }),
  ));
});

test("allowsOnlySameClubOwnerSourceCreate", async () => {
  await assertSucceeds(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", SUBMISSION_ID),
    evidence(),
  ));
  await assertFails(setDoc(
    doc(dbFor(OTHER_GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "other-owner"),
    evidence({ sourceDrillId: "drill-a", sourceCreatorUid: OTHER_GK_UID, submittedBy: OTHER_GK_UID }),
  ));
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "other-gk-source"),
    evidence({ sourceDrillId: "drill-b" }),
  ));
});

test("allowsHeadCoachSubmissionWithAuthorRoleAudit", async () => {
  await assertSucceeds(setDoc(
    doc(dbFor(HEAD_UID), "proClubs", CLUB_ID, "drillSubmissions", "head-submission"),
    evidence({
      sourceDrillId: "drill-head",
      sourceCreatorUid: HEAD_UID,
      sourceCreatorRoleAtSubmission: "HEAD_COACH",
      submittedBy: HEAD_UID,
    }),
  ));
});

test("allowsOnlySourceDerivedVisualModes", async () => {
  const photo = evidence({
    sourceDrillId: "drill-photo-only",
    snapshot: {
      details: { title: "Keeper transition", category: "Goalkeeping" },
      visualType: "UPLOADED_IMAGE",
      previewImage: "data:image/png;base64,PHOTO_A",
    },
  });
  const board = evidence({
    sourceDrillId: "drill-board-only",
    snapshot: {
      details: { title: "Keeper transition", category: "Goalkeeping" },
      visualType: "TACTIC_BOARD",
      canvasData: { elements: [], lines: [], fieldType: "half" },
    },
  });

  await assertSucceeds(setDoc(doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "valid-photo"), photo));
  await assertSucceeds(setDoc(doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "valid-board"), board));
  await assertSucceeds(setDoc(doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "valid-both"), evidence()));
});

test("deniesEachIsolatedVisualTypeSubstitution", async () => {
  const details = { title: "Keeper transition", category: "Goalkeeping" };
  const canvasData = { elements: [], lines: [], fieldType: "half" };
  const previewImage = "data:image/png;base64,PHOTO_A";
  const photoPayload = { previewImage };
  const boardPayload = { canvasData };
  const bothPayload = { previewImage, canvasData };
  const attempts: Array<[string, string, DocumentData]> = [
    ["photo-to-board", "drill-photo-only", { details, visualType: "TACTIC_BOARD", ...photoPayload }],
    ["board-to-photo", "drill-board-only", { details, visualType: "UPLOADED_IMAGE", ...boardPayload }],
    ["both-to-photo", "drill-a", { details, visualType: "UPLOADED_IMAGE", ...bothPayload }],
    ["both-to-board", "drill-a", { details, visualType: "TACTIC_BOARD", ...bothPayload }],
    ["photo-to-both", "drill-photo-only", { details, visualType: "BOTH", ...photoPayload }],
    ["board-to-both", "drill-board-only", { details, visualType: "BOTH", ...boardPayload }],
  ];

  for (const [id, sourceDrillId, snapshot] of attempts) {
    await assertFails(setDoc(
      doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", id),
      evidence({ sourceDrillId, snapshot }),
    ));
  }
});

test("allowsAllMatchingOptionalSourceDetails", async () => {
  await assertSucceeds(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "valid-rich-details"),
    richEvidence(),
  ));
});

test("imageFieldCannotBypassRequiredSnapshotFields", async () => {
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "malformed-image"),
    evidence({ snapshot: { previewImage: "data:image/png;base64,PHOTO_A" } }),
  ));
});

test("deniesVisualPayloadWithWrongVisualType", async () => {
  const base = evidence().snapshot;
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "image-as-board"),
    evidence({
      snapshot: {
        details: base.details,
        previewImage: base.previewImage,
        visualType: "TACTIC_BOARD",
      },
    }),
  ));

  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "board-as-image"),
    evidence({
      snapshot: {
        details: base.details,
        canvasData: base.canvasData,
        visualType: "UPLOADED_IMAGE",
      },
    }),
  ));
});

test("bothVisualModeRequiresBothPayloadsAndRejectsUnknownCombinations", async () => {
  const base = evidence().snapshot;
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "both-without-image"),
    evidence({ snapshot: { ...withoutField(base, "previewImage"), visualType: "BOTH" } }),
  ));

  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "both-without-canvas"),
    evidence({ snapshot: { ...withoutField(base, "canvasData"), visualType: "BOTH" } }),
  ));

  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "unknown-visual-mode"),
    evidence({ snapshot: { ...base, visualType: "TACTIC_BOARD_WITH_IMAGE" } }),
  ));
});

test("submissionPreviewMustMatchSourceAtCreate", async () => {
  const snapshot = evidence().snapshot;
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "forged-preview"),
    evidence({ snapshot: { ...snapshot, previewImage: "data:image/png;base64,FORGED" } }),
  ));
});

test("submissionCanvasMustMatchSourceAtCreate", async () => {
  const snapshot = evidence().snapshot;
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "forged-canvas"),
    evidence({
      snapshot: {
        ...snapshot,
        canvasData: { elements: [{ id: "forged" }], lines: [], fieldType: "half" },
      },
    }),
  ));
});

test("submittedSnapshotStaysFrozenWhenSourceChangesAfterCreate", async () => {
  await assertSucceeds(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", SUBMISSION_ID),
    evidence(),
  ));
  await assertSucceeds(updateDoc(doc(dbFor(GK_UID), "drills", "drill-a"), {
    title: "Updated keeper transition",
    previewImage: "data:image/png;base64,PHOTO_B",
  }));

  let storedSnapshot: DocumentData | undefined;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const stored = await getDoc(doc(context.firestore(), "proClubs", CLUB_ID, "drillSubmissions", SUBMISSION_ID));
    storedSnapshot = stored.data()?.snapshot;
  });
  assert.equal(storedSnapshot?.details.title, "Keeper transition");
  assert.equal(storedSnapshot?.previewImage, "data:image/png;base64,PHOTO_A");
});

test("sourceVisualFieldsDetermineVisualMode", async () => {
  const bothSnapshot = evidence().snapshot;
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "photo-source-forged-both"),
    evidence({
      sourceDrillId: "drill-photo-only",
      snapshot: {
        ...bothSnapshot,
        visualType: "BOTH",
        canvasData: { elements: [], lines: [], fieldType: "half" },
      },
    }),
  ));

  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "board-source-forged-both"),
    evidence({
      sourceDrillId: "drill-board-only",
      snapshot: {
        ...bothSnapshot,
        visualType: "BOTH",
        previewImage: "data:image/png;base64,PHOTO_A",
      },
    }),
  ));
});

test("bothSourceDoesNotAllowDroppingEitherVisual", async () => {
  const base = evidence().snapshot;
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "drop-source-image"),
    evidence({ snapshot: { ...withoutField(base, "previewImage"), visualType: "TACTIC_BOARD" } }),
  ));

  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "drop-source-canvas"),
    evidence({ snapshot: { ...withoutField(base, "canvasData"), visualType: "UPLOADED_IMAGE" } }),
  ));
});

test("submissionTitleMustMatchSource", async () => {
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "forged-title"),
    richEvidence({ ...RICH_DETAILS, title: "Forged title" }),
  ));
});

test("submissionCategoryMustMatchSource", async () => {
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "forged-category"),
    richEvidence({ ...RICH_DETAILS, category: "Forged category" }),
  ));
});

test("submissionCoachingPointsMustMatchSource", async () => {
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "forged-coaching-points"),
    richEvidence({ ...RICH_DETAILS, coachingPoints: "Forged coaching points." }),
  ));
});

test("submissionTrainingMethodMustMatchSource", async () => {
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "forged-training-method"),
    richEvidence({ ...RICH_DETAILS, trainingMethod: "Forged method" }),
  ));
});

test("phaseDurationAndAgeGroupMustMatchSource", async () => {
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "forged-phase"),
    richEvidence({ ...RICH_DETAILS, phase: "Forged phase" }),
  ));
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "forged-duration"),
    richEvidence({ ...RICH_DETAILS, duration: "Forged duration" }),
  ));
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "forged-age-group"),
    richEvidence({ ...RICH_DETAILS, ageGroup: "Forged age group" }),
  ));
});

test("descriptionAndDateMustMatchSource", async () => {
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "forged-description"),
    richEvidence({ ...RICH_DETAILS, description: "Forged description" }),
  ));
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "forged-date"),
    richEvidence({ ...RICH_DETAILS, date: "2026-01-01" }),
  ));
});

test("sourceDetailsCannotBeOmittedFromSnapshot", async () => {
  const details = { ...RICH_DETAILS };
  delete details.coachingPoints;
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "omitted-detail"),
    richEvidence(details),
  ));
});

test("snapshotCannotAddOptionalDetailMissingFromSource", async () => {
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "added-source-detail"),
    evidence({
      snapshot: {
        ...evidence().snapshot,
        details: { title: "Keeper transition", category: "Goalkeeping", duration: "60 minutes" },
      },
    }),
  ));
});

test("sourceCreatorRoleAuditMustMatchAuthoringAuthority", async () => {
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "forged-audit-role"),
    evidence({ sourceCreatorRoleAtSubmission: "TECHNICAL_DIRECTOR" }),
  ));
});

test("deniesForgedAndCrossClubSubmission", async () => {
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "forged-tenant"),
    evidence({ organizationId: OTHER_CLUB_ID }),
  ));
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "cross-source"),
    evidence({ sourceDrillId: "drill-other-club" }),
  ));
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "forged-owner"),
    evidence({ sourceCreatorUid: OTHER_GK_UID }),
  ));
  await assertFails(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", "forged-role"),
    evidence({ sourceCreatorRoleAtSubmission: "HEAD_COACH" }),
  ));
});

test("deniesSubmissionUpdateAndDelete", async () => {
  await assertSucceeds(setDoc(
    doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", SUBMISSION_ID),
    evidence(),
  ));
  const reference = doc(dbFor(GK_UID), "proClubs", CLUB_ID, "drillSubmissions", SUBMISSION_ID);
  await assertFails(updateDoc(reference, { "snapshot.previewImage": "tampered" }));
  await assertFails(deleteDoc(reference));
});

test("allowsCurrentAuthorityReviewOnly", async () => {
  await seed([[`proClubs/${CLUB_ID}/drillSubmissions/${SUBMISSION_ID}`, evidence({ submittedAt: new Date() })]]);
  await assertFails(setDoc(
    doc(dbFor(TD_UID), "proClubs", CLUB_ID, "drillSubmissionReviews", SUBMISSION_ID),
    { ...reviewCreate(), reviewerUid: TD_UID, reviewerRole: "TECHNICAL_DIRECTOR", reviewStartedBy: TD_UID, updatedBy: TD_UID },
  ));
  await assertSucceeds(setDoc(
    doc(dbFor(HEAD_UID), "proClubs", CLUB_ID, "drillSubmissionReviews", SUBMISSION_ID),
    reviewCreate(),
  ));
});

test("allowsTechnicalDirectorWhenCurrentTechnicalAuthority", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "proClubs", CLUB_ID, "technicalGovernance", "current"), {
      authorityUid: TD_UID,
      authorityRole: "TECHNICAL_DIRECTOR",
    });
    await setDoc(doc(context.firestore(), "proClubs", CLUB_ID, "drillSubmissions", SUBMISSION_ID), evidence({ submittedAt: new Date() }));
  });

  await assertSucceeds(setDoc(
    doc(dbFor(TD_UID), "proClubs", CLUB_ID, "drillSubmissionReviews", SUBMISSION_ID),
    {
      ...reviewCreate(),
      reviewerUid: TD_UID,
      reviewerRole: "TECHNICAL_DIRECTOR",
      reviewStartedBy: TD_UID,
      updatedBy: TD_UID,
    },
  ));
});

test("deniesCrossClubAndSelfReview", async () => {
  await seed([
    [`proClubs/${CLUB_ID}/drillSubmissions/${SUBMISSION_ID}`, evidence({ submittedAt: new Date() })],
    [`proClubs/${CLUB_ID}/drillSubmissions/self`, evidence({ submittedBy: HEAD_UID, sourceCreatorUid: HEAD_UID, submittedAt: new Date() })],
  ]);
  await assertFails(setDoc(
    doc(dbFor(HEAD_UID), "proClubs", CLUB_ID, "drillSubmissionReviews", "self"),
    { ...reviewCreate("self"), reviewerUid: HEAD_UID, reviewerRole: "HEAD_COACH", reviewStartedBy: HEAD_UID, updatedBy: HEAD_UID },
  ));
  await assertFails(setDoc(
    doc(dbFor(HEAD_UID), "proClubs", OTHER_CLUB_ID, "drillSubmissionReviews", SUBMISSION_ID),
    reviewCreate(),
  ));
});

test("headCoachAuthorCanReadOwnSubmissionAndReviewButNotOtherAuthorsWhenDirectorIsAuthority", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, "proClubs", CLUB_ID, "technicalGovernance", "current"), {
      schemaVersion: 1,
      status: "ACTIVE",
      authorityUid: TD_UID,
      authorityRole: "TECHNICAL_DIRECTOR",
    });
    await setDoc(doc(firestore, "proClubs", CLUB_ID, "drillSubmissions", "head-own"), evidence({
      sourceDrillId: "drill-head",
      sourceCreatorUid: HEAD_UID,
      sourceCreatorRoleAtSubmission: "HEAD_COACH",
      submittedBy: HEAD_UID,
      submittedAt: new Date(),
    }));
    await setDoc(doc(firestore, "proClubs", CLUB_ID, "drillSubmissionReviews", "head-own"), {
      ...reviewCreate("head-own"),
      reviewerUid: TD_UID,
      reviewerRole: "TECHNICAL_DIRECTOR",
      reviewStartedBy: TD_UID,
      updatedBy: TD_UID,
    });
    await setDoc(doc(firestore, "proClubs", CLUB_ID, "drillSubmissions", "other-author"), evidence({
      sourceDrillId: "drill-b",
      sourceCreatorUid: OTHER_GK_UID,
      submittedBy: OTHER_GK_UID,
      submittedAt: new Date(),
    }));
    await setDoc(doc(firestore, "proClubs", CLUB_ID, "drillSubmissionReviews", "other-author"), {
      ...reviewCreate("other-author"),
      reviewerUid: TD_UID,
      reviewerRole: "TECHNICAL_DIRECTOR",
      reviewStartedBy: TD_UID,
      updatedBy: TD_UID,
    });
  });

  await assertSucceeds(getDoc(doc(dbFor(HEAD_UID), "proClubs", CLUB_ID, "drillSubmissions", "head-own")));
  await assertSucceeds(getDoc(doc(dbFor(HEAD_UID), "proClubs", CLUB_ID, "drillSubmissionReviews", "head-own")));
  await assertFails(getDoc(doc(dbFor(HEAD_UID), "proClubs", CLUB_ID, "drillSubmissions", "other-author")));
  await assertFails(getDoc(doc(dbFor(HEAD_UID), "proClubs", CLUB_ID, "drillSubmissionReviews", "other-author")));
  const ownQuery = query(
    collection(dbFor(HEAD_UID), "proClubs", CLUB_ID, "drillSubmissions"),
    where("submittedBy", "==", HEAD_UID),
  );
  const ownRows = await assertSucceeds(getDocs(ownQuery));
  assert.deepEqual(ownRows.docs.map((item) => item.id), ["head-own"]);
  const otherQuery = query(
    collection(dbFor(HEAD_UID), "proClubs", CLUB_ID, "drillSubmissions"),
    where("submittedBy", "==", OTHER_GK_UID),
  );
  await assertFails(getDocs(otherQuery));
});

test("authorCannotReviewOwnSubmission", async () => {
  await seed([[`proClubs/${CLUB_ID}/drillSubmissions/head-self-review`, evidence({
    sourceDrillId: "drill-head",
    sourceCreatorUid: HEAD_UID,
    sourceCreatorRoleAtSubmission: "HEAD_COACH",
    submittedBy: HEAD_UID,
    submittedAt: new Date(),
  })]]);
  await assertFails(setDoc(
    doc(dbFor(HEAD_UID), "proClubs", CLUB_ID, "drillSubmissionReviews", "head-self-review"),
    reviewCreate("head-self-review"),
  ));
});

test("deniesReviewerRoleAndIdentityForgery", async () => {
  await seed([[`proClubs/${CLUB_ID}/drillSubmissions/${SUBMISSION_ID}`, evidence({ submittedAt: new Date() })]]);
  const reviewRef = doc(dbFor(HEAD_UID), "proClubs", CLUB_ID, "drillSubmissionReviews", SUBMISSION_ID);
  await assertFails(setDoc(reviewRef, {
    ...reviewCreate(),
    reviewerUid: TD_UID,
    reviewStartedBy: TD_UID,
    updatedBy: TD_UID,
  }));
  await assertFails(setDoc(reviewRef, {
    ...reviewCreate(),
    reviewerRole: "TECHNICAL_DIRECTOR",
  }));
});

test("deniesReviewForMissingSubmissionAndSubmissionIdMismatch", async () => {
  await assertFails(setDoc(
    doc(dbFor(HEAD_UID), "proClubs", CLUB_ID, "drillSubmissionReviews", "missing-submission"),
    reviewCreate("missing-submission"),
  ));
  await seed([[`proClubs/${CLUB_ID}/drillSubmissions/${SUBMISSION_ID}`, evidence({ submittedAt: new Date() })]]);
  await assertFails(setDoc(
    doc(dbFor(HEAD_UID), "proClubs", CLUB_ID, "drillSubmissionReviews", SUBMISSION_ID),
    reviewCreate("different-submission"),
  ));
});

test("deniesCrossClubSubmissionReviewPairing", async () => {
  await seed([[`proClubs/${CLUB_ID}/drillSubmissions/${SUBMISSION_ID}`, evidence({ submittedAt: new Date() })]]);
  await assertFails(setDoc(
    doc(dbFor(HEAD_UID), "proClubs", OTHER_CLUB_ID, "drillSubmissionReviews", SUBMISSION_ID),
    reviewCreate(),
  ));
});

test("allowsOnlyInReviewTransitions", async () => {
  await seed([[`proClubs/${CLUB_ID}/drillSubmissions/${SUBMISSION_ID}`, evidence({ submittedAt: new Date() })]]);
  const reviewRef = doc(dbFor(HEAD_UID), "proClubs", CLUB_ID, "drillSubmissionReviews", SUBMISSION_ID);
  await assertSucceeds(setDoc(reviewRef, reviewCreate()));
  await assertSucceeds(updateDoc(reviewRef, reviewUpdate("NEEDS_REVISION", "Add recovery.")));
  await assertFails(updateDoc(reviewRef, reviewUpdate("APPROVED")));
  let submittedPreview: unknown;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const storedSubmission = await getDoc(
      doc(context.firestore(), "proClubs", CLUB_ID, "drillSubmissions", SUBMISSION_ID),
    );
    submittedPreview = storedSubmission.data()?.snapshot.previewImage;
  });
  assert.equal(submittedPreview, "data:image/png;base64,PHOTO_A");
});

test("bindsActiveReviewToItsReviewerAndLocksTerminalReviews", async () => {
  await seed([
    [`proClubs/${CLUB_ID}/drillSubmissions/${SUBMISSION_ID}`, evidence({ submittedAt: new Date() })],
    [`proClubs/${CLUB_ID}/drillSubmissions/approved-review`, evidence({ submittedAt: new Date() })],
  ]);
  const activeRef = doc(dbFor(HEAD_UID), "proClubs", CLUB_ID, "drillSubmissionReviews", SUBMISSION_ID);
  await assertSucceeds(setDoc(activeRef, reviewCreate()));

  await assertFails(updateDoc(activeRef, {
    reviewerUid: TD_UID,
    reviewerRole: "TECHNICAL_DIRECTOR",
    reviewStartedBy: TD_UID,
    updatedAt: serverTimestamp(),
    updatedBy: TD_UID,
  }));
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "proClubs", CLUB_ID, "technicalGovernance", "current"), {
      authorityUid: TD_UID,
      authorityRole: "TECHNICAL_DIRECTOR",
    });
  });
  const directorActiveRef = doc(dbFor(TD_UID), "proClubs", CLUB_ID, "drillSubmissionReviews", SUBMISSION_ID);
  await assertFails(updateDoc(directorActiveRef, {
    status: "APPROVED",
    reviewNote: "Take over active review.",
    approvedAt: serverTimestamp(),
    approvedBy: TD_UID,
    updatedAt: serverTimestamp(),
    updatedBy: TD_UID,
  }));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "proClubs", CLUB_ID, "technicalGovernance", "current"), {
      authorityUid: HEAD_UID,
      authorityRole: "HEAD_COACH",
    });
  });
  await assertSucceeds(updateDoc(activeRef, reviewUpdate("NEEDS_REVISION", "Add recovery.")));
  await assertFails(updateDoc(activeRef, reviewUpdate("APPROVED")));
  await assertFails(updateDoc(activeRef, {
    reviewNote: "Changed after requesting revision.",
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_UID,
  }));
  await assertFails(deleteDoc(activeRef));

  const approvedRef = doc(dbFor(HEAD_UID), "proClubs", CLUB_ID, "drillSubmissionReviews", "approved-review");
  await assertSucceeds(setDoc(approvedRef, reviewCreate("approved-review")));
  await assertSucceeds(updateDoc(approvedRef, reviewUpdate("APPROVED", "Approved.")));
  await assertFails(updateDoc(approvedRef, {
    reviewNote: "Mutated after approval.",
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_UID,
  }));
  await assertFails(deleteDoc(approvedRef));
});

test("boundsReviewNote", async () => {
  await seed([[`proClubs/${CLUB_ID}/drillSubmissions/${SUBMISSION_ID}`, evidence({ submittedAt: new Date() })]]);
  const reviewRef = doc(dbFor(HEAD_UID), "proClubs", CLUB_ID, "drillSubmissionReviews", SUBMISSION_ID);
  await assertSucceeds(setDoc(reviewRef, reviewCreate()));
  await assertFails(updateDoc(reviewRef, reviewUpdate("APPROVED", "x".repeat(2001))));
});
