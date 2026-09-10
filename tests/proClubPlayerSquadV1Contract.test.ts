import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(path, "utf8").replace(/\r\n?/g, "\n");

const contractPath = "docs/PRO_CLUB_PLAYER_SQUAD_V1_CONTRACT_FREEZE.md";
const contract = read(contractPath);
const normalized = contract.replace(/\s+/g, " ");
const proPlayerType = read("src/types/ProPlayer.ts");
const profileReadModel = read("src/lib/playerProfileReadModel.ts");
const proClubType = read("src/types/ProClub.ts");
const proClubModel = read("src/lib/proClubModel.ts");
const firestoreRules = read("firestore.rules");

test("contract pins exact main baseline and docs/tests-only scope", () => {
  assert.match(
    contract,
    /Accepted baseline SHA: `a983681bc89e93eb8759f583158d314ed772fb7d`/,
  );
  assert.match(contract, /`SCOPE=DOCS_TESTS_ONLY`/);
  assert.match(contract, /`RUNTIME_IMPLEMENTATION=NOT_AUTHORIZED`/);
  assert.match(contract, /`FIRESTORE_RULES_CHANGE=NOT_AUTHORIZED`/);
  assert.match(contract, /`FUNCTIONS_CHANGE=NOT_AUTHORIZED`/);
  assert.match(contract, /`UI_CHANGE=NOT_AUTHORIZED`/);
  assert.match(contract, /`MERGE_AUTHORIZATION=NOT_GRANTED`/);
});

test("V1 references exact existing Pro Player identity and does not fabricate FUTID", () => {
  assert.match(contract, /`V1_PLAYER_REFERENCE=EXACT_PRO_PLAYER_DOCUMENT_ID`/);
  assert.match(contract, /`FUTID_AUTHORITY=DEFERRED_TO_LIFELONG_PLAYER_IDENTITY`/);
  assert.match(contract, /`FUTID_FABRICATION=FORBIDDEN`/);
  assert.match(contract, /`PLAYER_KEY_FABRICATION=FORBIDDEN`/);
  assert.match(profileReadModel, /No FUTID or playerKey authority belongs here\./);
  assert.match(profileReadModel, /sourceDocumentId: player\.id/);
});

test("legacy currentClub remains presentation data rather than roster authority", () => {
  assert.match(proPlayerType, /currentClub: string/);
  assert.match(profileReadModel, /currentClub: string \| null/);
  assert.match(contract, /`LEGACY_CURRENT_CLUB_AS_AUTHORITY=FORBIDDEN`/);
  assert.match(
    normalized,
    /must not grant club access, Match eligibility, staff authority, or Player Portal team context merely because the text in `currentClub` matches a club name/,
  );
});

test("player relationship remains separate from membership and staff authority", () => {
  assert.match(contract, /`PLAYER_AS_STAFF=FORBIDDEN`/);
  assert.match(contract, /`PLAYER_AS_OWNER_ADMIN=FORBIDDEN`/);
  assert.match(contract, /`STAFF_ROLE_SYNTHESIS=FORBIDDEN`/);
  assert.match(contract, /`PRO_PLAYER_ID_EQUALS_FIREBASE_UID_ASSUMPTION=FORBIDDEN`/);
  assert.match(contract, /`PLAYER_ACCOUNT_LINK=DEFERRED`/);

  assert.match(proClubType, /ProClubAuthorizationRole = "OWNER" \| "ADMIN" \| "MEMBER"/);
  assert.match(proClubType, /export type ProClubStaffRole/);
  assert.doesNotMatch(proClubType, /ProClubStaffRole[\s\S]*?\| "PLAYER"/);
});

test("future roster identity is exact clubId plus proPlayerId path identity", () => {
  assert.match(contract, /`proClubs\/\{clubId\}\/players\/\{proPlayerId\}`/);
  assert.match(contract, /`ROSTER_DOCUMENT_IDENTITY=CLUB_ID_PLUS_PRO_PLAYER_ID`/);
  assert.match(proClubModel, /export function isValidDocumentIdentifier/);
  assert.match(
    normalized,
    /The payload must not redundantly store authoritative `clubId` or `proPlayerId` fields/,
  );
});

test("roster lifecycle is canonical and release is terminal historical evidence", () => {
  for (const status of ["ACTIVE", "INACTIVE", "RELEASED"]) {
    assert.match(contract, new RegExp(`- \\`${status}\\``));
  }
  assert.match(contract, /`ROSTER_STATUS_V1=ACTIVE_INACTIVE_RELEASED`/);
  assert.match(contract, /`RELEASED_IS_TERMINAL=YES`/);
  assert.match(contract, /`HARD_DELETE_ROSTER_HISTORY=FORBIDDEN`/);
  assert.match(contract, /`ARBITRARY_STATUS_REWRITE=FORBIDDEN`/);
});

test("match availability and selection are explicitly separate from roster lifecycle", () => {
  assert.match(contract, /`MATCH_ELIGIBILITY_SEPARATE_FROM_ROSTER_STATUS=YES`/);
  for (const concept of [
    "injured",
    "suspended",
    "not selected",
    "unavailable",
    "match-day starter",
    "substitute",
  ]) {
    assert.match(normalized.toLowerCase(), new RegExp(concept));
  }
});

test("roster data avoids copying authoritative player profile fields", () => {
  assert.match(contract, /`ROSTER_PROFILE_DUPLICATION=FORBIDDEN`/);
  assert.match(contract, /`ROSTER_SCHEMA_VERSION=1`/);
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
    assert.match(contract, new RegExp(`\\`${field}\\``));
  }
});

test("duplicate and multi-club ACTIVE association policy fails closed", () => {
  assert.match(contract, /`DUPLICATE_PLAYER_WITHIN_CLUB=FORBIDDEN`/);
  assert.match(contract, /`MULTI_CLUB_SIMULTANEOUS_ACTIVE_DEFAULT=FORBIDDEN`/);
  assert.match(
    normalized,
    /cross-club enforcement mechanism is intentionally deferred to the persistence architecture slice/,
  );
});

test("join and release operations are lifecycle actions not arbitrary edits", () => {
  for (const action of ["JOIN", "ACTIVATE", "DEACTIVATE", "RELEASE"]) {
    assert.match(contract, new RegExp(`\\`${action}\\``));
  }
  assert.match(
    normalized,
    /A later domain model must freeze the exact transition matrix and reject invalid transitions/,
  );
});

test("mutation authority is not granted by global role or this contract", () => {
  assert.match(contract, /`GLOBAL_ROLE_ONLY_ROSTER_MUTATION=FORBIDDEN`/);
  assert.match(contract, /`ROSTER_MUTATION_AUTHORITY=NOT_YET_GRANTED`/);
  assert.match(contract, /SuperAdmin Support Mode V1 remains read-only/);
  assert.match(contract, /`PLAYER_SELF_JOIN_WITHOUT_CLUB_APPROVAL=FORBIDDEN`/);
});

test("cross-tenant discovery and free-text Match player creation remain forbidden", () => {
  assert.match(contract, /`CROSS_TENANT_ROSTER_DISCOVERY=FORBIDDEN`/);
  assert.match(contract, /`MATCH_SQUAD_IMPLEMENTATION=DEFERRED`/);
  assert.match(contract, /`FREE_TEXT_PLAYER_CREATION_FROM_MATCH=FORBIDDEN`/);
  assert.match(contract, /`TRANSFER_CREATES_NEW_PLAYER_IDENTITY=FORBIDDEN`/);
});

test("current Firestore baseline has proPlayers but no activated Pro Club player roster rule", () => {
  assert.match(firestoreRules, /match \/proPlayers\/\{proPlayerId\}/);
  assert.doesNotMatch(firestoreRules, /match \/proClubs\/\{clubId\}\/players\/\{proPlayerId\}/);
  assert.match(contract, /This contract does not create that collection or authorize its production use\./);
});

test("production and protected architecture remain explicitly out of scope", () => {
  assert.match(contract, /`PRODUCTION_DEPLOY_AUTHORIZATION=NOT_GRANTED`/);
  assert.match(contract, /`PRODUCTION_DATA_READ_AUTHORIZATION=NOT_GRANTED`/);
  assert.match(contract, /`PRODUCTION_DATA_WRITE_AUTHORIZATION=NOT_GRANTED`/);
  assert.match(contract, /Head Coach Phase 5E-2/);
  assert.match(contract, /SuperAdmin Support Mode chain/);
  assert.match(contract, /Starting XI runtime/);
});
