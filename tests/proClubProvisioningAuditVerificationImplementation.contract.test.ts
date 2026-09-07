import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const CORE = readFileSync(
  "functions/src/proClubProvisioningAuditVerification/core.ts",
  "utf8",
);
const SERVICE = readFileSync(
  "functions/src/proClubProvisioningAuditVerification/service.ts",
  "utf8",
);
const HANDLER = readFileSync(
  "functions/src/proClubProvisioningAuditVerification/httpHandler.ts",
  "utf8",
);
const INDEX = readFileSync("functions/src/index.ts", "utf8");
const PROVISIONING_CORE = readFileSync(
  "functions/src/proClubProvisioning/core.ts",
  "utf8",
);

test("Audit Verification implementation preserves frozen architectural boundaries", async (t) => {
  await t.test("uses one Firestore transaction and transaction reads only", () => {
    assert.match(SERVICE, /firestore\.runTransaction/);
    assert.equal((SERVICE.match(/await tx\.get\(/g) ?? []).length, 4);
    for (const mutation of ["tx.set(", "tx.create(", "tx.update(", "tx.delete("]) {
      assert.equal(SERVICE.includes(mutation), false, `forbidden transaction mutation ${mutation}`);
    }
    for (const discovery of [".where(", ".listDocuments(", ".getAll("]) {
      assert.equal(SERVICE.includes(discovery), false, `forbidden discovery ${discovery}`);
    }
  });

  await t.test("authorizes canonical verifier before audit and never reauthorizes historical actor", () => {
    const verifier = SERVICE.indexOf('collection("users")');
    const audit = SERVICE.indexOf('collection("proClubProvisioningAudits")');
    const club = SERVICE.indexOf('collection("proClubs")');
    assert.ok(verifier >= 0 && audit > verifier && club > audit);
    assert.match(SERVICE, /role === "SUPERADMIN"/);
    assert.match(SERVICE, /record\.status === "ACTIVE" \|\| record\.status === "Active"/);
    assert.equal(SERVICE.includes('doc(audit.requestingSuperAdminUid)'), false);
    assert.equal(SERVICE.includes("validateStoredAuditOnReplay"), false);
  });

  await t.test("verification core reuses structural primitives but remains replay-independent", () => {
    assert.match(CORE, /AUDIT_EXACT_ALLOWED_FIELDS/);
    assert.match(CORE, /NORMALIZED_REQUEST_EXACT_ALLOWED_FIELDS/);
    assert.match(CORE, /computeProvisioningRequestFingerprint/);
    assert.equal(CORE.includes("validateStoredAuditOnReplay"), false);
    assert.equal(CORE.includes("verifiedRequestingSuperAdminUid"), false);
  });

  await t.test("handler logger calls contain only safe classification/code or error name", () => {
    assert.match(
      HANDLER,
      /logger\?\.warn\?\.\(\{\s*classification: error\.classification,\s*errorCode: error\.code,\s*\}\)/s,
    );
    assert.match(
      HANDLER,
      /logger\?\.error\?\.\(\{\s*errorName: error instanceof Error \? error\.name : "UnknownError",\s*\}\)/s,
    );
    assert.equal(/logger[^;]*authorizationHeader/s.test(HANDLER), false);
    assert.equal(/logger[^;]*req\.body/s.test(HANDLER), false);
    assert.equal(/logger[^;]*normalizedRequest/s.test(HANDLER), false);
  });

  await t.test("Gen2 HTTP entrypoint is wired without removing provisioning entrypoint", () => {
    assert.match(INDEX, /export const verifyProClubProvisioningAuditV1 = onRequest/);
    assert.match(INDEX, /createProClubProvisioningAuditVerificationService/);
    assert.match(INDEX, /handleProClubProvisioningAuditVerificationHttpRequest/);
    assert.match(INDEX, /export const provisionProClubV1 = onRequest/);
    assert.match(INDEX, /region: "asia-southeast1"/);
  });

  await t.test("existing replay validator remains present in predecessor core", () => {
    assert.match(PROVISIONING_CORE, /export function validateStoredAuditOnReplay/);
    assert.match(PROVISIONING_CORE, /requestingSuperAdminUid/);
  });
});
