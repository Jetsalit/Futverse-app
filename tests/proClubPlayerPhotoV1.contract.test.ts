import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rules = readFileSync("firestore.rules", "utf8");
const editor = readFileSync(
  "src/components/pro-club/operations/ProClubSquadRosterEditor.tsx",
  "utf8",
);
const roster = readFileSync(
  "src/components/pro-club/operations/ProClubSquadRoster.tsx",
  "utf8",
);
const browser = readFileSync(
  "src/lib/proClubPlayerPhotoBrowser.ts",
  "utf8",
);

test("Player Photo V1 remains Firestore-only and does not introduce Firebase Storage", () => {
  for (const source of [editor, roster, browser]) {
    assert.doesNotMatch(source, /firebase\/storage/);
    assert.doesNotMatch(source, /getStorage\s*\(/);
    assert.doesNotMatch(source, /uploadBytes/);
  }
});

test("Player Photo V1 compresses in-browser before persistence", () => {
  assert.match(browser, /PRO_CLUB_PLAYER_PHOTO_MAX_DIMENSION/);
  assert.match(browser, /PRO_CLUB_PLAYER_PHOTO_MAX_BYTES/);
  assert.match(browser, /canvas\.toDataURL\(PRO_CLUB_PLAYER_PHOTO_MIME_TYPE/);
  assert.match(editor, /compressProClubPlayerPhoto/);
  assert.match(editor, /256×256/);
  assert.match(editor, /60 KB/);
});

test("rules isolate photos from frozen roster records and forbid delete", () => {
  assert.match(rules, /match \/playerPhotos\/\{playerKey\}/);
  assert.match(rules, /allow get, list: if proClubSquadRosterActiveStaffV1\(clubId\)/);
  assert.match(rules, /allow create: if proClubPlayerPhotoValidCreateV1/);
  assert.match(rules, /allow update: if proClubPlayerPhotoValidUpdateV1/);
  assert.match(
    rules,
    /match \/playerPhotos\/\{playerKey\}[\s\S]*allow delete: if false;/,
  );
});

test("squad UI reuses photo for current and released history without deleting it on release", () => {
  assert.match(roster, /listProClubPlayerPhotos/);
  assert.match(roster, /upsertProClubPlayerPhoto/);
  assert.match(roster, /photos\[player\.playerKey\]\.dataUrl/);
  assert.match(roster, /Released Players \/ History/);
  assert.doesNotMatch(roster, /deleteProClubPlayerPhoto/);
});
