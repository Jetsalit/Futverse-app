import assert from "node:assert/strict";
import test from "node:test";
import {
  computeProvisioningRequestFingerprint,
  type NormalizedProClubProvisioningRequestV1,
} from "../functions/src/proClubProvisioning/core.ts";
import {
  AUDIT_VERIFICATION_CLASSIFICATIONS,
  AUDIT_VERIFICATION_ERROR_CODES,
  ProClubProvisioningAuditVerificationError,
  validateProClubProvisioningAuditVerificationRequest,
  validateStoredProClubProvisioningAuditForVerification,
} from "../functions/src/proClubProvisioningAuditVerification/core.ts";

const normalizedRequest: NormalizedProClubProvisioningRequestV1 = {
  clubId: "club-lampang",
  country: "TH",
  initialOwnerUid: "user-owner-123",
  level: "T1",
  logoUrl: "https://example.com/logo.png",
  name: "Lampang FC",
  provisioningId: "prov-lampang-001",
  requestingSuperAdminUid: "user-historical-superadmin",
  shortName: "LFC",
};

function validAudit() {
  return {
    schemaVersion: 1,
    provisioningId: normalizedRequest.provisioningId,
    clubId: normalizedRequest.clubId,
    ownerUid: normalizedRequest.initialOwnerUid,
    requestingSuperAdminUid: normalizedRequest.requestingSuperAdminUid,
    requestFingerprint: computeProvisioningRequestFingerprint(normalizedRequest),
    normalizedRequest: { ...normalizedRequest },
    createdAt: "2026-09-04T00:00:00.000Z",
    status: "COMPLETED",
  };
}

function isError(
  error: unknown,
  classification: string,
  code: string,
): boolean {
  return (
    error instanceof ProClubProvisioningAuditVerificationError &&
    error.classification === classification &&
    error.code === code
  );
}

test("Pro Club Provisioning Audit Verification Core", async (t) => {
  await t.test("accepts exact one-key canonical request", () => {
    assert.deepEqual(
      validateProClubProvisioningAuditVerificationRequest({
        provisioningId: "prov-lampang-001",
      }),
      { provisioningId: "prov-lampang-001" },
    );
  });

  await t.test("rejects non-object, arrays, missing, extra, slash, and untrimmed input", () => {
    for (const bad of [
      null,
      undefined,
      [],
      "prov",
      {},
      { provisioningId: "prov-1", clubId: "club-1" },
      { provisioningId: " has-space " },
      { provisioningId: "has/slash" },
    ]) {
      assert.throws(
        () => validateProClubProvisioningAuditVerificationRequest(bad),
        (error) =>
          isError(
            error,
            AUDIT_VERIFICATION_CLASSIFICATIONS.INVALID_REQUEST,
            AUDIT_VERIFICATION_ERROR_CODES.INVALID_REQUEST,
          ),
      );
    }
  });

  await t.test("accepts a complete canonical audit without current-verifier equality", () => {
    const audit = validAudit();
    const result = validateStoredProClubProvisioningAuditForVerification(
      audit,
      "prov-lampang-001",
    );
    assert.equal(result.requestingSuperAdminUid, "user-historical-superadmin");
    assert.equal(result.provisioningId, "prov-lampang-001");
  });

  await t.test("rejects every missing or extra top-level audit field", () => {
    const audit = validAudit();
    for (const key of Object.keys(audit)) {
      const copy = { ...audit } as Record<string, unknown>;
      delete copy[key];
      assert.throws(
        () => validateStoredProClubProvisioningAuditForVerification(copy, "prov-lampang-001"),
        (error) =>
          isError(
            error,
            AUDIT_VERIFICATION_CLASSIFICATIONS.INTEGRITY_FAILURE,
            AUDIT_VERIFICATION_ERROR_CODES.INTEGRITY_FAILURE,
          ),
        `missing audit field ${key} must fail`,
      );
    }
    assert.throws(
      () =>
        validateStoredProClubProvisioningAuditForVerification(
          { ...audit, unexpected: true },
          "prov-lampang-001",
        ),
      (error) =>
        isError(
          error,
          AUDIT_VERIFICATION_CLASSIFICATIONS.INTEGRITY_FAILURE,
          AUDIT_VERIFICATION_ERROR_CODES.INTEGRITY_FAILURE,
        ),
    );
  });

  await t.test("rejects every missing or extra normalized field", () => {
    const audit = validAudit();
    for (const key of Object.keys(audit.normalizedRequest)) {
      const normalized = { ...audit.normalizedRequest } as Record<string, unknown>;
      delete normalized[key];
      assert.throws(
        () =>
          validateStoredProClubProvisioningAuditForVerification(
            { ...audit, normalizedRequest: normalized },
            "prov-lampang-001",
          ),
        (error) =>
          isError(
            error,
            AUDIT_VERIFICATION_CLASSIFICATIONS.INTEGRITY_FAILURE,
            AUDIT_VERIFICATION_ERROR_CODES.INTEGRITY_FAILURE,
          ),
        `missing normalized field ${key} must fail`,
      );
    }
    assert.throws(
      () =>
        validateStoredProClubProvisioningAuditForVerification(
          {
            ...audit,
            normalizedRequest: { ...audit.normalizedRequest, unexpected: true },
          },
          "prov-lampang-001",
        ),
      (error) =>
        isError(
          error,
          AUDIT_VERIFICATION_CLASSIFICATIONS.INTEGRITY_FAILURE,
          AUDIT_VERIFICATION_ERROR_CODES.INTEGRITY_FAILURE,
        ),
    );
  });

  await t.test("rejects all four normalized-to-audit binding mismatches", () => {
    const cases = [
      { provisioningId: "prov-other" },
      { clubId: "club-other" },
      { initialOwnerUid: "owner-other" },
      { requestingSuperAdminUid: "historical-other" },
    ];
    for (const patch of cases) {
      const audit = validAudit();
      audit.normalizedRequest = { ...audit.normalizedRequest, ...patch };
      audit.requestFingerprint = computeProvisioningRequestFingerprint(
        audit.normalizedRequest,
      );
      assert.throws(
        () => validateStoredProClubProvisioningAuditForVerification(audit, "prov-lampang-001"),
        (error) =>
          isError(
            error,
            AUDIT_VERIFICATION_CLASSIFICATIONS.INTEGRITY_FAILURE,
            AUDIT_VERIFICATION_ERROR_CODES.INTEGRITY_FAILURE,
          ),
      );
    }
  });

  await t.test("rejects fingerprint mismatch, malformed timestamp, level, and optional strings", () => {
    const fingerprintBad = validAudit();
    fingerprintBad.requestFingerprint = `sha256:${"0".repeat(64)}`;
    assert.throws(
      () => validateStoredProClubProvisioningAuditForVerification(fingerprintBad, "prov-lampang-001"),
      (error) => error instanceof ProClubProvisioningAuditVerificationError,
    );

    for (const mutate of [
      (audit: any) => (audit.createdAt = "2026-09-04"),
      (audit: any) => (audit.normalizedRequest.level = "T4"),
      (audit: any) => (audit.normalizedRequest.name = "  Lampang FC  "),
      (audit: any) => (audit.normalizedRequest.country = "  TH  "),
    ]) {
      const audit = validAudit();
      mutate(audit);
      audit.requestFingerprint = computeProvisioningRequestFingerprint(audit.normalizedRequest);
      assert.throws(
        () => validateStoredProClubProvisioningAuditForVerification(audit, "prov-lampang-001"),
        (error) => error instanceof ProClubProvisioningAuditVerificationError,
      );
    }
  });
});
