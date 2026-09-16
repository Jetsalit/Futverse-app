import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import {
  cleanupAdminApp,
  initializeAdminServices,
} from "../functions/src/lib/firebaseAdmin.ts";
import {
  createServerAuthTokenVerifier,
  type MinimalAdminAuth,
} from "../functions/src/lib/serverAuthTokenVerifier.ts";
import {
  ERROR_CODES,
  ProClubProvisioningError,
} from "../functions/src/proClubProvisioning/core.ts";
import {
  createProClubProvisioningService,
  type ProClubProvisioningService,
} from "../functions/src/proClubProvisioning/service.ts";

const PROJECT = "demo-futverse-pro-club-owner-discovery-v1";
const SUPERADMIN = "superadmin-owner-discovery";
const OWNER = "owner-discovery";
const CLUB = "club-owner-discovery";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
assert.ok(
  emulatorHost,
  "SAFETY GATE: FIRESTORE_EMULATOR_HOST must be defined",
);
assert.ok(
  emulatorHost.startsWith("127.0.0.1:") || emulatorHost.startsWith("localhost:"),
  `SAFETY GATE: Firestore emulator must be local, got '${emulatorHost}'`,
);
assert.ok(PROJECT.startsWith("demo-"), "SAFETY GATE: demo project required");

let firestore: Firestore;
let service: ProClubProvisioningService;

const fakeAuth: MinimalAdminAuth = {
  async verifyIdToken(token: string) {
    if (token === "token-superadmin-owner-discovery") {
      return { uid: SUPERADMIN };
    }
    throw new Error("Invalid or unauthenticated token");
  },
};

function requestBody() {
  return {
    provisioningId: "prov-owner-discovery-001",
    clubId: CLUB,
    name: "Owner Discovery FC",
    level: "T3",
    initialOwnerUid: OWNER,
  };
}

async function clearFirestoreEmulator(): Promise<void> {
  const url = `http://${emulatorHost}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`;
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`Failed to clear emulator database: ${response.statusText}`);
  }
}

before(async () => {
  const services = initializeAdminServices({
    projectId: PROJECT,
    requireEmulator: true,
  });
  firestore = services.firestore;
  service = createProClubProvisioningService({
    firestore,
    authTokenVerifier: createServerAuthTokenVerifier(fakeAuth),
    trustedClock: () => new Date("2026-09-16T05:00:00.000Z"),
  });
});

beforeEach(async () => {
  await clearFirestoreEmulator();
  await firestore.collection("users").doc(SUPERADMIN).set({
    role: "SUPERADMIN",
    status: "ACTIVE",
  });
  await firestore.collection("users").doc(OWNER).set({
    role: "USER",
    status: "ACTIVE",
  });
});

after(async () => {
  await cleanupAdminApp();
});

test("successful provisioning atomically creates the exact owner membership discovery pointer", async () => {
  const result = await service.provisionProClub({
    authorizationHeader: "Bearer token-superadmin-owner-discovery",
    requestBody: requestBody(),
  });

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.isReplay, false);

  const club = await firestore.collection("proClubs").doc(CLUB).get();
  assert.equal(club.exists, true);

  const membership = await firestore
    .collection("proClubs")
    .doc(CLUB)
    .collection("members")
    .doc(OWNER)
    .get();
  assert.deepEqual(membership.data(), {
    authorizationRole: "OWNER",
    status: "ACTIVE",
  });

  const audit = await firestore
    .collection("proClubProvisioningAudits")
    .doc("prov-owner-discovery-001")
    .get();
  assert.equal(audit.exists, true);

  const pointer = await firestore
    .collection("users")
    .doc(OWNER)
    .collection("proClubMemberships")
    .doc(CLUB)
    .get();

  assert.deepEqual(
    pointer.exists ? pointer.data() : null,
    { schemaVersion: 1, clubId: CLUB },
  );
});

test("provisioning replay fails closed when the owner discovery pointer is missing", async () => {
  await service.provisionProClub({
    authorizationHeader: "Bearer token-superadmin-owner-discovery",
    requestBody: requestBody(),
  });

  await firestore
    .collection("users")
    .doc(OWNER)
    .collection("proClubMemberships")
    .doc(CLUB)
    .delete();

  await assert.rejects(
    service.provisionProClub({
      authorizationHeader: "Bearer token-superadmin-owner-discovery",
      requestBody: requestBody(),
    }),
    (error) =>
      error instanceof ProClubProvisioningError &&
      error.code === ERROR_CODES.PROVISIONING_INTEGRITY,
  );
});
