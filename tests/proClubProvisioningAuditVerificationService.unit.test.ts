import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import {
  computeProvisioningRequestFingerprint,
  type NormalizedProClubProvisioningRequestV1,
} from "../functions/src/proClubProvisioning/core.ts";
import type { ServerAuthTokenVerifier } from "../functions/src/lib/serverAuthTokenVerifier.ts";
import {
  AUDIT_VERIFICATION_CLASSIFICATIONS,
  AUDIT_VERIFICATION_ERROR_CODES,
  ProClubProvisioningAuditVerificationError,
} from "../functions/src/proClubProvisioningAuditVerification/core.ts";
import {
  createProClubProvisioningAuditVerificationService,
} from "../functions/src/proClubProvisioningAuditVerification/service.ts";

class FakeDocumentReference {
  constructor(readonly path: string) {}
  collection(name: string) {
    return new FakeCollectionReference(`${this.path}/${name}`);
  }
}

class FakeCollectionReference {
  constructor(readonly path: string) {}
  doc(id: string) {
    return new FakeDocumentReference(`${this.path}/${id}`);
  }
}

class FakeFirestore {
  readonly reads: string[] = [];
  readonly mutations: string[] = [];
  transactionCalls = 0;
  failTransaction = false;

  constructor(readonly documents: Map<string, unknown>) {}

  collection(name: string) {
    return new FakeCollectionReference(name);
  }

  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    this.transactionCalls += 1;
    if (this.failTransaction) throw new Error("snapshot unavailable");
    const tx = {
      get: async (ref: FakeDocumentReference) => {
        this.reads.push(ref.path);
        const exists = this.documents.has(ref.path);
        return {
          exists,
          data: () => this.documents.get(ref.path),
        };
      },
      set: () => this.mutations.push("set"),
      create: () => this.mutations.push("create"),
      update: () => this.mutations.push("update"),
      delete: () => this.mutations.push("delete"),
    };
    return fn(tx);
  }
}

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

function canonicalDocs() {
  const audit = {
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
  return new Map<string, unknown>([
    ["users/current-superadmin", { role: "SUPERADMIN", status: "ACTIVE", name: "Current" }],
    ["users/inactive-superadmin", { role: "SUPERADMIN", status: "INACTIVE" }],
    ["users/owner-1", { role: "USER", status: "ACTIVE" }],
    ["users/staff-1", { role: "STAFF", status: "ACTIVE" }],
    ["proClubProvisioningAudits/prov-1", audit],
    [
      "proClubs/club-lampang",
      {
        name: "Lampang FC Renamed",
        shortName: "LP",
        level: "T2",
        status: "ACTIVE",
        country: "TH",
        createdAt: "2026-09-04T00:00:00.000Z",
        updatedAt: "2026-09-07T00:00:00.000Z",
      },
    ],
    [
      "proClubs/club-lampang/members/owner-1",
      { authorizationRole: "OWNER", status: "ACTIVE" },
    ],
  ]);
}

function authFor(uid: string): ServerAuthTokenVerifier {
  return {
    async verifyAuthorizationHeader() {
      return uid;
    },
  };
}

function assertVerificationError(
  error: unknown,
  classification: string,
  code: string,
) {
  return (
    error instanceof ProClubProvisioningAuditVerificationError &&
    error.classification === classification &&
    error.code === code
  );
}

test("Pro Club Provisioning Audit Verification Service", async (t) => {
  await t.test("valid current ACTIVE SUPERADMIN verifies audit from different historical actor", async () => {
    const fake = new FakeFirestore(canonicalDocs());
    const service = createProClubProvisioningAuditVerificationService({
      firestore: fake as unknown as Firestore,
      authTokenVerifier: authFor("current-superadmin"),
    });
    const result = await service.verifyAudit({
      authorizationHeader: "Bearer redacted",
      requestBody: { provisioningId: "prov-1" },
    });
    assert.deepEqual(result, {
      status: "VERIFIED",
      provisioningId: "prov-1",
      clubId: "club-lampang",
      ownerUid: "owner-1",
      createdAt: "2026-09-04T00:00:00.000Z",
    });
    assert.deepEqual(fake.reads, [
      "users/current-superadmin",
      "proClubProvisioningAudits/prov-1",
      "proClubs/club-lampang",
      "proClubs/club-lampang/members/owner-1",
    ]);
    assert.equal(fake.reads.includes("users/historical-superadmin"), false);
    assert.equal(fake.transactionCalls, 1);
    assert.deepEqual(fake.mutations, []);
  });

  await t.test("historical actor need not exist or remain active", async () => {
    const docs = canonicalDocs();
    docs.delete("users/historical-superadmin");
    const fake = new FakeFirestore(docs);
    const service = createProClubProvisioningAuditVerificationService({
      firestore: fake as unknown as Firestore,
      authTokenVerifier: authFor("current-superadmin"),
    });
    const result = await service.verifyAudit({
      authorizationHeader: "Bearer redacted",
      requestBody: { provisioningId: "prov-1" },
    });
    assert.equal(result.status, "VERIFIED");
    assert.equal(fake.reads.some((path) => path.includes("historical-superadmin")), false);
  });

  await t.test("inactive or non-SUPERADMIN is denied before audit read", async () => {
    for (const uid of ["inactive-superadmin", "owner-1", "staff-1"]) {
      const fake = new FakeFirestore(canonicalDocs());
      const service = createProClubProvisioningAuditVerificationService({
        firestore: fake as unknown as Firestore,
        authTokenVerifier: authFor(uid),
      });
      await assert.rejects(
        service.verifyAudit({
          authorizationHeader: "Bearer redacted",
          requestBody: { provisioningId: "prov-1" },
        }),
        (error) =>
          assertVerificationError(
            error,
            AUDIT_VERIFICATION_CLASSIFICATIONS.UNAUTHORIZED,
            AUDIT_VERIFICATION_ERROR_CODES.UNAUTHORIZED,
          ),
      );
      assert.deepEqual(fake.reads, [`users/${uid}`]);
      assert.deepEqual(fake.mutations, []);
    }
  });

  await t.test("invalid authentication is denied before transaction and existence lookup", async () => {
    const fake = new FakeFirestore(canonicalDocs());
    const authTokenVerifier: ServerAuthTokenVerifier = {
      async verifyAuthorizationHeader() {
        throw new Error("invalid token");
      },
    };
    const service = createProClubProvisioningAuditVerificationService({
      firestore: fake as unknown as Firestore,
      authTokenVerifier,
    });
    await assert.rejects(
      service.verifyAudit({
        authorizationHeader: "Bearer attacker",
        requestBody: { provisioningId: "prov-1" },
      }),
      (error) =>
        assertVerificationError(
          error,
          AUDIT_VERIFICATION_CLASSIFICATIONS.UNAUTHORIZED,
          AUDIT_VERIFICATION_ERROR_CODES.UNAUTHORIZED,
        ),
    );
    assert.equal(fake.transactionCalls, 0);
    assert.deepEqual(fake.reads, []);
  });

  await t.test("authorized missing audit returns NOT_FOUND with zero writes", async () => {
    const fake = new FakeFirestore(canonicalDocs());
    const service = createProClubProvisioningAuditVerificationService({
      firestore: fake as unknown as Firestore,
      authTokenVerifier: authFor("current-superadmin"),
    });
    await assert.rejects(
      service.verifyAudit({
        authorizationHeader: "Bearer redacted",
        requestBody: { provisioningId: "missing-audit" },
      }),
      (error) =>
        assertVerificationError(
          error,
          AUDIT_VERIFICATION_CLASSIFICATIONS.NOT_FOUND,
          AUDIT_VERIFICATION_ERROR_CODES.NOT_FOUND,
        ),
    );
    assert.deepEqual(fake.reads, [
      "users/current-superadmin",
      "proClubProvisioningAudits/missing-audit",
    ]);
    assert.deepEqual(fake.mutations, []);
  });

  await t.test("tampered audit, inactive club, and non-exact OWNER fail integrity with zero writes", async () => {
    const cases: Array<(docs: Map<string, unknown>) => void> = [
      (docs) => {
        const audit = { ...(docs.get("proClubProvisioningAudits/prov-1") as any) };
        audit.requestFingerprint = `sha256:${"0".repeat(64)}`;
        docs.set("proClubProvisioningAudits/prov-1", audit);
      },
      (docs) => {
        docs.set("proClubs/club-lampang", {
          ...(docs.get("proClubs/club-lampang") as any),
          status: "INACTIVE",
        });
      },
      (docs) => {
        docs.set("proClubs/club-lampang/members/owner-1", {
          authorizationRole: "ADMIN",
          status: "ACTIVE",
        });
      },
    ];
    for (const mutate of cases) {
      const docs = canonicalDocs();
      mutate(docs);
      const fake = new FakeFirestore(docs);
      const service = createProClubProvisioningAuditVerificationService({
        firestore: fake as unknown as Firestore,
        authTokenVerifier: authFor("current-superadmin"),
      });
      await assert.rejects(
        service.verifyAudit({
          authorizationHeader: "Bearer redacted",
          requestBody: { provisioningId: "prov-1" },
        }),
        (error) =>
          assertVerificationError(
            error,
            AUDIT_VERIFICATION_CLASSIFICATIONS.INTEGRITY_FAILURE,
            AUDIT_VERIFICATION_ERROR_CODES.INTEGRITY_FAILURE,
          ),
      );
      assert.deepEqual(fake.mutations, []);
    }
  });

  await t.test("consistent snapshot acquisition failure becomes INTERNAL_ERROR with zero writes", async () => {
    const fake = new FakeFirestore(canonicalDocs());
    fake.failTransaction = true;
    const service = createProClubProvisioningAuditVerificationService({
      firestore: fake as unknown as Firestore,
      authTokenVerifier: authFor("current-superadmin"),
    });
    await assert.rejects(
      service.verifyAudit({
        authorizationHeader: "Bearer redacted",
        requestBody: { provisioningId: "prov-1" },
      }),
      (error) =>
        assertVerificationError(
          error,
          AUDIT_VERIFICATION_CLASSIFICATIONS.INTERNAL_ERROR,
          AUDIT_VERIFICATION_ERROR_CODES.INTERNAL_ERROR,
        ),
    );
    assert.equal(fake.transactionCalls, 1);
    assert.deepEqual(fake.mutations, []);
  });

  await t.test("repeated verification is idempotent and mutable club profile remains valid", async () => {
    const fake = new FakeFirestore(canonicalDocs());
    const service = createProClubProvisioningAuditVerificationService({
      firestore: fake as unknown as Firestore,
      authTokenVerifier: authFor("current-superadmin"),
    });
    const request = {
      authorizationHeader: "Bearer redacted",
      requestBody: { provisioningId: "prov-1" },
    };
    const first = await service.verifyAudit(request);
    const second = await service.verifyAudit(request);
    assert.deepEqual(first, second);
    assert.equal(first.clubId, "club-lampang");
    assert.deepEqual(fake.mutations, []);
  });
});
