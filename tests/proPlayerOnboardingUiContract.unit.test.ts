import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const formSource = readFileSync(
  new URL("../src/components/ProPlayerOnboardingV1Form.tsx", import.meta.url),
  "utf8",
);
const formModelSource = readFileSync(
  new URL("../src/lib/proPlayerOnboardingFormV1.ts", import.meta.url),
  "utf8",
);
const dashboardSource = readFileSync(
  new URL("../src/components/PlayerDashboard.tsx", import.meta.url),
  "utf8",
);

const forbiddenWriterNames = ["addDoc", "setDoc", "updateDoc", "deleteDoc", "writeBatch", "runTransaction"];

test("Pro Player onboarding form has no Firebase or Firestore write dependency", () => {
  assert.equal(formSource.includes("firebase/firestore"), false);
  assert.equal(formSource.includes("../lib/firebase"), false);
  for (const writer of forbiddenWriterNames) {
    assert.equal(formSource.includes(writer), false, writer);
    assert.equal(formModelSource.includes(writer), false, writer);
  }
});

test("form submits through the canonical draft builder and explicitly remains unsaved", () => {
  assert.equal(formSource.includes("buildProPlayerOnboardingV1FromDraft"), true);
  assert.equal(formSource.includes("not saved yet"), true);
  assert.equal(formSource.includes("No Firestore write"), true);
  assert.equal(formSource.includes("secure backend persistence is not configured"), true);
});

test("form does not introduce legacy market value UI", () => {
  assert.equal(formSource.toLowerCase().includes("market value"), false);
  assert.equal(formModelSource.includes("marketValue"), false);
});

test("PlayerDashboard exposes onboarding only for direct PLAYER self context", () => {
  assert.equal(dashboardSource.includes('currentUser?.role === "PLAYER"'), true);
  assert.equal(dashboardSource.includes("actualUid === presentedUid"), true);
  assert.equal(dashboardSource.includes("!nonStaffSupport.isActive"), true);
  assert.equal(dashboardSource.includes('currentUser?.supportPresentation !== true'), true);
  assert.equal(dashboardSource.includes("Start professional player profile"), true);
});

test("PlayerDashboard does not gain direct Firestore writers", () => {
  for (const writer of forbiddenWriterNames) {
    assert.equal(dashboardSource.includes(writer), false, writer);
  }
});

test("read errors never offer onboarding CTA", () => {
  assert.equal(dashboardSource.includes("!readError && canStartOwnProPlayerOnboarding"), true);
});
