import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  patchProClubAttendanceRulesV1,
  PRO_CLUB_ATTENDANCE_RULES_HELPER_MARKER,
  PRO_CLUB_ATTENDANCE_RULES_MATCH_MARKER,
} from "../scripts/applyProClubAttendanceRulesV1";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const currentRules = readFileSync(path.join(repoRoot, "firestore.rules"), "utf8");

test("Attendance Rules patch adds only the dedicated helper and match surfaces", () => {
  const patched = patchProClubAttendanceRulesV1(currentRules);

  assert.notEqual(patched, currentRules);
  assert.equal(patched.split(PRO_CLUB_ATTENDANCE_RULES_HELPER_MARKER).length, 2);
  assert.equal(patched.split(PRO_CLUB_ATTENDANCE_RULES_MATCH_MARKER).length, 2);

  assert.match(patched, /match \/attendanceSessions\/\{attendanceSessionId\}/);
  assert.match(patched, /match \/records\/\{playerKey\}/);
  assert.match(patched, /allow update, delete: if false;/);
  assert.match(patched, /allow delete: if false;/);
});

test("Attendance helpers and match are inserted inside the Pro Club scope", () => {
  const patched = patchProClubAttendanceRulesV1(currentRules);
  const proClubStart = patched.indexOf("match /proClubs/{clubId}");
  const proPlayersStart = patched.indexOf("match /proPlayers/{proPlayerId}");
  const helperIndex = patched.indexOf(PRO_CLUB_ATTENDANCE_RULES_HELPER_MARKER);
  const matchIndex = patched.indexOf(PRO_CLUB_ATTENDANCE_RULES_MATCH_MARKER);

  assert.ok(proClubStart >= 0);
  assert.ok(proPlayersStart > proClubStart);
  assert.ok(helperIndex > proClubStart && helperIndex < proPlayersStart);
  assert.ok(matchIndex > helperIndex && matchIndex < proPlayersStart);
});

test("Attendance replacement preserves regex end anchors literally", () => {
  const patched = patchProClubAttendanceRulesV1(currentRules);
  const expected =
    "data.get('startTime', '').matches('^([01][0-9]|2[0-3]):[0-5][0-9]$')";

  assert.equal(patched.includes(expected), true);
  assert.equal(
    patched.indexOf("match /{document=**}", patched.indexOf(expected)) >
      patched.indexOf(expected),
    true,
  );
  assert.equal(
    patched.lastIndexOf("proClubAttendanceValidSessionCreateV1") <
      patched.lastIndexOf("match /proPlayers/{proPlayerId}"),
    true,
  );
});

test("Attendance session Rules freeze strict identity and immutable session updates", () => {
  const patched = patchProClubAttendanceRulesV1(currentRules);

  assert.match(patched, /'training_' \+ data\.get\('sessionDate', ''\)/);
  assert.match(patched, /replace\(':', '-'\)/);
  assert.match(patched, /proClubWeeklyTrainingStrictCalendarDateV1/);
  assert.match(patched, /data\.get\('squadLabel', ''\) == 'First Team'/);
  assert.match(patched, /data\.get\('sessionType', ''\) == 'TRAINING'/);
  assert.match(patched, /data\.get\('createdAt', null\) == request\.time/);
  assert.match(patched, /data\.get\('createdBy', ''\) == request\.auth\.uid/);
});

test("Attendance record Rules require Head Coach plus ACTIVE First Team roster on create", () => {
  const patched = patchProClubAttendanceRulesV1(currentRules);

  assert.match(patched, /proClubSquadRosterActiveHeadCoachV1\(clubId\)/);
  assert.match(patched, /proClubAttendanceRosterEligibleV1\(playerKey\)/);
  assert.match(patched, /player\.get\('status', ''\) == 'ACTIVE'/);
  assert.match(patched, /player\.get\('squadLabel', ''\) == 'First Team'/);
  assert.match(patched, /\['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'\]/);
});

test("Attendance update preserves history and changes only status audit fields", () => {
  const patched = patchProClubAttendanceRulesV1(currentRules);

  assert.match(
    patched,
    /data\.diff\(previous\)\.affectedKeys\(\)\.hasOnly\(\[\s*'status', 'updatedAt', 'updatedBy'\s*\]\)/,
  );
  assert.match(
    patched,
    /data\.get\('createdAt', null\) == previous\.get\('createdAt', null\)/,
  );
  assert.match(
    patched,
    /data\.get\('createdBy', ''\) == previous\.get\('createdBy', ''\)/,
  );
});

test("Attendance reads reuse active Pro Club staff authority and delete stays closed", () => {
  const patched = patchProClubAttendanceRulesV1(currentRules);

  const attendanceSection = patched.slice(
    patched.indexOf(PRO_CLUB_ATTENDANCE_RULES_MATCH_MARKER),
    patched.indexOf("match /{document=**}", patched.indexOf(PRO_CLUB_ATTENDANCE_RULES_MATCH_MARKER)) + 200,
  );
  assert.match(attendanceSection, /allow get, list: if proClubSquadRosterActiveStaffV1\(clubId\)/);
  assert.match(attendanceSection, /allow delete: if false/);
});

test("Attendance patch is idempotent", () => {
  const once = patchProClubAttendanceRulesV1(currentRules);
  const twice = patchProClubAttendanceRulesV1(once);
  assert.equal(twice, once);
});

test("Attendance patch preserves CRLF repositories", () => {
  const crlf = currentRules.replace(/\r?\n/g, "\r\n");
  const patched = patchProClubAttendanceRulesV1(crlf);
  assert.equal(/(^|[^\r])\n/.test(patched), false);
});

test("Attendance patch fails closed on partial marker state", () => {
  const anchor = "      allow list, create, update, delete: if false;\n\n      match /members/{uid} {";
  const partial = currentRules.replace(
    anchor,
    `      ${PRO_CLUB_ATTENDANCE_RULES_HELPER_MARKER}\n${anchor}`,
  );
  assert.throws(
    () => patchProClubAttendanceRulesV1(partial),
    /partial Pro Club Attendance Rules patch/,
  );
});
