import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PRO_PLAYER_RULES_START_MARKER_V1 =
  "    // PRO_PLAYER_SELF_SERVICE_CLAIM_V1_START";
export const PRO_PLAYER_RULES_END_MARKER_V1 =
  "    // PRO_PLAYER_SELF_SERVICE_CLAIM_V1_END";
export const PRO_PLAYER_RULES_INSERT_BEFORE_V1 =
  "    match /proPlayers/{proPlayerId} {";

export const PRO_PLAYER_CLAIM_RULES_BLOCK_V1 = `${PRO_PLAYER_RULES_START_MARKER_V1}
    // Pro Player self-service claim data remains server-authoritative.
    // Clients may inspect only explicitly authorized read models.
    function isActiveSelfProPlayerV1(uid) {
      return currentUserIsActive()
        && request.auth.uid == uid
        && currentUserData().get('role', '') == 'PLAYER';
    }

    match /proPlayerOnboardingClaims/{uid} {
      allow get: if isActiveSelfProPlayerV1(uid) || isSuperAdmin();
      allow list: if isSuperAdmin();
      allow create, update, delete: if false;
    }

    match /proPlayerAccountBindings/{uid} {
      allow get: if isActiveSelfProPlayerV1(uid) || isSuperAdmin();
      allow list: if isSuperAdmin();
      allow create, update, delete: if false;
    }

    // Expected salary never inherits broad proPlayers read access.
    // Authorized-club visibility is intentionally not opened in V1.
    match /proPlayerPrivateMarketPreferences/{playerKey} {
      allow read: if isSuperAdmin();
      allow create, update, delete: if false;
    }
${PRO_PLAYER_RULES_END_MARKER_V1}

`;

export function integrateProPlayerClaimRulesV1(source) {
  if (typeof source !== "string" || source.length === 0) {
    throw new Error("PRO_PLAYER_RULES_INTEGRATION=BLOCKED:EMPTY_SOURCE");
  }

  const startCount = source.split(PRO_PLAYER_RULES_START_MARKER_V1).length - 1;
  const endCount = source.split(PRO_PLAYER_RULES_END_MARKER_V1).length - 1;
  if (startCount !== 0 || endCount !== 0) {
    throw new Error("PRO_PLAYER_RULES_INTEGRATION=BLOCKED:MARKER_ALREADY_PRESENT");
  }

  const anchorCount = source.split(PRO_PLAYER_RULES_INSERT_BEFORE_V1).length - 1;
  if (anchorCount !== 1) {
    throw new Error(`PRO_PLAYER_RULES_INTEGRATION=BLOCKED:ANCHOR_COUNT_${anchorCount}`);
  }

  return source.replace(
    PRO_PLAYER_RULES_INSERT_BEFORE_V1,
    `${PRO_PLAYER_CLAIM_RULES_BLOCK_V1}${PRO_PLAYER_RULES_INSERT_BEFORE_V1}`,
  );
}

function isDirectExecution() {
  const script = process.argv[1];
  if (!script) return false;
  return import.meta.url === pathToFileURL(resolve(script)).href;
}

if (isDirectExecution()) {
  const rulesPath = "firestore.rules";
  const checkOnly = process.argv.includes("--check");
  const source = readFileSync(rulesPath, "utf8");
  const next = integrateProPlayerClaimRulesV1(source);

  if (checkOnly) {
    console.log("PRO_PLAYER_RULES_INTEGRATION_PLAN=PASS");
    console.log(`SOURCE_BYTES=${Buffer.byteLength(source)}`);
    console.log(`RESULT_BYTES=${Buffer.byteLength(next)}`);
  } else {
    writeFileSync(rulesPath, next, "utf8");
    console.log("PRO_PLAYER_RULES_INTEGRATION=APPLIED");
  }
}
