import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  integrateProPlayerClaimRulesV1,
  PRO_PLAYER_CLAIM_RULES_BLOCK_V1,
  PRO_PLAYER_RULES_END_MARKER_V1,
  PRO_PLAYER_RULES_INSERT_BEFORE_V1,
  PRO_PLAYER_RULES_START_MARKER_V1,
} from "../scripts/integrateProPlayerClaimRulesV1.mjs";

const rootRules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

function count(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

test("current root rules are a single safe integration target", () => {
  assert.equal(count(rootRules, PRO_PLAYER_RULES_INSERT_BEFORE_V1), 1);
  assert.equal(count(rootRules, PRO_PLAYER_RULES_START_MARKER_V1), 0);
  assert.equal(count(rootRules, PRO_PLAYER_RULES_END_MARKER_V1), 0);
});

test("integration inserts exactly one closed Pro Player claim rules block before legacy proPlayers", () => {
  const integrated = integrateProPlayerClaimRulesV1(rootRules);
  assert.equal(count(integrated, PRO_PLAYER_RULES_START_MARKER_V1), 1);
  assert.equal(count(integrated, PRO_PLAYER_RULES_END_MARKER_V1), 1);
  assert.equal(count(integrated, PRO_PLAYER_RULES_INSERT_BEFORE_V1), 1);
  assert.ok(integrated.indexOf(PRO_PLAYER_RULES_START_MARKER_V1) < integrated.indexOf(PRO_PLAYER_RULES_INSERT_BEFORE_V1));
  assert.ok(integrated.includes(PRO_PLAYER_CLAIM_RULES_BLOCK_V1));
});

test("integration remains server-authoritative and salary stays outside broad proPlayers read", () => {
  const integrated = integrateProPlayerClaimRulesV1(rootRules);
  const start = integrated.indexOf(PRO_PLAYER_RULES_START_MARKER_V1);
  const end = integrated.indexOf(PRO_PLAYER_RULES_END_MARKER_V1);
  const block = integrated.slice(start, end);

  assert.match(block, /match \/proPlayerOnboardingClaims\/\{uid\}/);
  assert.match(block, /allow get: if isActiveSelfProPlayerV1\(uid\) \|\| isSuperAdmin\(\);/);
  assert.match(block, /allow list: if isSuperAdmin\(\);/);
  assert.match(block, /allow create, update, delete: if false;/);
  assert.match(block, /match \/proPlayerAccountBindings\/\{uid\}/);
  assert.match(block, /match \/proPlayerPrivateMarketPreferences\/\{playerKey\}/);
  assert.match(block, /allow read: if isSuperAdmin\(\);/);
  assert.doesNotMatch(block, /isAdmin\(\)/);
  assert.doesNotMatch(block, /allow (create|update|delete): if isSuperAdmin/);
});

test("integration fails closed on duplicate marker", () => {
  assert.throws(
    () => integrateProPlayerClaimRulesV1(`${rootRules}\n${PRO_PLAYER_RULES_START_MARKER_V1}`),
    /MARKER_ALREADY_PRESENT/,
  );
});

test("integration fails closed when anchor is missing or duplicated", () => {
  assert.throws(
    () => integrateProPlayerClaimRulesV1(rootRules.replace(PRO_PLAYER_RULES_INSERT_BEFORE_V1, "")),
    /ANCHOR_COUNT_0/,
  );
  assert.throws(
    () => integrateProPlayerClaimRulesV1(`${rootRules}\n${PRO_PLAYER_RULES_INSERT_BEFORE_V1}`),
    /ANCHOR_COUNT_2/,
  );
});
