import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const rulesPath = resolve(process.cwd(), "firestore.rules");
const original = readFileSync(rulesPath, "utf8");

const HELPER_MARKER = "// Pro Club Squad Roster V1 — Spark direct Firestore boundary.";
const MATCH_MARKER = "// Pro Club Squad Roster V1 — canonical tenant roster path.";

if (original.includes(HELPER_MARKER) || original.includes(MATCH_MARKER)) {
  console.log("PRO_CLUB_SQUAD_ROSTER_RULES_PATCH=ALREADY_APPLIED");
  process.exit(0);
}

const helperAnchor = "    // Pro Club Weekly Training V1 — root Firestore Rules integration.";
const matchAnchor = `      match /{document=**} {\n        allow read, write: if false;\n      }\n    }\n\n    match /proPlayers/{proPlayerId} {`;

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

const helpers = `    ${HELPER_MARKER}\n    function proClubSquadRosterValidPositionV1(value) {\n      return value in [\n        'GK', 'LB', 'LWB', 'CB', 'RB', 'RWB', 'DM', 'LM',\n        'CM', 'RM', 'AM', 'LW', 'RW', 'CF', 'ST'\n      ];\n    }\n\n    function proClubSquadRosterNormalizedTextV1(value, maxLength, allowEmpty) {\n      return value is string\n        && value.size() <= maxLength\n        && value.trim() == value\n        && (allowEmpty || value.size() > 0);\n    }\n\n    function proClubSquadRosterValidAdditionalPositionsV1(primary, positions) {\n      return positions is list\n        && proClubSquadRosterValidAdditionalPositionsListV1(primary, positions);\n    }\n\n    function proClubSquadRosterValidAdditionalPositionsListV1(primary, positions) {\n      let count = positions.size();\n      return count <= 3\n        && (count < 1 || (\n          proClubSquadRosterValidPositionV1(positions[0])\n          && positions[0] != primary\n        ))\n        && (count < 2 || (\n          proClubSquadRosterValidPositionV1(positions[1])\n          && positions[1] != primary\n          && positions[1] != positions[0]\n        ))\n        && (count < 3 || (\n          proClubSquadRosterValidPositionV1(positions[2])\n          && positions[2] != primary\n          && positions[2] != positions[0]\n          && positions[2] != positions[1]\n        ));\n    }\n\n    function proClubSquadRosterClubIsActiveV1(clubId) {\n      let clubPath = /databases/$(database)/documents/proClubs/$(clubId);\n      let club = get(clubPath).data;\n      return exactDocumentId(clubId)\n        && exists(clubPath)\n        && validProClubDocumentForAuthorityV1(club)\n        && club.get('status', '') == 'ACTIVE';\n    }\n\n    function proClubSquadRosterActiveStaffV1(clubId) {\n      let membershipPath = /databases/$(database)/documents/proClubs/$(clubId)/members/$(request.auth.uid);\n      let staffPath = /databases/$(database)/documents/proClubs/$(clubId)/staff/$(request.auth.uid);\n      let membership = get(membershipPath).data;\n      let staff = get(staffPath).data;\n      return currentUserIsActive()\n        && proClubSquadRosterClubIsActiveV1(clubId)\n        && exists(membershipPath)\n        && exists(staffPath)\n        && validProClubMembershipDataV1(membership)\n        && validProClubStaffDataV1(staff)\n        && membership.get('status', '') == 'ACTIVE'\n        && staff.get('status', '') == 'ACTIVE';\n    }\n\n    function proClubSquadRosterActiveHeadCoachV1(clubId) {\n      let staffPath = /databases/$(database)/documents/proClubs/$(clubId)/staff/$(request.auth.uid);\n      return proClubSquadRosterActiveStaffV1(clubId)\n        && get(staffPath).data.get('staffRole', '') == 'HEAD_COACH';\n    }\n\n    function proClubSquadRosterFutIdCompatibleV1(playerKey, futId) {\n      return futId == null\n        || proClubSquadRosterNonNullFutIdCompatibleV1(playerKey, futId);\n    }\n\n    function proClubSquadRosterNonNullFutIdCompatibleV1(playerKey, futId) {\n      let registryPath = /databases/$(database)/documents/futIdRegistry/$(futId);\n      return validIssuedFutIdV1(futId)\n        && exists(registryPath)\n        && get(registryPath).data.get('schemaVersion', 0) == 1\n        && get(registryPath).data.get('futId', '') == futId\n        && get(registryPath).data.get('playerKey', '') == playerKey;\n    }\n\n    function proClubSquadRosterValidDataV1(playerKey, data) {\n      return validPlayerIdentityKeyV1(playerKey)\n        && data.keys().hasAll([\n          'schemaVersion', 'futId', 'firstName', 'lastName', 'position',\n          'additionalPositions', 'jerseyNumber', 'squadLabel', 'status',\n          'createdAt', 'createdBy', 'updatedAt', 'updatedBy'\n        ])\n        && data.keys().hasOnly([\n          'schemaVersion', 'futId', 'firstName', 'lastName', 'position',\n          'additionalPositions', 'jerseyNumber', 'squadLabel', 'status',\n          'createdAt', 'createdBy', 'updatedAt', 'updatedBy'\n        ])\n        && data.get('schemaVersion', 0) == 1\n        && proClubSquadRosterFutIdCompatibleV1(playerKey, data.get('futId', null))\n        && proClubSquadRosterNormalizedTextV1(data.get('firstName', ''), 80, false)\n        && proClubSquadRosterNormalizedTextV1(data.get('lastName', ''), 80, true)\n        && proClubSquadRosterValidPositionV1(data.get('position', ''))\n        && proClubSquadRosterValidAdditionalPositionsV1(\n          data.get('position', ''),\n          data.get('additionalPositions', [])\n        )\n        && data.get('jerseyNumber', -1) is int\n        && data.get('jerseyNumber', -1) >= 0\n        && data.get('jerseyNumber', -1) <= 99\n        && proClubSquadRosterNormalizedTextV1(data.get('squadLabel', ''), 80, false)\n        && data.get('status', '') in ['ACTIVE', 'INACTIVE', 'RELEASED']\n        && data.get('createdAt', null) is timestamp\n        && exactDocumentId(data.get('createdBy', ''))\n        && data.get('updatedAt', null) is timestamp\n        && exactDocumentId(data.get('updatedBy', ''));\n    }\n\n    function proClubSquadRosterValidCreateV1(clubId, playerKey) {\n      let data = request.resource.data;\n      return proClubSquadRosterActiveHeadCoachV1(clubId)\n        && proClubSquadRosterValidDataV1(playerKey, data)\n        && data.get('status', '') == 'ACTIVE'\n        && data.get('createdAt', null) == request.time\n        && data.get('updatedAt', null) == request.time\n        && data.get('createdBy', '') == request.auth.uid\n        && data.get('updatedBy', '') == request.auth.uid;\n    }\n\n    function proClubSquadRosterValidStatusTransitionV1(fromStatus, toStatus) {\n      return (\n          fromStatus == 'ACTIVE'\n          && toStatus in ['ACTIVE', 'INACTIVE', 'RELEASED']\n        )\n        || (\n          fromStatus == 'INACTIVE'\n          && toStatus in ['INACTIVE', 'ACTIVE', 'RELEASED']\n        )\n        || (fromStatus == 'RELEASED' && toStatus == 'RELEASED');\n    }\n\n    function proClubSquadRosterValidFutIdTransitionV1(previousFutId, nextFutId) {\n      return previousFutId == null\n        ? (nextFutId == null || validIssuedFutIdV1(nextFutId))\n        : nextFutId == previousFutId;\n    }\n\n    function proClubSquadRosterValidUpdateV1(clubId, playerKey) {\n      let data = request.resource.data;\n      let previous = resource.data;\n      return proClubSquadRosterActiveHeadCoachV1(clubId)\n        && proClubSquadRosterValidDataV1(playerKey, previous)\n        && proClubSquadRosterValidDataV1(playerKey, data)\n        && proClubSquadRosterValidStatusTransitionV1(\n          previous.get('status', ''),\n          data.get('status', '')\n        )\n        && proClubSquadRosterValidFutIdTransitionV1(\n          previous.get('futId', null),\n          data.get('futId', null)\n        )\n        && data.get('createdAt', null) == previous.get('createdAt', null)\n        && data.get('createdBy', '') == previous.get('createdBy', '')\n        && data.get('updatedAt', null) == request.time\n        && data.get('updatedBy', '') == request.auth.uid;\n    }\n\n`;

const rosterMatch = `      ${MATCH_MARKER}\n      match /players/{playerKey} {\n        allow get, list: if proClubSquadRosterActiveStaffV1(clubId);\n        allow create: if proClubSquadRosterValidCreateV1(clubId, playerKey);\n        allow update: if proClubSquadRosterValidUpdateV1(clubId, playerKey);\n        allow delete: if false;\n\n        match /{document=**} {\n          allow read, write: if false;\n        }\n      }\n\n`;

let next = original.replace(helperAnchor, helpers + helperAnchor);
next = next.replace(
  matchAnchor,
  `${rosterMatch}      match /{document=**} {\n        allow read, write: if false;\n      }\n    }\n\n    match /proPlayers/{proPlayerId} {`,
);

if (next === original) {
  throw new Error("STOP: Rules patch produced no change");
}

writeFileSync(rulesPath, next, "utf8");
console.log("PRO_CLUB_SQUAD_ROSTER_RULES_PATCH=APPLIED");
console.log("PRODUCTION_WRITE=NO");
console.log("DEPLOY=NO");
