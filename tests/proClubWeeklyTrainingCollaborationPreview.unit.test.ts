import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const preview = readFileSync(
  "src/components/pro-club/operations/WeeklyTrainingCollaborationPreview.tsx",
  "utf8",
);
const workspace = readFileSync(
  "src/components/pro-club/operations/ProClubRoleWorkspace.tsx",
  "utf8",
);

test("collaboration preview is read-only and contains no persistence client dependency", () => {
  assert.match(preview, /PREVIEW ONLY · NO PRODUCTION WRITE/);
  assert.match(preview, /read-only sample/);
  assert.equal(preview.includes("firebase/firestore"), false);
  assert.equal(preview.includes("firebase/functions"), false);
  assert.equal(preview.includes("saveProClub"), false);
  assert.equal(preview.includes("writeBatch"), false);
  assert.equal(preview.includes("setDoc"), false);
  assert.equal(preview.includes("updateDoc"), false);
  assert.equal(preview.includes("fetch("), false);
  assert.equal(preview.includes("onClick="), false);
});

test("preview explains Head Coach ownership, explicit assignments and Plan versus Actual", () => {
  assert.match(preview, /Owner: Head Coach/);
  assert.match(preview, /explicit assignment required/);
  assert.match(preview, /Plan vs Actual/);
  assert.match(preview, /Original training intent remains preserved/);
  assert.match(preview, /3 players unavailable due to injury\/availability/);
  assert.match(preview, /10v10 to 8v8/);
});

test("preview exposes actor-by-actor audit and emergency authority boundaries", () => {
  assert.match(preview, /Actor audit timeline/);
  assert.match(preview, /append-only/);
  assert.match(preview, /actor UID, actor role, target/);
  assert.match(preview, /Technical Director boundary/);
  assert.match(preview, /not an automatic co-author/);
  assert.match(preview, /SuperAdmin emergency boundary/);
  assert.match(preview, /never receives automatic football-content authority/);
  assert.match(preview, /break-glass/);
});

test("Head Coach, Technical Director and scoped contributor roles surface the preview", () => {
  assert.match(workspace, /WeeklyTrainingCollaborationPreview role=\{authority\.staffRole\}/);
  for (const role of [
    "HEAD_COACH",
    "TECHNICAL_DIRECTOR",
    "ASSISTANT_COACH",
    "GK_COACH",
    "FITNESS_COACH",
    "ANALYST",
  ]) {
    assert.equal(workspace.includes(`authority.staffRole === "${role}"`), true, `${role} must be explicitly wired`);
  }
});

test("preview wiring does not expand fresh-DRAFT save authority", () => {
  assert.match(workspace, /Fresh-DRAFT writing remains Head Coach only/);
  assert.match(workspace, /Assignment and editing persistence remain closed/);
  assert.match(workspace, /Weekly Training fresh-DRAFT creation remains Head Coach only/);
});
