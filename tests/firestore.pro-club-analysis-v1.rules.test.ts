import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT = "demo-futverse-analysis-v1-rules";
const CLUB_A = "club-a";
const CLUB_B = "club-b";
const ANALYST = "analyst-a";
const HEAD = "head-a";
const FITNESS = "fitness-a";
const OUTSIDER = "outsider-a";
const MATCH = "match-a";
const FIXED_TIME = Timestamp.fromDate(new Date("2026-09-27T00:00:00.000Z"));

let environment: RulesTestEnvironment;

function db(uid: string): Firestore {
  return environment.authenticatedContext(uid).firestore() as unknown as Firestore;
}

async function seed(entries: Array<[string, DocumentData]>): Promise<void> {
  await environment.withSecurityRulesDisabled(async (context) => {
    await Promise.all(entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)));
  });
}

function logoData(actor: string): DocumentData {
  return {
    schemaVersion: 1,
    logoUrl: "data:image/webp;base64,AAAA",
    mimeType: "image/webp",
    width: 128,
    height: 128,
    byteSize: 3,
    createdAt: serverTimestamp(),
    createdBy: actor,
    updatedAt: serverTimestamp(),
    updatedBy: actor,
  };
}

function emptyAnalysis(actor: string): DocumentData {
  const slots = [
    ["GK", 50, 90], ["LB", 15, 70], ["CB", 35, 70], ["CB", 65, 70],
    ["RB", 85, 70], ["CM", 30, 50], ["DM", 50, 55], ["CM", 70, 50],
    ["LW", 20, 25], ["ST", 50, 20], ["RW", 80, 25],
  ].map(([position, x, y], slotIndex) => ({
    slotIndex, position, x, y, label: position, playerName: "",
    jerseyNumber: null, notes: "",
  }));
  return {
    schemaVersion: 1,
    matchId: MATCH,
    status: "DRAFT",
    revision: 1,
    teamSnapshot: { name: "Club A", logoUrl: null },
    matchSnapshot: { competitionName: "League", opponentName: "Riverside FC", kickoffAt: null },
    opponentSnapshot: { teamId: "opponent-1", name: "Riverside FC", logoUrl: null },
    topicSnapshot: [],
    sections: {
      FORMATION_LINEUP: { formation: "4-3-3", customFormationSlots: null, slots, notes: "" },
      IN_POSSESSION_ATT: { topicValues: {}, notes: "" },
      OUT_DEF: { topicValues: {}, notes: "" },
      KEY_MAN: { players: [] },
      ANALYSIS: {
        strengths: "", weaknesses: "", keyObservations: "",
        keyThreats: "", areasToExploit: "", tacticalNotes: "",
      },
      SET_PIECES: {
        attackingCorners: "", defendingCorners: "", freeKicks: "",
        throwIns: "", penalties: "",
      },
      ATTACKING_PATTERNS: { selected: [], notes: "" },
    },
    createdAt: serverTimestamp(),
    createdBy: actor,
    updatedAt: serverTimestamp(),
    updatedBy: actor,
  };
}

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "Firestore emulator required");
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(":");
  environment = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      host,
      port: Number(port),
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await seed([
    ["proClubs/" + CLUB_A, { name: "Club A", level: "T3", status: "ACTIVE" }],
    ["proClubs/" + CLUB_B, { name: "Club B", level: "T3", status: "ACTIVE" }],
    ["users/" + ANALYST, { status: "ACTIVE" }],
    ["users/" + HEAD, { status: "ACTIVE" }],
    ["users/" + FITNESS, { status: "ACTIVE" }],
    ["users/" + OUTSIDER, { status: "ACTIVE" }],
    ["proClubs/" + CLUB_A + "/members/" + ANALYST, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    ["proClubs/" + CLUB_A + "/staff/" + ANALYST, { staffRole: "ANALYST", status: "ACTIVE" }],
    ["proClubs/" + CLUB_A + "/members/" + HEAD, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    ["proClubs/" + CLUB_A + "/staff/" + HEAD, { staffRole: "HEAD_COACH", status: "ACTIVE" }],
    ["proClubs/" + CLUB_A + "/members/" + FITNESS, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    ["proClubs/" + CLUB_A + "/staff/" + FITNESS, { staffRole: "FITNESS_COACH", status: "ACTIVE" }],
    ["proClubs/" + CLUB_A + "/matches/" + MATCH, {
      schemaVersion: 1, status: "DRAFT", competitionName: "League",
    }],
  ]);
});

after(async () => {
  await environment?.cleanup();
});

test("Analysis staff can save reusable own-team and opponent logos", async () => {
  const firestore = db(ANALYST);
  await assertSucceeds(setDoc(
    doc(firestore, "proClubs", CLUB_A, "teamLogos", "current"),
    logoData(ANALYST),
  ));
  await assertSucceeds(setDoc(
    doc(firestore, "proClubs", CLUB_A, "opponentTeams", "opponent-1"),
    { ...logoData(ANALYST), name: "Riverside FC" },
  ));
  await assertSucceeds(getDoc(doc(firestore, "proClubs", CLUB_A, "opponentTeams", "opponent-1")));

  await assertSucceeds(updateDoc(
    doc(firestore, "proClubs", CLUB_A, "opponentTeams", "opponent-1"),
    { logoUrl: null, mimeType: null, width: null, height: null, byteSize: null, updatedAt: serverTimestamp(), updatedBy: ANALYST },
  ));
});

test("Analysis persistence is tenant-scoped and excludes unrelated staff roles", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "proClubs", CLUB_A, "teamLogos", "current"),
      logoData(ANALYST),
    );
  });
  const fitnessDb = db(FITNESS);
  await assertFails(getDoc(doc(fitnessDb, "proClubs", CLUB_A, "teamLogos", "current")));
  await assertFails(setDoc(
    doc(fitnessDb, "proClubs", CLUB_A, "opponentTeams", "opponent-1"),
    { ...logoData(FITNESS), name: "Riverside FC" },
  ));
  await assertFails(getDoc(doc(db(OUTSIDER), "proClubs", CLUB_A, "teamLogos", "current")));
  await assertFails(getDoc(doc(db(HEAD), "proClubs", CLUB_B, "opponentTeams", "opponent-1")));
});

test("Analysis draft can be completed once while snapshots stay immutable", async () => {
  const firestore = db(ANALYST);
  const path = doc(firestore, "proClubs", CLUB_A, "matches", MATCH, "analysis", "current");
  await assertSucceeds(setDoc(path, emptyAnalysis(ANALYST)));

  await assertFails(updateDoc(path, {
    topicSnapshot: [{ id: "changed-template" }],
    revision: 2,
    updatedAt: serverTimestamp(),
    updatedBy: ANALYST,
  }));

  await assertSucceeds(updateDoc(path, {
    "opponentSnapshot.logoUrl": "data:image/webp;base64,AAAA",
    revision: 2,
    updatedAt: serverTimestamp(),
    updatedBy: ANALYST,
  }));
  await assertSucceeds(updateDoc(path, {
    status: "COMPLETED",
    revision: 3,
    updatedAt: serverTimestamp(),
    updatedBy: ANALYST,
  }));
  await assertFails(updateDoc(path, {
    status: "DRAFT",
    revision: 4,
    updatedAt: serverTimestamp(),
    updatedBy: ANALYST,
  }));
});

test("Analysis creation rejects mismatched match identity and oversized logo fields", async () => {
  const firestore = db(ANALYST);
  const mismatch = emptyAnalysis(ANALYST);
  mismatch.matchId = "other-match";
  await assertFails(setDoc(
    doc(firestore, "proClubs", CLUB_A, "matches", MATCH, "analysis", "current"),
    mismatch,
  ));

  const oversized = logoData(ANALYST);
  oversized.logoUrl = "data:image/webp;base64," + "A".repeat(90_001);
  await assertFails(setDoc(doc(firestore, "proClubs", CLUB_A, "teamLogos", "current"), oversized));
});

test("Analysis rules reject malformed model topics and nested report sections", async () => {
  const firestore = db(ANALYST);
  const gameModelPath = doc(firestore, "proClubs", CLUB_A, "analysisGameModel", "current");
  const audit = {
    revision: 1,
    createdAt: serverTimestamp(),
    createdBy: ANALYST,
    updatedAt: serverTimestamp(),
    updatedBy: ANALYST,
  };
  const topics = Array.from({ length: 40 }, (_, displayOrder) => ({
    id: "topic-" + displayOrder,
    name: "Topic " + displayOrder,
    displayLabel: null,
    section: displayOrder % 2 === 0 ? "IN_POSSESSION_ATT" : "OUT_DEF",
    inputType: "CHECKBOX",
    choices: [],
    displayOrder,
    enabled: true,
    archived: false,
    includeInAnalysis: true,
    includeInSummary: true,
    helperText: null,
  }));
  await assertFails(setDoc(gameModelPath, {
    schemaVersion: 1,
    topics: [null],
    ...audit,
  }));
  await assertSucceeds(setDoc(gameModelPath, {
    schemaVersion: 1,
    topics,
    ...audit,
  }));

  const malformedAnalysis = emptyAnalysis(ANALYST);
  malformedAnalysis.sections = {
    ...malformedAnalysis.sections,
    ANALYSIS: {
      ...malformedAnalysis.sections.ANALYSIS,
      strengths: { unsupported: "object" },
    },
  };
  await assertFails(setDoc(
    doc(firestore, "proClubs", CLUB_A, "matches", MATCH, "analysis", "current"),
    malformedAnalysis,
  ));
});
