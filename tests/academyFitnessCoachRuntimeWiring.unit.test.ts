import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Timestamp } from "firebase/firestore";

import { resolveAuthoritativeAcademySpecialty } from "../src/lib/academyFitnessRuntime.ts";
import { hasAcademyFitnessCapability } from "../src/lib/academyStaffCapability.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const activeCoach = { membershipRole: "COACH", membershipStatus: "ACTIVE" } as const;
const record = {
  schemaVersion: 1,
  specialty: "FITNESS_COACH",
  status: "ACTIVE",
  createdAt: Timestamp.fromMillis(1000),
  createdBy: "admin-1",
  updatedAt: Timestamp.fromMillis(1000),
  updatedBy: "admin-1",
};

test("only a complete server-authoritative own specialty can elevate an active Coach", () => {
  const assignment = resolveAuthoritativeAcademySpecialty(true, record, false, false);
  assert.deepEqual(assignment, { specialty: "FITNESS_COACH", status: "ACTIVE" });
  assert.equal(hasAcademyFitnessCapability({ ...activeCoach, specialties: [assignment] }, "FITNESS_MANAGE_CATALOGUE"), true);
  for (const candidate of [
    resolveAuthoritativeAcademySpecialty(false, null, false, false),
    resolveAuthoritativeAcademySpecialty(true, record, true, false),
    resolveAuthoritativeAcademySpecialty(true, record, false, true),
    resolveAuthoritativeAcademySpecialty(true, { ...record, schemaVersion: 2 }, false, false),
    resolveAuthoritativeAcademySpecialty(true, { ...record, status: "INACTIVE" }, false, false),
    resolveAuthoritativeAcademySpecialty(true, { ...record, uid: "other" }, false, false),
    resolveAuthoritativeAcademySpecialty(true, { ...record, createdAt: null }, false, false),
    resolveAuthoritativeAcademySpecialty(true, { ...record, updatedAt: "yesterday" }, false, false),
    resolveAuthoritativeAcademySpecialty(true, { ...record, createdBy: " other" }, false, false),
    resolveAuthoritativeAcademySpecialty(true, { ...record, updatedBy: null }, false, false),
  ]) {
    assert.equal(hasAcademyFitnessCapability({ ...activeCoach, specialties: candidate ? [candidate] : [] }, "FITNESS_MANAGE_CATALOGUE"), false);
    assert.equal(hasAcademyFitnessCapability({ ...activeCoach, specialties: candidate ? [candidate] : [] }, "FITNESS_VIEW"), true);
  }
  assert.equal(hasAcademyFitnessCapability({ membershipRole: "COACH", membershipStatus: "SUSPENDED", specialties: [assignment] }, "FITNESS_MANAGE_CATALOGUE"), false);
});

test("runtime reads only the current user's specialty and clears elevated capability across authority changes", () => {
  const context = read("src/contexts/AcademyContext.tsx");
  const app = read("src/App.tsx");
  assert.match(context, /doc\(db, "academies", activeAcademyId, "staffSpecialties", uid\)/);
  assert.match(context, /includeMetadataChanges: true/);
  assert.match(context, /stopSpecialtyListener\(\)/);
  assert.match(context, /currentVersion !== resolutionVersion/);
  assert.match(context, /setFitnessSpecialty\(null\)/);
  assert.match(context, /fitnessSpecialty\?\.scopeKey === requestedScopeKey/);
  assert.match(app, /academyFitnessCapabilities\.includes\("FITNESS_MANAGE_CATALOGUE"\)/);
  assert.doesNotMatch(context, /setDoc\([^)]*staffSpecialties|updateDoc\([^)]*staffSpecialties/);
});
