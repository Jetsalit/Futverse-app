import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/lib/proPlayerOnboardingClaimV1.ts", import.meta.url),
  "utf8",
);
const freeze = readFileSync(
  new URL("../docs/PRO_PLAYER_SELF_SERVICE_PERSISTENCE_CLAIM_V1_FREEZE.md", import.meta.url),
  "utf8",
);

test("contract model has no Firestore or Firebase dependency", () => {
  assert.equal(source.includes("firebase/firestore"), false);
  assert.equal(source.includes("../lib/firebase"), false);
  for (const writer of ["addDoc", "setDoc", "updateDoc", "deleteDoc", "writeBatch", "runTransaction"]) {
    assert.equal(source.includes(writer), false, writer);
  }
});

test("freeze explicitly blocks salary from broad root proPlayers storage", () => {
  assert.match(freeze, /whole onboarding payload MUST NOT be copied into `proPlayers`/);
  assert.match(freeze, /public-safe canonical `proPlayers` profile without `expectedSalary`/);
  assert.match(freeze, /private salary\/market preference record/);
});

test("freeze preserves SUPERADMIN-only Player Identity issuance", () => {
  assert.match(freeze, /Only an ACTIVE SUPERADMIN may decide/);
  assert.match(freeze, /source `SUPERADMIN_ISSUANCE`/);
  assert.match(freeze, /client claimant cannot supply these identity values/);
});

test("write-enabled persistence remains blocked until rules and server gates exist", () => {
  assert.match(freeze, /self-service persistence remains \*\*BLOCKED\*\*/);
  assert.match(freeze, /emulator Rules tests for self-only claim creation\/read/);
  assert.match(freeze, /atomic approval failure leaves no partial canonical\/profile\/identity state/);
});
