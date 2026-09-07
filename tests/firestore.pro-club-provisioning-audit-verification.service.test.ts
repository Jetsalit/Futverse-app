import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import {
  computeProvisioningRequestFingerprint,
  type NormalizedProClubProvisioningRequestV1,
} from "../functions/src/proClubProvisioning/core.ts";
import {
  cleanupAdminApp,
  initializeAdminServices,
} from "../functions/src/lib/firebaseAdmin.ts";
import {
  createServerAuthTokenVerifier,
  type MinimalAdminAuth,
} from "../functions/src/lib/serverAuthTokenVerifier.ts";
import {
  AUDIT_VERIFICATION_CLASSIFICATIONS,
  AUDIT_VERIFICATION_ERROR_CODES,
  ProClubProvisioningAuditVerificationError,
} from "../functions/src/proClubProvisioningAuditVerification/core.ts";
import {
  createProClubProvisioningAuditVerificationService,
  type ProClubProvisioningAuditVerificationService,
} from "../functions/src/proClubProvisioningAuditVerification/service.ts";

const PROJECT_ID = "demo-futverse-pro-club-audit-verification";

assert.ok(
  process.env.FIRESTORE_EMULATOR_HOST,
  "SAFETY GATE: FIRESTORE_EMULATOR_HOST must be defined",
);
const [emulatorHost] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
assert.ok(
  emulatorHost === "127.0.0.1" || emulatorHost === "localhost",
  `SAFETY GATE: emulator host must be local, got ${emulatorHost}`,
);
assert.ok(PROJECT_ID.startsWith("demo-"), "SAFETY GATE: project must be demo-* only");

let firestore: Firestore;
let service: ProClubProvisioningAuditVerificationService;

const fakeAuth: MinimalAdminAuth = {
  async verifyIdToken(token: string) {
    const uids: Record<string, string> = {
      "token-current-superadmin": "current-superadmin",
      "token-second-superadmin": "second-superadmin",
      "token-inactive-superadmin": "inactive-superadmin",
      "token-owner": "owner-1",
      "token-staff": "staff-1",
    };
    const uid = uids[token];
    if (!uid) throw new Error("invalid token");
    return { uid };
  },
};

const normalized: NormalizedProClubProvisioningRequestV1 = {
  clubId: "club-lampang",
  country: "TH",
  initialOwnerUid: "owner-1",
  level: "T1",
  logoUrl: null,
  name: "Lampang FC",
  provisioningId: "prov-1",
  requestingSuperAdminUid: "historical-superadmin",
  shortName: "LFC",
};

function canonicalAudit() {
  return {
    schemaVersion: 1,
    provisioningId: "prov-1",
    clubId: "club-lampang",
    ownerUid: "owner-1",
    requestingSuperAdminUid: "historical-superadmin",
    requestFingerprint: computeProvisioningRequestFingerprint(normalized),
    normalizedRequest: { ...normalized },
    createdAt: "2026-09-04T00:00:00.000Z",
    status: "COMPLETED",
  };
}

async function clearEmulator() {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(":");
  const response = await fetch(
    `http://${host}:${port}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  assert.equal(response.ok, true, "failed to clear Firestore emulator");
}

async function seedCanonicalState() {
  const batch = firestore.batch();
  batch.set(firestore.collection("users").doc("current-superadmin"), {
    role: "SUPERADMIN",
    status: "ACTIVE",
    name: "Current SuperAdmin",
  });
  batch.set(firestore.collection("users").doc("second-superadmin"), {
    role: "SUPERADMIN",
    status: "Active",
    name: "Second SuperAdmin",
  });
  batch.set(firestore.collection("users").doc("inactive-superadmin"), {
    role: "SUPERADMIN",
    status: "INACTIVE",
  });
  batch.set(firestore.collection("users").doc("owner-1"), {
    role: "USER",
    status: "ACTIVE",
  });
  batch.set(firestore.collection("users").doc("staff-1"), {
    role: "STAFF",
    status: "ACTIVE",
  });
  batch.set(firestore.collection("proClubProvisioningAudits").doc("prov-1"), canonicalAudit());
  batch.set(firestore.collection("proClubs").doc("club-lampang"), {
    name: "Lampang FC Current Name",
    shortName: "LAMP",
    level: "T2",
    status: "ACTIVE",
    country: "TH",
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
  });
  batch.set(
    firestore.collection("proClubs").doc("club-lampang").collection("members").doc("owner-1"),
    { authorizationRole: "OWNER", status: "ACTIVE" },
  );
  await batch.commit();
}

async function stateFingerprint(): Promise<string> {
  const paths = [
    "users/current-superadmin",
    "users/second-superadmin",
    "users/inactive-superadmin",
    "users/owner-1",
    "users/staff-1",
    "proClubProvisioningAudits/prov-1",
    "proClubs/club-lampang",
    "proClubs/club-lampang/members/owner-1",
  ];
  const snapshots = await Promise.all(paths.map((path) => firestore.doc(path).get()));
  return JSON.stringify(
    snapshots.map((snap, index) => [paths[index], snap.exists, snap.data() ?? null]),
  );
}

function isVerificationError(error: unknown, classification: string, code: string) {
  return (
    error instanceof ProClubProvisioningAuditVerificationError &&
    error.classification === classification &&
    error.code === code
  );
}

before(async () => {
  const admin = initializeAdminServices({ projectId: PROJECT_ID, requireEmulator: true });
  firestore = admin.firestore;
  service = createProClubProvisioningAuditVerificationService({
    firestore,
    authTokenVerifier: createServerAuthTokenVerifier(fakeAuth),
  });
});

beforeEach(async () => {
  await clearEmulator();
  await seedCanonicalState();
});

after(async () => {
  await cleanupAdminApp();
});

test("different current ACTIVE SUPERADMIN verifies historical audit with zero mutation", async () => {
  const beforeState = await stateFingerprint();
  const result = await service.verifyAudit({
    authorizationHeader: "Bearer token-second-superadmin",
    requestBody: { provisioningId: "prov-1" },
  });
  const afterState = await stateFingerprint();
  assert.deepEqual(result, {
    status: "VERIFIED",
    provisioningId: "prov-1",
    clubId: "club-lampang",
    ownerUid: "owner-1",
    createdAt: "2026-09-04T00:00:00.000Z",
  });
  assert.equal(beforeState, afterState);
});

test("historical provisioning actor does not need current user document", async () => {
  await firestore.collection("users").doc("historical-superadmin").delete();
  const result = await service.verifyAudit({
    authorizationHeader: "Bearer token-current-superadmin",
    requestBody: { provisioningId: "prov-1" },
  });
  assert.equal(result.status, "VERIFIED");
});

test("inactive SUPERADMIN, tenant OWNER, and staff are denied", async () => {
  for (const token of ["token-inactive-superadmin", "token-owner", "token-staff"]) {
    const beforeState = await stateFingerprint();
    await assert.rejects(
      service.verifyAudit({
        authorizationHeader: `Bearer ${token}`,
        requestBody: { provisioningId: "prov-1" },
      }),
      (error) =>
        isVerificationError(
          error,
          AUDIT_VERIFICATION_CLASSIFICATIONS.UNAUTHORIZED,
          AUDIT_VERIFICATION_ERROR_CODES.UNAUTHORIZED,
        ),
    );
    assert.equal(await stateFingerprint(), beforeState);
  }
});

test("unauthorized caller cannot distinguish existing from missing audit", async () => {
  for (const provisioningId of ["prov-1", "missing-prov"]) {
    await assert.rejects(
      service.verifyAudit({
        authorizationHeader: "Bearer token-owner",
        requestBody: { provisioningId },
      }),
      (error) =>
        isVerificationError(
          error,
          AUDIT_VERIFICATION_CLASSIFICATIONS.UNAUTHORIZED,
          AUDIT_VERIFICATION_ERROR_CODES.UNAUTHORIZED,
        ),
    );
  }
});

test("authorized missing audit returns NOT_FOUND and zero mutation", async () => {
  const beforeState = await stateFingerprint();
  await assert.rejects(
    service.verifyAudit({
      authorizationHeader: "Bearer token-current-superadmin",
      requestBody: { provisioningId: "missing-prov" },
    }),
    (error) =>
      isVerificationError(
        error,
        AUDIT_VERIFICATION_CLASSIFICATIONS.NOT_FOUND,
        AUDIT_VERIFICATION_ERROR_CODES.NOT_FOUND,
      ),
  );
  assert.equal(await stateFingerprint(), beforeState);
});

test("audit fingerprint tamper fails closed with zero mutation", async () => {
  await firestore.collection("proClubProvisioningAudits").doc("prov-1").update({
    requestFingerprint: `sha256:${"0".repeat(64)}`,
  });
  const beforeState = await stateFingerprint();
  await assert.rejects(
    service.verifyAudit({
      authorizationHeader: "Bearer token-current-superadmin",
      requestBody: { provisioningId: "prov-1" },
    }),
    (error) =>
      isVerificationError(
        error,
        AUDIT_VERIFICATION_CLASSIFICATIONS.INTEGRITY_FAILURE,
        AUDIT_VERIFICATION_ERROR_CODES.INTEGRITY_FAILURE,
      ),
  );
  assert.equal(await stateFingerprint(), beforeState);
});

test("inactive club and non-exact OWNER fail closed", async () => {
  for (const mutation of [
    async () => firestore.collection("proClubs").doc("club-lampang").update({ status: "INACTIVE" }),
    async () =>
      firestore
        .collection("proClubs")
        .doc("club-lampang")
        .collection("members")
        .doc("owner-1")
        .set({ authorizationRole: "ADMIN", status: "ACTIVE" }),
  ]) {
    await clearEmulator();
    await seedCanonicalState();
    await mutation();
    const beforeState = await stateFingerprint();
    await assert.rejects(
      service.verifyAudit({
        authorizationHeader: "Bearer token-current-superadmin",
        requestBody: { provisioningId: "prov-1" },
      }),
      (error) =>
        isVerificationError(
          error,
          AUDIT_VERIFICATION_CLASSIFICATIONS.INTEGRITY_FAILURE,
          AUDIT_VERIFICATION_ERROR_CODES.INTEGRITY_FAILURE,
        ),
    );
    assert.equal(await stateFingerprint(), beforeState);
  }
});

test("repeated verification is idempotent and needs no staff/invite/Academy records", async () => {
  const beforeState = await stateFingerprint();
  const request = {
    authorizationHeader: "Bearer token-current-superadmin",
    requestBody: { provisioningId: "prov-1" },
  };
  const first = await service.verifyAudit(request);
  const second = await service.verifyAudit(request);
  assert.deepEqual(first, second);
  assert.equal((await firestore.collection("proClubs").doc("club-lampang").collection("staff").get()).empty, true);
  assert.equal((await firestore.collection("proClubInvites").get()).empty, true);
  assert.equal((await firestore.collection("academies").get()).empty, true);
  assert.equal(await stateFingerprint(), beforeState);
});
