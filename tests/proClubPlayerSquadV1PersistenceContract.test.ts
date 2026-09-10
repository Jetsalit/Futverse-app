import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(path, "utf8").replace(/\r\n?/g, "\n");

const contract = read(
  "docs/PRO_CLUB_PLAYER_SQUAD_V1_PERSISTENCE_ARCHITECTURE_FREEZE.md",
);
const normalized = contract.replace(/\s+/g, " ");
const parentContract = read(
  "docs/PRO_CLUB_PLAYER_SQUAD_V1_CONTRACT_FREEZE.md",
);
const pureDomainFreeze = read(
  "docs/PRO_CLUB_PLAYER_SQUAD_V1_PURE_DOMAIN_FREEZE.md",
);
const pureDomain = read("src/lib/proClubPlayerSquad.ts");
const playerIdentityFreeze = read(
  "docs/PLAYER_IDENTITY_FOUNDATION_V1_FREEZE.md",
);

test("1. persistence contract pins exact parent and keeps runtime writes closed", () => {
  assert.match(
    contract,
    /`PARENT_PURE_DOMAIN_HEAD=a7bacbebf6567a25651ebf392e799d2133276fff`/,
  );
  assert.match(contract, /`RUNTIME_PERSISTENCE_IMPLEMENTATION=NOT_AUTHORIZED`/);
  assert.match(contract, /`FIRESTORE_RULES_CHANGE=NOT_AUTHORIZED`/);
  assert.match(contract, /`FUNCTIONS_CHANGE=NOT_AUTHORIZED`/);
  assert.match(contract, /`UI_CHANGE=NOT_AUTHORIZED`/);
  assert.match(contract, /`MERGE_AUTHORIZATION=NOT_GRANTED`/);
});

test("2. canonical roster path and pure-domain payload remain unchanged", () => {
  assert.match(contract, /`proClubs\/\{clubId\}\/players\/\{proPlayerId\}`/);
  for (const field of [
    "schemaVersion",
    "status",
    "squadLabel",
    "shirtNumber",
    "joinedAt",
    "releasedAt",
    "createdBy",
    "updatedBy",
  ]) {
    assert.match(contract, new RegExp("`" + field + "`"));
    assert.match(pureDomain, new RegExp("\\b" + field + "\\b"));
  }
  assert.match(parentContract, /`ROSTER_DOCUMENT_IDENTITY=CLUB_ID_PLUS_PRO_PLAYER_ID`/);
});

test("3. global active assignment registry is deterministic and coordination-only", () => {
  assert.match(
    contract,
    /`proClubActivePlayerAssignments\/\{proPlayerId\}`/,
  );
  assert.match(contract, /`ACTIVE_ASSIGNMENT_DOCUMENT_ID=PRO_PLAYER_ID`/);
  assert.match(contract, /`ACTIVE_ASSIGNMENT_IS_COORDINATION_LOCK=YES`/);
  assert.match(contract, /`ACTIVE_ASSIGNMENT_AS_FUTID_AUTHORITY=FORBIDDEN`/);
  assert.match(contract, /`ACTIVE_ASSIGNMENT_AS_CAREER_HISTORY=FORBIDDEN`/);
});

test("4. persistence registry remains separate from lifelong Player Identity collections", () => {
  assert.match(
    playerIdentityFreeze,
    /playerIdentities\/\{playerKey\}/,
  );
  assert.match(
    playerIdentityFreeze,
    /futIdRegistry\/\{futId\}/,
  );
  assert.match(contract, /`PRO_PLAYER_TO_PLAYER_KEY_BINDING=DEFERRED`/);
  assert.match(
    normalized,
    /No collection may be substituted for another\./,
  );
});

test("5. ACTIVE roster and global claim form one atomic invariant", () => {
  assert.match(contract, /`ACTIVE_ROSTER_REQUIRES_MATCHING_GLOBAL_CLAIM=YES`/);
  assert.match(contract, /`GLOBAL_CLAIM_REQUIRES_MATCHING_ACTIVE_ROSTER=YES`/);
  assert.match(contract, /`SEQUENTIAL_ACTIVE_PAIR_WRITE=FORBIDDEN`/);
  assert.match(contract, /one trusted Firestore transaction/);
});

test("6. JOIN requires exact existence checks and atomic active claim", () => {
  assert.match(contract, /`JOIN_REQUIRES_ATOMIC_ACTIVE_CLAIM=YES`/);
  assert.match(contract, /verify exact Pro Club exists/);
  assert.match(contract, /verify exact `proPlayers\/\{proPlayerId\}` exists/);
  assert.match(
    contract,
    /`CONCURRENT_CROSS_CLUB_JOIN_AT_MOST_ONE_SUCCESS=YES`/,
  );
});

test("7. ACTIVATE, DEACTIVATE and RELEASE preserve claim/roster parity", () => {
  assert.match(contract, /Future `INACTIVE -> ACTIVE` persistence must atomically/);
  assert.match(contract, /`DEACTIVATE_REMOVES_ACTIVE_CLAIM_ATOMICALLY=YES`/);
  assert.match(contract, /`RELEASE_PRESERVES_ROSTER_EVIDENCE=YES`/);
  assert.match(contract, /`RELEASE_DELETES_HISTORY=NO`/);
});

test("8. global claim cannot be removed as an ad-hoc transfer bypass", () => {
  assert.match(contract, /`UNCONDITIONAL_ACTIVE_CLAIM_DELETE=FORBIDDEN`/);
  assert.match(
    normalized,
    /Claim deletion is valid only as part of an accepted lifecycle transition/,
  );
});

test("9. drift is fail-closed and silent repair is forbidden", () => {
  assert.match(contract, /`ROSTER_ASSIGNMENT_DRIFT=FAIL_CLOSED`/);
  assert.match(contract, /`AUTOMATIC_SILENT_DRIFT_REPAIR=FORBIDDEN`/);
  for (const example of [
    "ACTIVE roster exists but global claim is missing",
    "global claim exists but referenced roster is missing",
    "two ACTIVE roster records exist",
    "RELEASED roster has an active claim",
  ]) {
    assert.match(normalized, new RegExp(example));
  }
});

test("10. rejoin after RELEASED is deferred so terminal evidence cannot be overwritten", () => {
  assert.match(contract, /`REJOIN_AFTER_RELEASE=DEFERRED`/);
  assert.match(contract, /`OVERWRITE_RELEASED_PERIOD_FOR_REJOIN=FORBIDDEN`/);
  assert.match(pureDomainFreeze, /`RELEASED` is terminal/);
});

test("11. historical club relationships remain compatible with single active claim", () => {
  assert.match(contract, /`MULTIPLE_HISTORICAL_CLUB_ASSOCIATIONS=ALLOWED`/);
  assert.match(
    normalized,
    /Only simultaneous ACTIVE association is forbidden by default\./,
  );
});

test("12. cross-club uniqueness cannot rely on client-only search then write", () => {
  assert.match(contract, /`CLIENT_ONLY_CROSS_CLUB_UNIQUENESS_ENFORCEMENT=FORBIDDEN`/);
  assert.match(
    normalized,
    /A UI query such as “search all clubs first, then write” is not a concurrency-safe invariant/,
  );
});

test("13. Admin SDK implementation must independently preserve domain and authority parity", () => {
  assert.match(contract, /`ADMIN_SDK_VALIDATION_PARITY_REQUIRED=YES`/);
  assert.match(contract, /exact IDs/);
  assert.match(contract, /pure-domain schema/);
  assert.match(contract, /lifecycle transitions/);
  assert.match(contract, /ACTIVE claim invariant/);
  assert.match(contract, /trusted actor identity/);
  assert.match(contract, /no FUTID\/playerKey fabrication/);
});

test("14. persistence topology grants no roster mutation authority", () => {
  assert.match(
    contract,
    /`ROSTER_MUTATION_AUTHORITY=NOT_GRANTED_BY_PERSISTENCE_CONTRACT`/,
  );
  assert.match(contract, /OWNER \/ ADMIN \/ HEAD_COACH \/ TEAM_MANAGER/);
  assert.match(contract, /SuperAdmin Support Mode V1 remains read-only/);
});

test("15. global assignment registry is not normal-user discovery surface", () => {
  assert.match(
    contract,
    /`GLOBAL_ACTIVE_ASSIGNMENT_ENUMERATION_FOR_NORMAL_USERS=FORBIDDEN`/,
  );
  assert.match(contract, /The future club roster list reads from:/);
  assert.match(contract, /`proClubs\/\{clubId\}\/players`/);
});

test("16. legacy currentClub and production infrastructure remain outside atomic authority", () => {
  assert.match(contract, /`LEGACY_CURRENT_CLUB_WRITE_PARITY=DEFERRED`/);
  assert.match(contract, /`BILLING_CHANGE_AUTHORIZATION=NOT_GRANTED`/);
  assert.match(contract, /`PRODUCTION_DEPLOY_AUTHORIZATION=NOT_GRANTED`/);
  assert.match(contract, /`PRODUCTION_DATA_WRITE_AUTHORIZATION=NOT_GRANTED`/);
});

test("17. next implementation requires emulator-backed atomicity and rollback proof", () => {
  assert.match(
    contract,
    /`READY_FOR_TRUSTED_PERSISTENCE_IMPLEMENTATION_AFTER_ACCEPTANCE=YES`/,
  );
  assert.match(contract, /concurrent cross-club JOIN yields at most one success/);
  assert.match(contract, /no partial writes on forced transaction failure/);
  assert.match(contract, /contradictory claim\/roster state fails closed/);
});
