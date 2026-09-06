import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("Pro Club portal renders staff roster only inside reviewer branch and passes canonical reviewer role", () => {
  const source = readFileSync("src/components/pro-club/ProClubPortal.tsx", "utf8");
  assert.match(source, /import StaffRoster from "\.\/StaffRoster"/);
  assert.match(source, /isProClubReviewer\(authority\)[\s\S]*?<StaffRoster clubId=\{clubId\} uid=\{uid\} actorRole=\{authority\.membershipAuthorizationRole\}/);
  assert.doesNotMatch(source, /<StaffRoster[^>]*uid=\{(?:actualUser|currentUser)/);
});

test("StaffRoster client does not query Firestore directly", () => {
  const source = readFileSync("src/components/pro-club/StaffRoster.tsx", "utf8");
  assert.match(source, /proClubStaffRosterRepository\.loadRoster\(clubId, uid\)/);
  assert.doesNotMatch(source, /firebase\/firestore/);
  assert.doesNotMatch(source, /collection\(/);
  assert.doesNotMatch(source, /getDocs/);
  assert.doesNotMatch(source, /updateDoc/);
  assert.doesNotMatch(source, /setDoc/);
  assert.doesNotMatch(source, /deleteDoc/);
});

test("StaffRoster management actions use callable repository, confirmation and refresh", () => {
  const source = readFileSync("src/components/pro-club/StaffRoster.tsx", "utf8");
  assert.match(source, /proClubStaffManagementRepository\.manageStaff/);
  assert.match(source, /window\.confirm\(confirmation\)/);
  assert.match(source, /await refresh\(\)/);
  assert.match(source, /type: "CHANGE_ROLE"/);
  assert.match(source, /type: "DEACTIVATE"/);
  assert.match(source, /type: "MARK_LEFT"/);
  assert.doesNotMatch(source, /type: "REACTIVATE"/);
});

test("StaffRoster never renders user id as display text", () => {
  const source = readFileSync("src/components/pro-club/StaffRoster.tsx", "utf8");
  assert.doesNotMatch(source, />\s*\{entry\.userId\}\s*</);
  assert.match(source, /entry\.displayName \?\? "Staff member"/);
});
