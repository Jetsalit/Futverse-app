import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const servicePath =
  "functions/src/proClubWeeklyTrainingExistingDraftEdit/service.ts";

async function serviceSource(): Promise<string> {
  return await readFile(servicePath, "utf8");
}

test("Existing-DRAFT writer binds actor authority to active canonical membership and Head Coach staff", async () => {
  const source = await serviceSource();

  assert.match(source, /member\?\.status\s*!==\s*"ACTIVE"/);
  assert.match(source, /member\?\.authorizationRole/);
  assert.match(source, /\["OWNER",\s*"ADMIN",\s*"MEMBER"\]\.includes/);
  assert.match(source, /staff\?\.status\s*!==\s*"ACTIVE"/);
  assert.match(source, /staff\?\.staffRole\s*!==\s*"HEAD_COACH"/);
  assert.match(source, /data\.authorUid\s*!==\s*actorUid/);
  assert.match(source, /parts\.seconds === expected\.seconds/);
  assert.match(source, /parts\.nanoseconds === expected\.nanoseconds/);
  assert.doesNotMatch(source, /timestampMatchesIso/);
});

test("Existing-DRAFT writer also validates technical authority membership and staff evidence", async () => {
  const source = await serviceSource();

  assert.match(source, /authorityMember\?\.status\s*!==\s*"ACTIVE"/);
  assert.match(source, /authorityMember\?\.authorizationRole/);
  assert.match(source, /authorityStaff\?\.status\s*!==\s*"ACTIVE"/);
  assert.match(source, /authorityStaff\?\.staffRole\s*!==\s*governance\.authorityRole/);
});

test("Existing-DRAFT writer keeps all hierarchy writes inside the trusted transaction", async () => {
  const source = await serviceSource();

  assert.match(source, /firestore\.runTransaction/);
  assert.match(source, /transaction\.update\(planRef/);
  assert.match(source, /transaction\.update\(snapshot\.ref/);
  assert.match(source, /transaction\.update\(blockSnapshot\.ref/);
  assert.doesNotMatch(source, /\.set\(/);
  assert.doesNotMatch(source, /\.create\(/);
  assert.doesNotMatch(source, /transaction\.delete\(/);
  assert.match(source, /FieldValue\.delete\(\)/);
});
