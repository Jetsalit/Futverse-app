import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const contract = read("docs/PRO_CLUB_PERSISTENCE_CONTRACT_V1_FREEZE.md");
const foundation = read("docs/PRO_CLUB_AUTHORITY_FOUNDATION_V1_FREEZE.md");
const model = read("src/lib/proClubModel.ts");
const rules = read("firestore.rules");

test("Pro Club Persistence Contract Freeze V1", async (t) => {
  await t.test("freezes exact canonical paths", () => {
    assert.match(contract, /proClubs\/\{clubId\}/);
    assert.match(contract, /proClubs\/\{clubId\}\/members\/\{uid\}/);
    assert.match(contract, /proClubs\/\{clubId\}\/staff\/\{uid\}/);
  });

  await t.test("freezes path-derived identity and identity-free payloads", () => {
    assert.match(
      contract,
      /must not duplicate `id`, `clubId`, `uid`, or `userId`/,
    );
    assert.match(
      foundation,
      /document IDs are the only canonical club and user identities/,
    );
  });

  await t.test("freezes V1 as read-only", () => {
    assert.match(contract, /Persistence Contract V1 is read-only\./);
    assert.match(
      contract,
      /No Pro Club `setDoc`, `updateDoc`, `deleteDoc`, batch write, or transaction write/,
    );
  });

  await t.test("requires explicit result states", () => {
    for (const state of [
      "FOUND",
      "MISSING",
      "PERMISSION_DENIED",
      "INVALID_DATA",
      "ERROR",
    ]) {
      assert.match(contract, new RegExp(`\\b${state}\\b`));
    }
  });

  await t.test("requires frozen domain validators", () => {
    for (const validator of [
      "validateProClub",
      "validateProClubMembership",
      "validateProClubStaffAssignment",
      "hasActiveProClubMembershipAuthority",
      "resolveActiveProClubStaffRole",
    ]) {
      assert.match(contract, new RegExp(`\\b${validator}\\b`));
      assert.match(model, new RegExp(`\\b${validator}\\b`));
    }
  });

  await t.test("preserves terminal membership lifecycle", () => {
    assert.match(contract, /`LEFT` and `REVOKED` remain terminal in V1\./);
    assert.match(foundation, /`LEFT` and `REVOKED` are terminal in V1\./);
    assert.match(contract, /audited transition evidence/);
  });

  await t.test("keeps Pro Club Firestore Rules disconnected", () => {
    assert.equal(rules.includes("proClubs"), false);
    assert.match(contract, /This contract does not change `firestore\.rules`\./);
  });

  await t.test("keeps integration boundaries outside scope", () => {
    assert.match(contract, /Academy persistence and authorization remain unchanged\./);
    assert.match(contract, /SuperAdmin remains `NOT_CONNECTED`/);
    assert.match(contract, /Pro Club Match persistence is outside this contract\./);
    assert.match(contract, /No dashboard, club-management, coach, player, or other UI/);
  });
});
