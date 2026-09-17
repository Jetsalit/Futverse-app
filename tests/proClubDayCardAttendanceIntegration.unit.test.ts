import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dayCard = readFileSync(
  "src/components/pro-club/operations/WeeklyPlannerDayCard.tsx",
  "utf8",
);
const plannerBoard = readFileSync(
  "src/components/pro-club/operations/WeeklyPlannerBoard.tsx",
  "utf8",
);
const periodizationBoard = readFileSync(
  "src/components/pro-club/operations/WeeklyPeriodizationBoard.tsx",
  "utf8",
);
const savedDrafts = readFileSync(
  "src/components/pro-club/operations/WeeklyTrainingSavedDrafts.tsx",
  "utf8",
);
const workspace = readFileSync(
  "src/components/pro-club/operations/ProClubHeadCoachWeeklyProductionWorkspace.tsx",
  "utf8",
);
const dashboard = readFileSync(
  "src/components/pro-club/operations/ProClubTeamDashboard.tsx",
  "utf8",
);
const attendance = readFileSync(
  "src/components/pro-club/operations/ProClubAttendance.tsx",
  "utf8",
);

test("saved Training activity exposes Take Attendance with its exact date and start time", () => {
  assert.match(dayCard, /onTakeAttendance/);
  assert.match(dayCard, /Take Attendance/);
  assert.match(dayCard, /activity\.activityType\s*===\s*["']TRAINING["']/);
  assert.match(dayCard, /activity\.source\s*===\s*["']SAVED_TRAINING["']/);
  assert.match(
    dayCard,
    /onTakeAttendance\(\{[\s\S]*sessionDate:\s*day\.date,[\s\S]*startTime:\s*activity\.startTime[\s\S]*\}\)/,
  );
});

test("attendance launch callback is threaded through the existing Weekly Training read path", () => {
  assert.match(plannerBoard, /onTakeAttendance/);
  assert.match(periodizationBoard, /onTakeAttendance/);
  assert.match(savedDrafts, /onTakeAttendance/);
  assert.match(workspace, /onTakeAttendance/);
});

test("team dashboard switches from Training to the existing Attendance module with launch context", () => {
  assert.match(dashboard, /attendanceLaunchContext/);
  assert.match(dashboard, /setAttendanceLaunchContext/);
  assert.match(dashboard, /setActiveTab\(["']ATTENDANCE["']\)/);
  assert.match(
    dashboard,
    /<ProClubAttendance[\s\S]*initialSession=\{attendanceLaunchContext\}/,
  );
  assert.match(
    dashboard,
    /<ProClubHeadCoachWeeklyProductionWorkspace[\s\S]*onTakeAttendance=/,
  );
});

test("Attendance prefills the requested saved Training slot and opens an exact existing session", () => {
  assert.match(attendance, /initialSession/);
  assert.match(attendance, /initialSession\.sessionDate/);
  assert.match(attendance, /initialSession\.startTime/);
  assert.match(attendance, /setInputDate\(initialSession\.sessionDate\)/);
  assert.match(attendance, /setInputTime\(initialSession\.startTime\)/);
  assert.match(
    attendance,
    /session\.sessionDate\s*===\s*initialSession\.sessionDate/,
  );
  assert.match(
    attendance,
    /session\.startTime\s*===\s*initialSession\.startTime/,
  );
  assert.match(attendance, /setSelectedSessionId\(/);
});

test("Day Card attendance integration does not create a second persistence path", () => {
  for (const source of [
    dayCard,
    plannerBoard,
    periodizationBoard,
    savedDrafts,
    workspace,
    dashboard,
  ]) {
    assert.doesNotMatch(source, /createProClubAttendanceSession/);
    assert.doesNotMatch(source, /createProClubAttendanceRecord/);
    assert.doesNotMatch(source, /updateProClubAttendanceRecord/);
    assert.doesNotMatch(source, /setDoc\(/);
    assert.doesNotMatch(source, /updateDoc\(/);
    assert.doesNotMatch(source, /writeBatch\(/);
  }
});
