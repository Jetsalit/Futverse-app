import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const contractPath =
  "docs/PRO_CLUB_STARTING_XI_11V11_V1_CONTRACT_FREEZE.md";
const modelPath =
  "src/lib/proClubStartingXI11v11.ts";

test("contract freezes Pro Club 11v11 and excludes Academy 7v7", () => {
  const contract = readFileSync(contractPath, "utf8");
  const model = readFileSync(modelPath, "utf8");

  assert.equal(contract.includes("football 11-a-side only"), true);
  assert.equal(contract.includes("No Academy 7v7 formation"), true);
  assert.equal(model.includes('"2-3-1"'), false);
  assert.equal(model.includes('"7v7"'), false);
});

test("contract includes approved command-center features and removes leadership group", () => {
  const contract = readFileSync(contractPath, "utf8");

  for (const phrase of [
    "Starting XI pitch",
    "Position Role Assignments",
    "Set-Piece Duties",
    "Penalty Shootout Order",
    "Player Communication & Sync",
    "Matchday Control",
    "Live Change Log / Audit Trail",
  ]) {
    assert.equal(contract.includes(phrase), true, phrase);
  }

  assert.equal(
    contract.includes("Leadership / Captain Group panel is deliberately excluded"),
    true,
  );
});

test("contract freezes no-persistence and preservation boundary", () => {
  const contract = readFileSync(contractPath, "utf8");

  for (const phrase of [
    "no Starting XI Firestore collection/path is introduced",
    "no Firestore Rules are changed",
    "no write repository is introduced",
    "no Player Sync write is introduced",
    "no audit-log persistence is introduced",
    "No Functions or Blaze dependency is allowed",
  ]) {
    assert.equal(contract.includes(phrase), true, phrase);
  }
});
