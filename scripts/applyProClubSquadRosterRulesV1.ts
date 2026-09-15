import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const rulesPath = resolve(process.cwd(), "firestore.rules");
const original = readFileSync(rulesPath, "utf8");
const fileEol = original.includes("\r\n") ? "\r\n" : "\n";

function withFileEol(value: string): string {
  return value.replace(/\n/g, fileEol);
}

const HELPER_MARKER = "// Pro Club Squad Roster V1 — Spark direct Firestore boundary.";
const MATCH_MARKER = "// Pro Club Squad Roster V1 — canonical tenant roster path.";

if (original.includes(HELPER_MARKER) || original.includes(MATCH_MARKER)) {
  console.log("PRO_CLUB_SQUAD_ROSTER_RULES_PATCH=ALREADY_APPLIED");
  process.exit(0);
}

const helperAnchor = "    // Pro Club Weekly Training V1 — root Firestore Rules integration.";
const matchAnchor = withFileEol(`      match /{document=**} {
        allow read, write: if false;
      }
    }

    match /proPlayers/{proPlayerId} {`);

if (!original.includes(helperAnchor)) {
  throw new Error("STOP: helper insertion anchor not found exactly once");
}

if (original.split(helperAnchor).length !== 2) {
  throw new Error("STOP: helper insertion anchor is ambiguous");
}

if (!original.includes(matchAnchor)) {
  throw new Error("STOP: Pro Club child match insertion anchor not found exactly once");
}

if (original.split(matchAnchor).length !== 2) {
  throw new Error("STOP: Pro Club child match insertion anchor is ambiguous");
}

const helpers = withFileEol(`    ${HELPER_MARKER}
    function proClubSquadRosterValidPositionV1(value) {
      return value in [
        'GK', 'LB', 'LWB', 'CB', 'RB', 'RWB', 'DM', 'LM',
        'CM', 'RM', 'AM', 'LW', 'RW', 'CF', 'ST'
      ];
    }

    function proClubSquadRosterNormalizedTextV1(value, maxLength, allowEmpty) {
      return value is string
        && value.size() <= maxLength
        && value.trim() == value
        && (allowEmpty || value.size() > 0);
    }

    function proClubSquadRosterValidAdditionalPositionsV1(primary, positions) {
      return positions is list
        && proClubSquadRosterValidAdditionalPositionsListV1(primary, positions);
    }

    function proClubSquadRosterValidAdditionalPositionsListV1(primary, positions) {
      let count = positions.size();
      return count <= 3
        && (count < 1 || (
          proClubSquadRosterValidPositionV1(positions[0])
          && positions[0] != primary
        ))
        && (count < 2 || (
          proClubSquadRosterValidPositionV1(positions[1])
          && positions[1] != primary
          && positions[1] != positions[0]
        ))
        && (count < 3 || (
          proClubSquadRosterValidPositionV1(positions[2])
          && positions[2] != primary
          && positions[2] != positions[0]
          && positions[2] != positions[1]
        ));
    }

    function proClubSquadRosterClubIsActiveV1(clubId) {
      let clubPath = /databases/$(database)/documents/proClubs/$(clubId);
      let club = get(clubPath).data;
      return exactDocumentId(clubId)
        && exists(clubPath)
        && validProClubDocumentForAuthorityV1(club)
        && club.get('status', '') == 'ACTIVE';
    }

    function proClubSquadRosterActiveStaffV1(clubId) {
      let membershipPath = /databases/$(database)/documents/proClubs/$(clubId)/members/$(request.auth.uid);
      let staffPath = /databases/$(database)/documents/proClubs/$(clubId)/staff/$(request.auth.uid);
      let membership = get(membershipPath).data;
      let staff = get(staffPath).data;
      return currentUserIsActive()
        && proClubSquadRosterClubIsActiveV1(clubId)
        && exists(membershipPath)
        && exists(staffPath)
        && validProClubMembershipDataV1(membership)
        && validProClubStaffDataV1(staff)
        && membership.get('status', '') == 'ACTIVE'
        && staff.get('status', '') == 'ACTIVE';
    }

    function proClubSquadRosterActiveHeadCoachV1(clubId) {
      let staffPath = /databases/$(database)/documents/proClubs/$(clubId)/staff/$(request.auth.uid);
      return proClubSquadRosterActiveStaffV1(clubId)
        && get(staffPath).data.get('staffRole', '') == 'HEAD_COACH';
    }

    function proClubSquadRosterFutIdCompatibleV1(playerKey, futId) {
      return futId == null
        || proClubSquadRosterNonNullFutIdCompatibleV1(playerKey, futId);
    }

    function proClubSquadRosterNonNullFutIdCompatibleV1(playerKey, futId) {
      let registryPath = /databases/$(database)/documents/futIdRegistry/$(futId);
      return validIssuedFutIdV1(futId)
        && exists(registryPath)
        && get(registryPath).data.get('schemaVersion', 0) == 1
        && get(registryPath).data.get('futId', '') == futId
        && get(registryPath).data.get('playerKey', '') == playerKey;
    }

    function proClubSquadRosterValidDataV1(playerKey, data) {
      return validPlayerIdentityKeyV1(playerKey)
        && data.keys().hasAll([
          'schemaVersion', 'futId', 'firstName', 'lastName', 'position',
          'additionalPositions', 'jerseyNumber', 'squadLabel', 'status',
          'createdAt', 'createdBy', 'updatedAt', 'updatedBy'
        ])
        && data.keys().hasOnly([
          'schemaVersion', 'futId', 'firstName', 'lastName', 'position',
          'additionalPositions', 'jerseyNumber', 'squadLabel', 'status',
          'createdAt', 'createdBy', 'updatedAt', 'updatedBy'
        ])
        && data.get('schemaVersion', 0) == 1
        && proClubSquadRosterFutIdCompatibleV1(playerKey, data.get('futId', null))
        && proClubSquadRosterNormalizedTextV1(data.get('firstName', ''), 80, false)
        && proClubSquadRosterNormalizedTextV1(data.get('lastName', ''), 80, true)
        && proClubSquadRosterValidPositionV1(data.get('position', ''))
        && proClubSquadRosterValidAdditionalPositionsV1(
          data.get('position', ''),
          data.get('additionalPositions', [])
        )
        && data.get('jerseyNumber', -1) is int
        && data.get('jerseyNumber', -1) >= 0
        && data.get('jerseyNumber', -1) <= 99
        && proClubSquadRosterNormalizedTextV1(data.get('squadLabel', ''), 80, false)
        && data.get('status', '') in ['ACTIVE', 'INACTIVE', 'RELEASED']
        && data.get('createdAt', null) is timestamp
        && exactDocumentId(data.get('createdBy', ''))
        && data.get('updatedAt', null) is timestamp
        && exactDocumentId(data.get('updatedBy', ''));
    }

    function proClubSquadRosterValidCreateV1(clubId, playerKey) {
      let data = request.resource.data;
      return proClubSquadRosterActiveHeadCoachV1(clubId)
        && proClubSquadRosterValidDataV1(playerKey, data)
        && data.get('status', '') == 'ACTIVE'
        && data.get('createdAt', null) == request.time
        && data.get('updatedAt', null) == request.time
        && data.get('createdBy', '') == request.auth.uid
        && data.get('updatedBy', '') == request.auth.uid;
    }

    function proClubSquadRosterValidStatusTransitionV1(fromStatus, toStatus) {
      return (
          fromStatus == 'ACTIVE'
          && toStatus in ['ACTIVE', 'INACTIVE', 'RELEASED']
        )
        || (
          fromStatus == 'INACTIVE'
          && toStatus in ['INACTIVE', 'ACTIVE', 'RELEASED']
        )
        || (fromStatus == 'RELEASED' && toStatus == 'RELEASED');
    }

    function proClubSquadRosterValidFutIdTransitionV1(previousFutId, nextFutId) {
      return previousFutId == null
        ? (nextFutId == null || validIssuedFutIdV1(nextFutId))
        : nextFutId == previousFutId;
    }

    function proClubSquadRosterValidUpdateV1(clubId, playerKey) {
      let data = request.resource.data;
      let previous = resource.data;
      return proClubSquadRosterActiveHeadCoachV1(clubId)
        && proClubSquadRosterValidDataV1(playerKey, previous)
        && proClubSquadRosterValidDataV1(playerKey, data)
        && proClubSquadRosterValidStatusTransitionV1(
          previous.get('status', ''),
          data.get('status', '')
        )
        && proClubSquadRosterValidFutIdTransitionV1(
          previous.get('futId', null),
          data.get('futId', null)
        )
        && data.get('createdAt', null) == previous.get('createdAt', null)
        && data.get('createdBy', '') == previous.get('createdBy', '')
        && data.get('updatedAt', null) == request.time
        && data.get('updatedBy', '') == request.auth.uid;
    }

`);

const rosterMatch = withFileEol(`      ${MATCH_MARKER}
      match /players/{playerKey} {
        allow get, list: if proClubSquadRosterActiveStaffV1(clubId);
        allow create: if proClubSquadRosterValidCreateV1(clubId, playerKey);
        allow update: if proClubSquadRosterValidUpdateV1(clubId, playerKey);
        allow delete: if false;

        match /{document=**} {
          allow read, write: if false;
        }
      }

`);

let next = original.replace(helperAnchor, helpers + helperAnchor);
next = next.replace(
  matchAnchor,
  rosterMatch + matchAnchor,
);

if (next === original) {
  throw new Error("STOP: Rules patch produced no change");
}

writeFileSync(rulesPath, next, "utf8");
console.log("PRO_CLUB_SQUAD_ROSTER_RULES_PATCH=APPLIED");
console.log(`LINE_ENDING=${fileEol === "\r\n" ? "CRLF" : "LF"}`);
console.log("PRODUCTION_WRITE=NO");
console.log("DEPLOY=NO");
