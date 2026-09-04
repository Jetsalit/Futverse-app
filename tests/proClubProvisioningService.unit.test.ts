import assert from "node:assert/strict";
import test from "node:test";
import {
  ERROR_CODES,
  ProClubProvisioningError,
  computeProvisioningRequestFingerprint,
  isValidCanonicalIsoUtcTimestamp,
  isValidDocumentIdentifier,
  validateAndNormalizeProvisioningRequest,
  validateStoredAuditOnReplay,
  validateStoredClubPayload,
  validateStoredMembershipPayload,
  type NormalizedProClubProvisioningRequestV1,
} from "../functions/src/proClubProvisioning/core.ts";
import {
  createServerAuthTokenVerifier,
  type MinimalAdminAuth,
} from "../functions/src/lib/serverAuthTokenVerifier.ts";
import { validateProClub } from "../src/lib/proClubModel.ts";

test("Pro Club Provisioning Service - Pure Core Unit Tests", async (t) => {
  const validRequesterUid = "user-superadmin-789";
  const validIsoTimestamp = "2026-09-04T00:00:00.000Z";

  const validBaseRequest = {
    provisioningId: "prov-lampang-001",
    clubId: "club-lampang",
    name: "Lampang FC",
    shortName: "LFC",
    level: "T1",
    country: "TH",
    logoUrl: "https://example.com/logo.png",
    initialOwnerUid: "user-owner-123",
  };

  await t.test("accepts valid request and builds exact payloads", () => {
    const result = validateAndNormalizeProvisioningRequest(
      validBaseRequest,
      validRequesterUid,
      validIsoTimestamp,
    );

    assert.equal(result.normalized.provisioningId, "prov-lampang-001");
    assert.equal(result.normalized.clubId, "club-lampang");
    assert.equal(result.normalized.name, "Lampang FC");
    assert.equal(result.normalized.shortName, "LFC");
    assert.equal(result.normalized.level, "T1");
    assert.equal(result.normalized.country, "TH");
    assert.equal(result.normalized.logoUrl, "https://example.com/logo.png");
    assert.equal(result.normalized.initialOwnerUid, "user-owner-123");
    assert.equal(result.normalized.requestingSuperAdminUid, validRequesterUid);

    // Initial club payload
    assert.equal(result.clubPayload.name, "Lampang FC");
    assert.equal(result.clubPayload.shortName, "LFC");
    assert.equal(result.clubPayload.level, "T1");
    assert.equal(result.clubPayload.status, "ACTIVE");
    assert.equal(result.clubPayload.country, "TH");
    assert.equal(result.clubPayload.logoUrl, "https://example.com/logo.png");
    assert.equal(result.clubPayload.createdAt, validIsoTimestamp);
    assert.equal(result.clubPayload.updatedAt, validIsoTimestamp);
    assert.equal(result.clubPayload.createdAt, result.clubPayload.updatedAt);
    assert.equal(validateStoredClubPayload(result.clubPayload), true);

    // Verify compatibility with client/shared Pro Club model validator
    assert.equal(
      validateProClub(result.clubPayload, {
        clubId: result.normalized.clubId,
        documentId: result.normalized.clubId,
      }),
      true,
    );

    // Initial owner payload
    assert.deepEqual(result.membershipPayload, {
      authorizationRole: "OWNER",
      status: "ACTIVE",
    });
    assert.equal(validateStoredMembershipPayload(result.membershipPayload), true);

    // Audit payload
    assert.equal(result.auditPayload.schemaVersion, 1);
    assert.equal(result.auditPayload.provisioningId, "prov-lampang-001");
    assert.equal(result.auditPayload.clubId, "club-lampang");
    assert.equal(result.auditPayload.ownerUid, "user-owner-123");
    assert.equal(result.auditPayload.requestingSuperAdminUid, validRequesterUid);
    assert.equal(result.auditPayload.status, "COMPLETED");
    assert.equal(result.auditPayload.createdAt, validIsoTimestamp);
    assert.match(result.auditPayload.requestFingerprint, /^sha256:[a-f0-9]{64}$/);
    assert.equal(result.auditPayload.requestFingerprint, result.requestFingerprint);
  });

  await t.test("rejects caller-supplied requestingSuperAdminUid in request body", () => {
    assert.throws(
      () =>
        validateAndNormalizeProvisioningRequest(
          { ...validBaseRequest, requestingSuperAdminUid: "attacker-id" },
          validRequesterUid,
          validIsoTimestamp,
        ),
      (err) =>
        err instanceof ProClubProvisioningError &&
        err.code === ERROR_CODES.INVALID_PROVISIONING_REQUEST,
    );
  });

  await t.test("rejects unauthorized extra fields in request body outside whitelist", () => {
    const extraFields = [
      "requestingSuperAdminUid",
      "authorizationRole",
      "status",
      "role",
      "staffRole",
      "supportPresentation",
      "arbitraryExtraField",
      "metadata",
      "isActive",
    ];

    for (const field of extraFields) {
      assert.throws(
        () =>
          validateAndNormalizeProvisioningRequest(
            { ...validBaseRequest, [field]: "injected-value" },
            validRequesterUid,
            validIsoTimestamp,
          ),
        (err) =>
          err instanceof ProClubProvisioningError &&
          err.code === ERROR_CODES.INVALID_PROVISIONING_REQUEST &&
          (err.message.includes("Unauthorized or unexpected field") ||
            err.message.includes("Caller-supplied")),
        `Must reject extra field '${field}' with ERROR_INVALID_PROVISIONING_REQUEST`,
      );
    }
  });

  await t.test("rejects non-object or array input", () => {
    for (const bad of [null, undefined, "string", 123, true, []]) {
      assert.throws(
        () =>
          validateAndNormalizeProvisioningRequest(
            bad,
            validRequesterUid,
            validIsoTimestamp,
          ),
        (err) =>
          err instanceof ProClubProvisioningError &&
          err.code === ERROR_CODES.INVALID_PROVISIONING_REQUEST,
      );
    }
  });

  await t.test("rejects invalid document identifiers in request fields", () => {
    for (const field of ["provisioningId", "clubId", "initialOwnerUid"] as const) {
      for (const badId of ["", "   ", "has/slash", 123, null, undefined]) {
        const payload = { ...validBaseRequest, [field]: badId };
        assert.throws(
          () =>
            validateAndNormalizeProvisioningRequest(
              payload,
              validRequesterUid,
              validIsoTimestamp,
            ),
          (err) =>
            err instanceof ProClubProvisioningError &&
            err.code === ERROR_CODES.INVALID_PROVISIONING_REQUEST,
        );
      }
    }
  });

  await t.test("rejects empty or whitespace-only name", () => {
    for (const badName of ["", "   ", "\t\n", null, undefined, 12345]) {
      assert.throws(
        () =>
          validateAndNormalizeProvisioningRequest(
            { ...validBaseRequest, name: badName },
            validRequesterUid,
            validIsoTimestamp,
          ),
        (err) =>
          err instanceof ProClubProvisioningError &&
          err.code === ERROR_CODES.INVALID_PROVISIONING_REQUEST,
      );
    }
  });

  await t.test("rejects invalid level", () => {
    for (const badLevel of ["T0", "T4", "PREMIER", "T1_PLUS", "", null, undefined, 1]) {
      assert.throws(
        () =>
          validateAndNormalizeProvisioningRequest(
            { ...validBaseRequest, level: badLevel },
            validRequesterUid,
            validIsoTimestamp,
          ),
        (err) =>
          err instanceof ProClubProvisioningError &&
          err.code === ERROR_CODES.INVALID_PROVISIONING_REQUEST,
      );
    }
  });

  await t.test("rejects wrong types for optional fields (number, boolean, object, array)", () => {
    for (const field of ["shortName", "country", "logoUrl"] as const) {
      for (const badVal of [12345, true, false, { code: "TH" }, ["item"]]) {
        assert.throws(
          () =>
            validateAndNormalizeProvisioningRequest(
              { ...validBaseRequest, [field]: badVal },
              validRequesterUid,
              validIsoTimestamp,
            ),
          (err) =>
            err instanceof ProClubProvisioningError &&
            err.code === ERROR_CODES.INVALID_PROVISIONING_REQUEST,
        );
      }
    }
  });

  await t.test("normalizes whitespace and converts empty optional fields to null", () => {
    const result = validateAndNormalizeProvisioningRequest(
      {
        ...validBaseRequest,
        name: "  Lampang FC  ",
        shortName: "   ",
        country: null,
        logoUrl: undefined,
      },
      validRequesterUid,
      validIsoTimestamp,
    );

    assert.equal(result.normalized.name, "Lampang FC");
    assert.equal(result.normalized.shortName, null);
    assert.equal(result.normalized.country, null);
    assert.equal(result.normalized.logoUrl, null);

    // Stored club payload omits null optional fields
    assert.equal("shortName" in result.clubPayload, false);
    assert.equal("country" in result.clubPayload, false);
    assert.equal("logoUrl" in result.clubPayload, false);
    assert.equal(validateStoredClubPayload(result.clubPayload), true);
  });

  await t.test("validates canonical ISO-8601 UTC timestamp format", () => {
    assert.equal(isValidCanonicalIsoUtcTimestamp("2026-09-04T00:00:00.000Z"), true);
    assert.equal(isValidCanonicalIsoUtcTimestamp("2026-09-04T12:34:56.789Z"), true);

    // Invalid timestamps
    assert.equal(isValidCanonicalIsoUtcTimestamp(""), false);
    assert.equal(isValidCanonicalIsoUtcTimestamp("2026-09-04"), false);
    assert.equal(isValidCanonicalIsoUtcTimestamp("2026-09-04T00:00:00+07:00"), false);
    assert.equal(isValidCanonicalIsoUtcTimestamp("invalid-date"), false);
    assert.equal(isValidCanonicalIsoUtcTimestamp(12345), false);
    assert.equal(isValidCanonicalIsoUtcTimestamp(null), false);
    assert.equal(isValidCanonicalIsoUtcTimestamp(undefined), false);

    assert.throws(
      () =>
        validateAndNormalizeProvisioningRequest(
          validBaseRequest,
          validRequesterUid,
          "invalid-timestamp",
        ),
      (err) =>
        err instanceof ProClubProvisioningError &&
        err.code === ERROR_CODES.PROVISIONING_INTEGRITY,
    );
  });

  await t.test("fingerprint is deterministic and binds all 9 initial fields", () => {
    const normalized1: NormalizedProClubProvisioningRequestV1 = {
      clubId: "club-lampang",
      country: "TH",
      initialOwnerUid: "user-owner-123",
      level: "T1",
      logoUrl: "https://example.com/logo.png",
      name: "Lampang FC",
      provisioningId: "prov-001",
      requestingSuperAdminUid: validRequesterUid,
      shortName: "LFC",
    };
    const fp1 = computeProvisioningRequestFingerprint(normalized1);
    const fp2 = computeProvisioningRequestFingerprint({ ...normalized1 });
    assert.equal(fp1, fp2);
    assert.match(fp1, /^sha256:[a-f0-9]{64}$/);

    // Changing any single field changes fingerprint
    const fieldsToMutate: Array<keyof NormalizedProClubProvisioningRequestV1> = [
      "clubId",
      "country",
      "initialOwnerUid",
      "level",
      "logoUrl",
      "name",
      "provisioningId",
      "requestingSuperAdminUid",
      "shortName",
    ];

    for (const field of fieldsToMutate) {
      const mutated = { ...normalized1, [field]: field === "level" ? "T2" : "different" };
      const fpMutated = computeProvisioningRequestFingerprint(mutated);
      assert.notEqual(fp1, fpMutated, `Fingerprint must change when ${field} is changed`);
    }
  });

  await t.test("audit replay validation succeeds on exact canonical audit", () => {
    const { auditPayload, requestFingerprint } =
      validateAndNormalizeProvisioningRequest(
        validBaseRequest,
        validRequesterUid,
        validIsoTimestamp,
      );

    const replayResult = validateStoredAuditOnReplay(
      auditPayload,
      "prov-lampang-001",
      validRequesterUid,
      requestFingerprint,
    );
    assert.equal(replayResult.status, "COMPLETED");
    assert.equal(replayResult.provisioningId, "prov-lampang-001");
  });

  await t.test("audit replay validation rejects wrong schemaVersion", () => {
    const { auditPayload, requestFingerprint } =
      validateAndNormalizeProvisioningRequest(
        validBaseRequest,
        validRequesterUid,
        validIsoTimestamp,
      );

    assert.throws(
      () =>
        validateStoredAuditOnReplay(
          { ...auditPayload, schemaVersion: 2 },
          "prov-lampang-001",
          validRequesterUid,
          requestFingerprint,
        ),
      (err) =>
        err instanceof ProClubProvisioningError &&
        err.code === ERROR_CODES.PROVISIONING_INTEGRITY,
    );
  });

  await t.test("audit replay validation rejects status PENDING or non-COMPLETED", () => {
    const { auditPayload, requestFingerprint } =
      validateAndNormalizeProvisioningRequest(
        validBaseRequest,
        validRequesterUid,
        validIsoTimestamp,
      );

    assert.throws(
      () =>
        validateStoredAuditOnReplay(
          { ...auditPayload, status: "PENDING" },
          "prov-lampang-001",
          validRequesterUid,
          requestFingerprint,
        ),
      (err) =>
        err instanceof ProClubProvisioningError &&
        err.code === ERROR_CODES.PROVISIONING_INTEGRITY,
    );
  });

  await t.test("audit replay validation rejects extra fields in audit", () => {
    const { auditPayload, requestFingerprint } =
      validateAndNormalizeProvisioningRequest(
        validBaseRequest,
        validRequesterUid,
        validIsoTimestamp,
      );

    assert.throws(
      () =>
        validateStoredAuditOnReplay(
          { ...auditPayload, extraTamperedField: "forbidden" },
          "prov-lampang-001",
          validRequesterUid,
          requestFingerprint,
        ),
      (err) =>
        err instanceof ProClubProvisioningError &&
        err.code === ERROR_CODES.PROVISIONING_INTEGRITY,
    );
  });

  await t.test("audit replay validation rejects malformed fingerprint format", () => {
    const { auditPayload } = validateAndNormalizeProvisioningRequest(
      validBaseRequest,
      validRequesterUid,
      validIsoTimestamp,
    );

    for (const badFp of ["not-a-hash", "sha256:123", "sha256:xyz", ""]) {
      assert.throws(
        () =>
          validateStoredAuditOnReplay(
            { ...auditPayload, requestFingerprint: badFp },
            "prov-lampang-001",
            validRequesterUid,
            badFp,
          ),
        (err) =>
          err instanceof ProClubProvisioningError &&
          err.code === ERROR_CODES.PROVISIONING_INTEGRITY,
      );
    }
  });

  await t.test("exact Club payload server validator passes valid generated payload and rejects invalid shapes", () => {
    const result = validateAndNormalizeProvisioningRequest(
      validBaseRequest,
      validRequesterUid,
      validIsoTimestamp,
    );

    // Exact Club payload passes
    assert.equal(validateStoredClubPayload(result.clubPayload), true);

    // Club with unauthorized extra field fails server validator
    assert.equal(
      validateStoredClubPayload({
        ...result.clubPayload,
        unauthorizedExtraField: "forbidden",
      }),
      false,
    );

    // Malformed Club timestamp fails server validator
    assert.equal(
      validateStoredClubPayload({
        ...result.clubPayload,
        createdAt: "2026-09-04",
      }),
      false,
    );
    assert.equal(
      validateStoredClubPayload({
        ...result.clubPayload,
        updatedAt: "invalid-timestamp",
      }),
      false,
    );
  });

  await t.test("exact membership server validator passes valid payload and rejects extra or invalid fields", () => {
    const result = validateAndNormalizeProvisioningRequest(
      validBaseRequest,
      validRequesterUid,
      validIsoTimestamp,
    );

    // Exact membership passes
    assert.equal(validateStoredMembershipPayload(result.membershipPayload), true);

    // Membership with extra field fails
    assert.equal(
      validateStoredMembershipPayload({
        ...result.membershipPayload,
        auditTraceId: "tampered",
      }),
      false,
    );

    // Membership with wrong role or status fails
    assert.equal(
      validateStoredMembershipPayload({
        authorizationRole: "MEMBER",
        status: "ACTIVE",
      }),
      false,
    );
    assert.equal(
      validateStoredMembershipPayload({
        authorizationRole: "OWNER",
        status: "INACTIVE",
      }),
      false,
    );
  });

  await t.test("audit replay validation rejects fingerprint conflict with incoming request", () => {
    const { auditPayload } = validateAndNormalizeProvisioningRequest(
      validBaseRequest,
      validRequesterUid,
      validIsoTimestamp,
    );

    const differentFingerprint =
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    assert.throws(
      () =>
        validateStoredAuditOnReplay(
          auditPayload,
          "prov-lampang-001",
          validRequesterUid,
          differentFingerprint,
        ),
      (err) =>
        err instanceof ProClubProvisioningError &&
        err.code === ERROR_CODES.PROVISIONING_ID_CONFLICT,
    );
  });

  await t.test("audit replay from second SuperAdmin B produces ERROR_PROVISIONING_ID_CONFLICT", () => {
    // Valid audit produced for SuperAdmin A
    const { auditPayload } = validateAndNormalizeProvisioningRequest(
      validBaseRequest,
      "user-superadmin-A",
      validIsoTimestamp,
    );

    // SuperAdmin B submits same provisioningId/request data
    // The expected request fingerprint is computed using SuperAdmin B
    const { requestFingerprint: expectedFpFromAdminB } =
      validateAndNormalizeProvisioningRequest(
        validBaseRequest,
        "user-superadmin-B",
        validIsoTimestamp,
      );

    // Replay validation must detect fingerprint conflict and throw ERROR_PROVISIONING_ID_CONFLICT
    assert.throws(
      () =>
        validateStoredAuditOnReplay(
          auditPayload,
          "prov-lampang-001",
          "user-superadmin-B",
          expectedFpFromAdminB,
        ),
      (err) =>
        err instanceof ProClubProvisioningError &&
        err.code === ERROR_CODES.PROVISIONING_ID_CONFLICT,
    );
  });

  await t.test("audit replay validation rejects requester mismatch when fingerprint matches (defensive integrity)", () => {
    const { auditPayload, requestFingerprint } =
      validateAndNormalizeProvisioningRequest(
        validBaseRequest,
        validRequesterUid,
        validIsoTimestamp,
      );

    assert.throws(
      () =>
        validateStoredAuditOnReplay(
          auditPayload,
          "prov-lampang-001",
          "user-different-admin",
          requestFingerprint,
        ),
      (err) =>
        err instanceof ProClubProvisioningError &&
        err.code === ERROR_CODES.PROVISIONING_INTEGRITY,
    );
  });
});

test("Server Auth Token Verifier - Unit Tests", async (t) => {
  await t.test("rejects missing or empty authorization header", async () => {
    const verifier = createServerAuthTokenVerifier({
      verifyIdToken: async () => ({ uid: "any" }),
    });

    for (const badHeader of [null, undefined, "", "   ", 123]) {
      await assert.rejects(
        verifier.verifyAuthorizationHeader(badHeader),
        (err) =>
          err instanceof ProClubProvisioningError &&
          err.code === ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
      );
    }
  });

  await t.test("rejects non-Bearer scheme or empty token", async () => {
    const verifier = createServerAuthTokenVerifier({
      verifyIdToken: async () => ({ uid: "any" }),
    });

    for (const badScheme of [
      "Basic abc",
      "Bearer",
      "Bearer ",
      "Token 12345",
      "bearer",
    ]) {
      await assert.rejects(
        verifier.verifyAuthorizationHeader(badScheme),
        (err) =>
          err instanceof ProClubProvisioningError &&
          err.code === ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
      );
    }
  });

  await t.test("rejects when auth.verifyIdToken throws", async () => {
    const verifier = createServerAuthTokenVerifier({
      verifyIdToken: async () => {
        throw new Error("Firebase ID token has expired");
      },
    });

    await assert.rejects(
      verifier.verifyAuthorizationHeader("Bearer expired-token"),
      (err) =>
        err instanceof ProClubProvisioningError &&
        err.code === ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL &&
        err.message.includes("Token verification failed"),
    );
  });

  await t.test("rejects invalid uid from decoded token", async () => {
    for (const badUid of ["", "   ", "has/slash", 123, null, undefined]) {
      const verifier = createServerAuthTokenVerifier({
        verifyIdToken: async () => ({ uid: badUid as unknown as string }),
      });

      await assert.rejects(
        verifier.verifyAuthorizationHeader("Bearer valid-token"),
        (err) =>
          err instanceof ProClubProvisioningError &&
          err.code === ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
      );
    }
  });

  await t.test("extracts verified UID successfully from Bearer token", async () => {
    const verifier = createServerAuthTokenVerifier({
      verifyIdToken: async (token) => {
        assert.equal(token, "test-jwt-token-xyz");
        return { uid: "user-superadmin-789", role: "SUPERADMIN" };
      },
    });

    const uid = await verifier.verifyAuthorizationHeader(
      "Bearer test-jwt-token-xyz",
    );
    assert.equal(uid, "user-superadmin-789");
  });
});
