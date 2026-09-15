import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const PRO_CLUB_ATTENDANCE_RULES_HELPER_MARKER =
  "// Pro Club Attendance V1 — Spark direct Firestore boundary.";
export const PRO_CLUB_ATTENDANCE_RULES_MATCH_MARKER =
  "// Pro Club Attendance V1 — canonical training attendance path.";

function withEol(value: string, eol: string): string {
  return value.replace(/\n/g, eol);
}

export function patchProClubAttendanceRulesV1(original: string): string {
  const fileEol = original.includes("\r\n") ? "\r\n" : "\n";

  const hasHelper = original.includes(PRO_CLUB_ATTENDANCE_RULES_HELPER_MARKER);
  const hasMatch = original.includes(PRO_CLUB_ATTENDANCE_RULES_MATCH_MARKER);
  if (hasHelper && hasMatch) return original;
  if (hasHelper !== hasMatch) {
    throw new Error("STOP: partial Pro Club Attendance Rules patch detected");
  }

  const proClubScopeAnchor = withEol(`      allow list, create, update, delete: if false;

      match /members/{uid} {`, fileEol);

  if (original.split(proClubScopeAnchor).length !== 2) {
    throw new Error(
      "STOP: Pro Club Attendance insertion anchor is missing or ambiguous",
    );
  }

  const attendanceBlock = withEol(`      ${PRO_CLUB_ATTENDANCE_RULES_HELPER_MARKER}
      function proClubAttendanceValidSessionKeysV1(data) {
        return data.keys().hasAll([
            'schemaVersion', 'sessionDate', 'startTime', 'squadLabel',
            'sessionType', 'createdAt', 'createdBy'
          ])
          && data.keys().hasOnly([
            'schemaVersion', 'sessionDate', 'startTime', 'squadLabel',
            'sessionType', 'createdAt', 'createdBy'
          ]);
      }

      function proClubAttendanceSessionIdMatchesV1(attendanceSessionId, data) {
        return attendanceSessionId
          == 'training_' + data.get('sessionDate', '')
            + '_' + data.get('startTime', '').replace(':', '-');
      }

      function proClubAttendanceValidSessionDataV1(attendanceSessionId, data) {
        return exactDocumentId(attendanceSessionId)
          && proClubAttendanceValidSessionKeysV1(data)
          && data.get('schemaVersion', 0) == 1
          && proClubWeeklyTrainingStrictCalendarDateV1(data.get('sessionDate', ''))
          && data.get('startTime', '') is string
          && data.get('startTime', '').matches('^([01][0-9]|2[0-3]):[0-5][0-9]$')
          && proClubAttendanceSessionIdMatchesV1(attendanceSessionId, data)
          && data.get('squadLabel', '') == 'First Team'
          && data.get('sessionType', '') == 'TRAINING'
          && data.get('createdAt', null) is timestamp
          && exactDocumentId(data.get('createdBy', ''));
      }

      function proClubAttendanceValidSessionCreateV1(attendanceSessionId) {
        let data = request.resource.data;
        return proClubSquadRosterActiveHeadCoachV1(clubId)
          && proClubAttendanceValidSessionDataV1(attendanceSessionId, data)
          && data.get('createdAt', null) == request.time
          && data.get('createdBy', '') == request.auth.uid;
      }

      function proClubAttendanceValidRecordKeysV1(data) {
        return data.keys().hasAll([
            'schemaVersion', 'status', 'createdAt', 'createdBy',
            'updatedAt', 'updatedBy'
          ])
          && data.keys().hasOnly([
            'schemaVersion', 'status', 'createdAt', 'createdBy',
            'updatedAt', 'updatedBy'
          ]);
      }

      function proClubAttendanceValidStatusV1(status) {
        return status in ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'];
      }

      function proClubAttendanceSessionExistsV1(attendanceSessionId) {
        let sessionPath =
          /databases/$(database)/documents/proClubs/$(clubId)/attendanceSessions/$(attendanceSessionId);
        return exists(sessionPath)
          && proClubAttendanceValidSessionDataV1(
            attendanceSessionId,
            get(sessionPath).data
          );
      }

      function proClubAttendanceRosterEligibleV1(playerKey) {
        let playerPath =
          /databases/$(database)/documents/proClubs/$(clubId)/players/$(playerKey);
        let player = get(playerPath).data;
        return validPlayerIdentityKeyV1(playerKey)
          && exists(playerPath)
          && proClubSquadRosterHasCanonicalKeysV1(player)
          && player.get('schemaVersion', 0) == 1
          && player.get('status', '') == 'ACTIVE'
          && player.get('squadLabel', '') == 'First Team';
      }

      function proClubAttendanceValidRecordDataV1(playerKey, data) {
        return validPlayerIdentityKeyV1(playerKey)
          && proClubAttendanceValidRecordKeysV1(data)
          && data.get('schemaVersion', 0) == 1
          && proClubAttendanceValidStatusV1(data.get('status', ''))
          && data.get('createdAt', null) is timestamp
          && exactDocumentId(data.get('createdBy', ''))
          && data.get('updatedAt', null) is timestamp
          && exactDocumentId(data.get('updatedBy', ''));
      }

      function proClubAttendanceValidRecordCreateV1(
        attendanceSessionId,
        playerKey
      ) {
        let data = request.resource.data;
        return proClubSquadRosterActiveHeadCoachV1(clubId)
          && proClubAttendanceSessionExistsV1(attendanceSessionId)
          && proClubAttendanceRosterEligibleV1(playerKey)
          && proClubAttendanceValidRecordDataV1(playerKey, data)
          && data.get('createdAt', null) == request.time
          && data.get('createdBy', '') == request.auth.uid
          && data.get('updatedAt', null) == request.time
          && data.get('updatedBy', '') == request.auth.uid;
      }

      function proClubAttendanceValidRecordUpdateV1(
        attendanceSessionId,
        playerKey
      ) {
        let data = request.resource.data;
        let previous = resource.data;
        return proClubSquadRosterActiveHeadCoachV1(clubId)
          && proClubAttendanceSessionExistsV1(attendanceSessionId)
          && proClubAttendanceValidRecordDataV1(playerKey, previous)
          && proClubAttendanceValidRecordDataV1(playerKey, data)
          && data.diff(previous).affectedKeys().hasOnly([
            'status', 'updatedAt', 'updatedBy'
          ])
          && data.get('createdAt', null) == previous.get('createdAt', null)
          && data.get('createdBy', '') == previous.get('createdBy', '')
          && data.get('updatedAt', null) == request.time
          && data.get('updatedBy', '') == request.auth.uid;
      }

      ${PRO_CLUB_ATTENDANCE_RULES_MATCH_MARKER}
      match /attendanceSessions/{attendanceSessionId} {
        allow get, list: if proClubSquadRosterActiveStaffV1(clubId);
        allow create: if proClubAttendanceValidSessionCreateV1(
          attendanceSessionId
        );
        allow update, delete: if false;

        match /records/{playerKey} {
          allow get, list: if proClubSquadRosterActiveStaffV1(clubId);
          allow create: if proClubAttendanceValidRecordCreateV1(
            attendanceSessionId,
            playerKey
          );
          allow update: if proClubAttendanceValidRecordUpdateV1(
            attendanceSessionId,
            playerKey
          );
          allow delete: if false;
        }

        match /{document=**} {
          allow read, write: if false;
        }
      }

`, fileEol);

  const next = original.replace(
    proClubScopeAnchor,
    attendanceBlock + proClubScopeAnchor,
  );
  if (next === original) {
    throw new Error("STOP: Attendance Rules patch produced no change");
  }
  return next;
}

function main(): void {
  const rulesPath = resolve(process.cwd(), "firestore.rules");
  const original = readFileSync(rulesPath, "utf8");
  const next = patchProClubAttendanceRulesV1(original);
  if (next === original) {
    console.log("PRO_CLUB_ATTENDANCE_RULES_PATCH=ALREADY_APPLIED");
    return;
  }
  writeFileSync(rulesPath, next, "utf8");
  console.log("PRO_CLUB_ATTENDANCE_RULES_PATCH=APPLIED");
  console.log(`LINE_ENDING=${original.includes("\r\n") ? "CRLF" : "LF"}`);
  console.log("PRODUCTION_WRITE=NO");
  console.log("DEPLOY=NO");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
