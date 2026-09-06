import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("Pro Club portal renders staff roster only inside reviewer branch", () => {
  const source = readFileSync("src/components/pro-club/ProClubPortal.tsx", "utf8");
  assert.match(source, /import StaffRoster from "\.\/StaffRoster"/);
  assert.match(source, /isProClubReviewer\(authority\)[\s\S]*?<StaffRoster clubId=\{clubId\} uid=\{uid\}/);
  assert.doesNotMatch(source, /<StaffRoster[^>]*uid=\{(?:actualUser|currentUser)/);
});

test("StaffRoster client does not query Firestore directly", () => {
  const source = readFileSync("src/components/pro-club/StaffRoster.tsx", "utf8");
  assert.match(source, /proClubStaffRosterRepository\.loadRoster\(clubId, uid\)/);
  assert.doesNotMatch(source, /firebase\/firestore/);
  assert.doesNotMatch(source, /collection\(/);
  assert.doesNotMatch(source, /getDocs/);
});
