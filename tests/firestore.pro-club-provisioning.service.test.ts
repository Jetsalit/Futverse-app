import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import {
  ERROR_CODES,
  ProClubProvisioningError,
  type StoredProClubProvisioningAuditDocument,
} from "../functions/src/proClubProvisioning/core.ts";
import {
  createProClubProvisioningService,
  type ProClubProvisioningService,
} from "../functions/src/proClubProvisioning/service.ts";
import {
  cleanupAdminApp,
  initializeAdminServices,
} from "../functions/src/lib/firebaseAdmin.ts";
import {
  createServerAuthTokenVerifier,
  type MinimalAdminAuth,
} from "../functions/src/lib/serverAuthTokenVerifier.ts";
import type { Firestore } from "firebase-admin/firestore";

const DEMO_PROJECT_ID = "demo-futverse-pro-club-provisioning";

// Hard Safety Gate: Fail immediately before any admin initialization if not targeting local emulator demo project
assert.ok(
  process.env.FIRESTORE_EMULATOR_HOST,
  "SAFETY GATE: FIRESTORE_EMULATOR_HOST environment variable must be defined",
);
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
assert.ok(
  host === "127.0.0.1" || host === "localhost",
  `SAFETY GATE: FIRESTORE_EMULATOR_HOST must be local (127.0.0.1 or localhost), got '${host}'`,
);
assert.ok(
  DEMO_PROJECT_ID.startsWith("demo-"),
  `SAFETY GATE: Project ID must start with 'demo-' to prevent production writes, got '${DEMO_PROJECT_ID}'`,
);

let firestore: Firestore;
let service: ProClubProvisioningService;

const fakeAuth: MinimalAdminAuth = {
  async verifyIdToken(token: string) {
    if (token === "token-active-superadmin") {
      return { uid: "user-superadmin-789" };
    }
    if (token === "token-second-active-superadmin") {
      return { uid: "user-superadmin-second" };
    }
    if (token === "token-inactive-superadmin") {
      return { uid: "user-inactive-superadmin" };
    }
    if (token === "token-data-admin") {
      return { uid: "user-data-admin" };
    }
    if (token === "token-ordinary-user") {
      return { uid: "user-ordinary" };
    }
    if (token === "token-nonexistent-user") {
      return { uid: "user-nonexistent" };
    }
    throw new Error("Invalid or unauthenticated token");
  },
};

const tokenVerifier = createServerAuthTokenVerifier(fakeAuth);

async function clearFirestoreEmulator(): Promise<void> {
  const hostPort = process.env.FIRESTORE_EMULATOR_HOST!;
  const [h, p] = hostPort.split(":");
  const url = `http://${h}:${p}/emulator/v1/projects/${DEMO_PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`Failed to clear emulator database: ${res.statusText}`);
  }
}

async function seedCanonicalUsers(): Promise<void> {
  await firestore.collection("users").doc("user-superadmin-789").set({
    role: "SUPERADMIN",
    status: "ACTIVE",
    name: "Platform SuperAdmin",
  });

  await firestore.collection("users").doc("user-superadmin-second").set({
    role: "SUPERADMIN",
    status: "ACTIVE",
    name: "Second Platform SuperAdmin",
  });

  await firestore.collection("users").doc("user-inactive-superadmin").set({
    role: "SUPERADMIN",
    status: "INACTIVE",
    name: "Inactive SuperAdmin",
  });

  await firestore.collection("users").doc("user-data-admin").set({
    role: "DATA_ADMIN",
    status: "ACTIVE",
    name: "Data Admin",
  });

  await firestore.collection("users").doc("user-ordinary").set({
    role: "USER",
    status: "ACTIVE",
    name: "Ordinary User",
  });

  await firestore.collection("users").doc("user-owner-123").set({
    role: "USER",
    status: "ACTIVE",
    name: "Club Owner",
  });

  await firestore.collection("users").doc("user-inactive-owner").set({
    role: "USER",
    status: "INACTIVE",
    name: "Inactive Owner",
  });
}

before(async () => {
  const services = initializeAdminServices({
    projectId: DEMO_PROJECT_ID,
    requireEmulator: true,
  });
  firestore = services.firestore;

  service = createProClubProvisioningService({
    firestore,
    authTokenVerifier: tokenVerifier,
    trustedClock: () => new Date("2026-09-04T00:00:00.000Z"),
  });
});

beforeEach(async () => {
  await clearFirestoreEmulator();
  await seedCanonicalUsers();
});

after(async () => {
  await cleanupAdminApp();
});

test("ACTIVE SUPERADMIN success: creates Club, OWNER, and Audit in exact 3-way atomic transaction", async () => {
  const request = {
    provisioningId: "prov-lampang-001",
    clubId: "club-lampang",
    name: "Lampang FC",
    shortName: "LFC",
    level: "T1",
    country: "TH",
    logoUrl: "https://example.com/logo.png",
    initialOwnerUid: "user-owner-123",
  };

  const result = await service.provisionProClub({
    authorizationHeader: "Bearer token-active-superadmin",
    requestBody: request,
  });

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.isReplay, false);
  assert.equal(result.provisioningId, "prov-lampang-001");
  assert.equal(result.clubId, "club-lampang");
  assert.equal(result.ownerUid, "user-owner-123");
  assert.equal(result.requestingSuperAdminUid, "user-superadmin-789");
  assert.equal(result.createdAt, "2026-09-04T00:00:00.000Z");

  // 1. Verify Club document
  const clubSnap = await firestore.collection("proClubs").doc("club-lampang").get();
  assert.equal(clubSnap.exists, true);
  const clubData = clubSnap.data();
  assert.equal(clubData?.name, "Lampang FC");
  assert.equal(clubData?.shortName, "LFC");
  assert.equal(clubData?.level, "T1");
  assert.equal(clubData?.status, "ACTIVE");
  assert.equal(clubData?.country, "TH");
  assert.equal(clubData?.logoUrl, "https://example.com/logo.png");
  assert.equal(clubData?.createdAt, "2026-09-04T00:00:00.000Z");
  assert.equal(clubData?.updatedAt, "2026-09-04T00:00:00.000Z");

  // 2. Verify exact OWNER membership
  const memberSnap = await firestore
    .collection("proClubs")
    .doc("club-lampang")
    .collection("members")
    .doc("user-owner-123")
    .get();
  assert.equal(memberSnap.exists, true);
  assert.deepEqual(memberSnap.data(), {
    authorizationRole: "OWNER",
    status: "ACTIVE",
  });

  // 3. Verify exact Audit document
  const auditSnap = await firestore
    .collection("proClubProvisioningAudits")
    .doc("prov-lampang-001")
    .get();
  assert.equal(auditSnap.exists, true);
  const auditData = auditSnap.data() as StoredProClubProvisioningAuditDocument;
  assert.equal(auditData.schemaVersion, 1);
  assert.equal(auditData.provisioningId, "prov-lampang-001");
  assert.equal(auditData.clubId, "club-lampang");
  assert.equal(auditData.ownerUid, "user-owner-123");
  assert.equal(auditData.requestingSuperAdminUid, "user-superadmin-789");
  assert.equal(auditData.status, "COMPLETED");
  assert.equal(auditData.createdAt, "2026-09-04T00:00:00.000Z");
  assert.match(auditData.requestFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(auditData.normalizedRequest.name, "Lampang FC");

  // 4. Verify no staff document created
  const staffSnap = await firestore
    .collection("proClubs")
    .doc("club-lampang")
    .collection("staff")
    .get();
  assert.equal(staffSnap.size, 0);

  // 5. Verify no invitation document created
  const inviteSnap = await firestore.collection("proClubInvites").get();
  assert.equal(inviteSnap.size, 0);
});

test("inactive SUPERADMIN fail", async () => {
  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-inactive-superadmin",
      requestBody: {
        provisioningId: "prov-inactive-001",
        clubId: "club-inactive",
        name: "Inactive FC",
        level: "T1",
        initialOwnerUid: "user-owner-123",
      },
    }),
    (err) =>
      err instanceof ProClubProvisioningError &&
      err.code === ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL &&
      err.message.includes("not active"),
  );
});

test("DATA_ADMIN fail", async () => {
  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-data-admin",
      requestBody: {
        provisioningId: "prov-data-admin-001",
        clubId: "club-data-admin",
        name: "Data Admin FC",
        level: "T1",
        initialOwnerUid: "user-owner-123",
      },
    }),
    (err) =>
      err instanceof ProClubProvisioningError &&
      err.code === ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL &&
      err.message.includes("not a SUPERADMIN"),
  );
});

test("ordinary user fail", async () => {
  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-ordinary-user",
      requestBody: {
        provisioningId: "prov-ordinary-001",
        clubId: "club-ordinary",
        name: "Ordinary FC",
        level: "T1",
        initialOwnerUid: "user-owner-123",
      },
    }),
    (err) =>
      err instanceof ProClubProvisioningError &&
      err.code === ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL &&
      err.message.includes("not a SUPERADMIN"),
  );
});

test("missing owner fail", async () => {
  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-active-superadmin",
      requestBody: {
        provisioningId: "prov-missing-owner-001",
        clubId: "club-missing-owner",
        name: "Missing Owner FC",
        level: "T1",
        initialOwnerUid: "user-nonexistent",
      },
    }),
    (err) =>
      err instanceof ProClubProvisioningError &&
      err.code === ERROR_CODES.INVALID_OWNER &&
      err.message.includes("does not exist"),
  );
});

test("inactive owner fail", async () => {
  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-active-superadmin",
      requestBody: {
        provisioningId: "prov-inactive-owner-001",
        clubId: "club-inactive-owner",
        name: "Inactive Owner FC",
        level: "T1",
        initialOwnerUid: "user-inactive-owner",
      },
    }),
    (err) =>
      err instanceof ProClubProvisioningError &&
      err.code === ERROR_CODES.INVALID_OWNER &&
      err.message.includes("not active"),
  );
});

test("existing club fail", async () => {
  await firestore.collection("proClubs").doc("club-existing").set({
    name: "Pre-existing Club",
    level: "T1",
    status: "ACTIVE",
  });

  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-active-superadmin",
      requestBody: {
        provisioningId: "prov-existing-club-001",
        clubId: "club-existing",
        name: "Existing FC",
        level: "T1",
        initialOwnerUid: "user-owner-123",
      },
    }),
    (err) =>
      err instanceof ProClubProvisioningError &&
      err.code === ERROR_CODES.CLUB_EXISTS,
  );
});

test("orphan OWNER fail", async () => {
  await firestore
    .collection("proClubs")
    .doc("club-orphan")
    .collection("members")
    .doc("user-owner-123")
    .set({
      authorizationRole: "OWNER",
      status: "ACTIVE",
    });

  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-active-superadmin",
      requestBody: {
        provisioningId: "prov-orphan-001",
        clubId: "club-orphan",
        name: "Orphan FC",
        level: "T1",
        initialOwnerUid: "user-owner-123",
      },
    }),
    (err) =>
      err instanceof ProClubProvisioningError &&
      err.code === ERROR_CODES.PROVISIONING_INTEGRITY &&
      err.message.includes("Orphan or pre-existing OWNER"),
  );
});

test("zero partial state on failure", async () => {
  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-active-superadmin",
      requestBody: {
        provisioningId: "prov-fail-zero-001",
        clubId: "club-fail-zero",
        name: "Fail Zero FC",
        level: "T1",
        initialOwnerUid: "user-nonexistent",
      },
    }),
  );

  const clubSnap = await firestore.collection("proClubs").doc("club-fail-zero").get();
  const memberSnap = await firestore
    .collection("proClubs")
    .doc("club-fail-zero")
    .collection("members")
    .doc("user-nonexistent")
    .get();
  const auditSnap = await firestore
    .collection("proClubProvisioningAudits")
    .doc("prov-fail-zero-001")
    .get();

  assert.equal(clubSnap.exists, false);
  assert.equal(memberSnap.exists, false);
  assert.equal(auditSnap.exists, false);
});

test("same request idempotent retry", async () => {
  const request = {
    provisioningId: "prov-retry-001",
    clubId: "club-retry",
    name: "Retry FC",
    level: "T1",
    initialOwnerUid: "user-owner-123",
  };

  const firstResult = await service.provisionProClub({
    authorizationHeader: "Bearer token-active-superadmin",
    requestBody: request,
  });
  assert.equal(firstResult.isReplay, false);

  const secondResult = await service.provisionProClub({
    authorizationHeader: "Bearer token-active-superadmin",
    requestBody: request,
  });
  assert.equal(secondResult.isReplay, true);
  assert.equal(secondResult.status, "COMPLETED");
  assert.equal(secondResult.provisioningId, "prov-retry-001");
});

test("same provisioningId changed request conflict", async () => {
  const request = {
    provisioningId: "prov-conflict-001",
    clubId: "club-conflict",
    name: "Original FC",
    level: "T1",
    initialOwnerUid: "user-owner-123",
  };

  await service.provisionProClub({
    authorizationHeader: "Bearer token-active-superadmin",
    requestBody: request,
  });

  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-active-superadmin",
      requestBody: {
        ...request,
        name: "Altered FC",
      },
    }),
    (err) =>
      err instanceof ProClubProvisioningError &&
      err.code === ERROR_CODES.PROVISIONING_ID_CONFLICT,
  );
});

test("malformed audit fail on replay", async () => {
  const request = {
    provisioningId: "prov-malformed-audit-001",
    clubId: "club-malformed-audit",
    name: "Malformed FC",
    level: "T1",
    initialOwnerUid: "user-owner-123",
  };

  await service.provisionProClub({
    authorizationHeader: "Bearer token-active-superadmin",
    requestBody: request,
  });

  await firestore
    .collection("proClubProvisioningAudits")
    .doc("prov-malformed-audit-001")
    .set({
      schemaVersion: 1,
      provisioningId: "prov-malformed-audit-001",
      // Missing clubId, ownerUid, etc.
    });

  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-active-superadmin",
      requestBody: request,
    }),
    (err) =>
      err instanceof ProClubProvisioningError &&
      err.code === ERROR_CODES.PROVISIONING_INTEGRITY,
  );
});

test("audit wrong schemaVersion fail", async () => {
  const request = {
    provisioningId: "prov-bad-schema-001",
    clubId: "club-bad-schema",
    name: "Bad Schema FC",
    level: "T1",
    initialOwnerUid: "user-owner-123",
  };

  await service.provisionProClub({
    authorizationHeader: "Bearer token-active-superadmin",
    requestBody: request,
  });

  await firestore
    .collection("proClubProvisioningAudits")
    .doc("prov-bad-schema-001")
    .update({ schemaVersion: 2 });

  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-active-superadmin",
      requestBody: request,
    }),
    (err) =>
      err instanceof ProClubProvisioningError &&
      err.code === ERROR_CODES.PROVISIONING_INTEGRITY,
  );
});

test("audit status PENDING fail", async () => {
  const request = {
    provisioningId: "prov-pending-audit-001",
    clubId: "club-pending-audit",
    name: "Pending Audit FC",
    level: "T1",
    initialOwnerUid: "user-owner-123",
  };

  await service.provisionProClub({
    authorizationHeader: "Bearer token-active-superadmin",
    requestBody: request,
  });

  await firestore
    .collection("proClubProvisioningAudits")
    .doc("prov-pending-audit-001")
    .update({ status: "PENDING" });

  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-active-superadmin",
      requestBody: request,
    }),
    (err) =>
      err instanceof ProClubProvisioningError &&
      err.code === ERROR_CODES.PROVISIONING_INTEGRITY,
  );
});

test("audit invalid timestamp fail", async () => {
  const request = {
    provisioningId: "prov-bad-ts-001",
    clubId: "club-bad-ts",
    name: "Bad Timestamp FC",
    level: "T1",
    initialOwnerUid: "user-owner-123",
  };

  await service.provisionProClub({
    authorizationHeader: "Bearer token-active-superadmin",
    requestBody: request,
  });

  await firestore
    .collection("proClubProvisioningAudits")
    .doc("prov-bad-ts-001")
    .update({ createdAt: "not-an-iso-date" });

  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-active-superadmin",
      requestBody: request,
    }),
    (err) =>
      err instanceof ProClubProvisioningError &&
      err.code === ERROR_CODES.PROVISIONING_INTEGRITY,
  );
});

test("audit extra field fail", async () => {
  const request = {
    provisioningId: "prov-extra-field-001",
    clubId: "club-extra-field",
    name: "Extra Field FC",
    level: "T1",
    initialOwnerUid: "user-owner-123",
  };

  await service.provisionProClub({
    authorizationHeader: "Bearer token-active-superadmin",
    requestBody: request,
  });

  await firestore
    .collection("proClubProvisioningAudits")
    .doc("prov-extra-field-001")
    .update({ unauthorizedExtraField: "bad" });

  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-active-superadmin",
      requestBody: request,
    }),
    (err) =>
      err instanceof ProClubProvisioningError &&
      err.code === ERROR_CODES.PROVISIONING_INTEGRITY,
  );
});

test("audit fingerprint mismatch fail", async () => {
  const request = {
    provisioningId: "prov-fp-mismatch-001",
    clubId: "club-fp-mismatch",
    name: "Fingerprint Mismatch FC",
    level: "T1",
    initialOwnerUid: "user-owner-123",
  };

  await service.provisionProClub({
    authorizationHeader: "Bearer token-active-superadmin",
    requestBody: request,
  });

  await firestore
    .collection("proClubProvisioningAudits")
    .doc("prov-fp-mismatch-001")
    .update({
      requestFingerprint:
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    });

  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-active-superadmin",
      requestBody: request,
    }),
    (err) =>
      err instanceof ProClubProvisioningError &&
      err.code === ERROR_CODES.PROVISIONING_INTEGRITY,
  );
});

test("missing Club on replay fail", async () => {
  const request = {
    provisioningId: "prov-missing-club-replay-001",
    clubId: "club-missing-club-replay",
    name: "Missing Club FC",
    level: "T1",
    initialOwnerUid: "user-owner-123",
  };

  await service.provisionProClub({
    authorizationHeader: "Bearer token-active-superadmin",
    requestBody: request,
  });

  await firestore.collection("proClubs").doc("club-missing-club-replay").delete();

  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-active-superadmin",
      requestBody: request,
    }),
    (err) =>
      err instanceof ProClubProvisioningError &&
      err.code === ERROR_CODES.PROVISIONING_INTEGRITY &&
      err.message.includes("Pro Club does not exist"),
  );
});

test("missing OWNER on replay fail", async () => {
  const request = {
    provisioningId: "prov-missing-owner-replay-001",
    clubId: "club-missing-owner-replay",
    name: "Missing Owner FC",
    level: "T1",
    initialOwnerUid: "user-owner-123",
  };

  await service.provisionProClub({
    authorizationHeader: "Bearer token-active-superadmin",
    requestBody: request,
  });

  await firestore
    .collection("proClubs")
    .doc("club-missing-owner-replay")
    .collection("members")
    .doc("user-owner-123")
    .delete();

  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-active-superadmin",
      requestBody: request,
    }),
    (err) =>
      err instanceof ProClubProvisioningError &&
      err.code === ERROR_CODES.PROVISIONING_INTEGRITY &&
      err.message.includes("Initial owner membership does not exist"),
  );
});

test("wrong OWNER payload fail", async () => {
  const request = {
    provisioningId: "prov-wrong-owner-001",
    clubId: "club-wrong-owner",
    name: "Wrong Owner FC",
    level: "T1",
    initialOwnerUid: "user-owner-123",
  };

  await service.provisionProClub({
    authorizationHeader: "Bearer token-active-superadmin",
    requestBody: request,
  });

  await firestore
    .collection("proClubs")
    .doc("club-wrong-owner")
    .collection("members")
    .doc("user-owner-123")
    .update({ authorizationRole: "MEMBER" });

  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-active-superadmin",
      requestBody: request,
    }),
    (err) =>
      err instanceof ProClubProvisioningError &&
      err.code === ERROR_CODES.PROVISIONING_INTEGRITY &&
      err.message.includes("ACTIVE OWNER"),
  );
});

test("mutated membership with extra field fails replay with ERROR_PROVISIONING_INTEGRITY", async () => {
  const request = {
    provisioningId: "prov-tampered-owner-001",
    clubId: "club-tampered-owner",
    name: "Tampered Owner FC",
    level: "T1",
    initialOwnerUid: "user-owner-123",
  };

  await service.provisionProClub({
    authorizationHeader: "Bearer token-active-superadmin",
    requestBody: request,
  });

  // Mutate membership by adding unauthorized extra field (tampered state)
  await firestore
    .collection("proClubs")
    .doc("club-tampered-owner")
    .collection("members")
    .doc("user-owner-123")
    .update({ auditTraceId: "tampered" });

  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-active-superadmin",
      requestBody: request,
    }),
    (err) =>
      err instanceof ProClubProvisioningError &&
      err.code === ERROR_CODES.PROVISIONING_INTEGRITY &&
      err.message.includes("ACTIVE OWNER"),
  );
});

test("replay same provisioningId from second active SuperAdmin fails with ERROR_PROVISIONING_ID_CONFLICT", async () => {
  const request = {
    provisioningId: "prov-dual-superadmin-001",
    clubId: "club-dual-superadmin",
    name: "Dual SuperAdmin FC",
    level: "T1",
    initialOwnerUid: "user-owner-123",
  };

  // SuperAdmin A provisions successfully
  const resultA = await service.provisionProClub({
    authorizationHeader: "Bearer token-active-superadmin",
    requestBody: request,
  });
  assert.equal(resultA.status, "COMPLETED");
  assert.equal(resultA.isReplay, false);
  assert.equal(resultA.requestingSuperAdminUid, "user-superadmin-789");

  // Replay same provisioningId from SuperAdmin B with otherwise identical request
  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-second-active-superadmin",
      requestBody: request,
    }),
    (err) =>
      err instanceof ProClubProvisioningError &&
      err.code === ERROR_CODES.PROVISIONING_ID_CONFLICT,
  );

  // Verify existing canonical resources are unchanged (zero writes)
  const auditSnap = await firestore
    .collection("proClubProvisioningAudits")
    .doc("prov-dual-superadmin-001")
    .get();
  assert.equal(auditSnap.exists, true);
  assert.equal(
    auditSnap.data()?.requestingSuperAdminUid,
    "user-superadmin-789",
  );
});
