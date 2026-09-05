import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RESOLUTION_ERROR_CODES,
  ProClubStaffCandidateResolutionError,
} from "../functions/src/proClubStaffCandidateResolution/core.ts";
import {
  createProClubStaffCandidateResolutionService,
  type MinimalAdminAuthForResolution,
  type MinimalUserRecord,
} from "../functions/src/proClubStaffCandidateResolution/service.ts";
import type { Firestore } from "firebase-admin/firestore";

interface MockDocSnapshot {
  exists: boolean;
  data: () => any;
}

function createMockFirestore(state: {
  clubs?: Record<string, any>;
  members?: Record<string, Record<string, any>>; // clubId -> memberUid -> data
}) {
  const readPaths: string[] = [];

  const mockDb = {
    readPaths,
    collection(colName: string) {
      if (colName === "users") {
        throw new Error("Violation: Candidate resolution service must NEVER query or read users collection");
      }
      return {
        doc(docId: string) {
          const docPath = `${colName}/${docId}`;
          return {
            async get(): Promise<MockDocSnapshot> {
              readPaths.push(docPath);
              if (colName === "proClubs") {
                const clubData = state.clubs?.[docId];
                return {
                  exists: Boolean(clubData),
                  data: () => clubData ?? null,
                };
              }
              return { exists: false, data: () => null };
            },
            collection(subColName: string) {
              return {
                doc(subDocId: string) {
                  const subPath = `${colName}/${docId}/${subColName}/${subDocId}`;
                  return {
                    async get(): Promise<MockDocSnapshot> {
                      readPaths.push(subPath);
                      if (colName === "proClubs" && subColName === "members") {
                        const memberData = state.members?.[docId]?.[subDocId];
                        return {
                          exists: Boolean(memberData),
                          data: () => memberData ?? null,
                        };
                      }
                      return { exists: false, data: () => null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  return mockDb as unknown as Firestore & { readPaths: string[] };
}

function createMockAuth(usersByEmail: Record<string, MinimalUserRecord>): MinimalAdminAuthForResolution {
  return {
    async getUserByEmail(email: string) {
      const u = usersByEmail[email.toLowerCase()];
      if (!u) {
        const err: any = new Error("auth/user-not-found");
        err.code = "auth/user-not-found";
        throw err;
      }
      return u;
    },
  };
}

describe("Pro Club Staff Candidate Resolution Service", () => {
  const CLUB = "club-tnsu";
  const OTHER_CLUB = "club-other";
  const OWNER = "owner-uid";
  const ADMIN = "admin-uid";
  const MEMBER = "member-uid";
  const OUTSIDER = "outsider-uid";
  const INACTIVE_OWNER = "inactive-owner-uid";

  const TARGET_EMAIL = "staff.candidate@example.com";
  const TARGET_UID = "staff-candidate-uid-777";

  const users: Record<string, MinimalUserRecord> = {
    [TARGET_EMAIL]: {
      uid: TARGET_UID,
      email: TARGET_EMAIL,
      displayName: "Staff Candidate",
      disabled: false,
    },
    "disabled@example.com": {
      uid: "disabled-uid",
      email: "disabled@example.com",
      disabled: true,
    },
    "owner@example.com": {
      uid: OWNER,
      email: "owner@example.com",
      displayName: "Club Owner",
      disabled: false,
    },
  };

  function setupService(customClubs?: Record<string, any>) {
    const firestore = createMockFirestore({
      clubs: customClubs ?? {
        [CLUB]: { name: "TNSU Club", status: "ACTIVE" },
        [OTHER_CLUB]: { name: "Other Club", status: "ACTIVE" },
      },
      members: {
        [CLUB]: {
          [OWNER]: { authorizationRole: "OWNER", status: "ACTIVE" },
          [ADMIN]: { authorizationRole: "ADMIN", status: "ACTIVE" },
          [MEMBER]: { authorizationRole: "MEMBER", status: "ACTIVE" },
          [INACTIVE_OWNER]: { authorizationRole: "OWNER", status: "INACTIVE" },
        },
        [OTHER_CLUB]: {
          [OUTSIDER]: { authorizationRole: "OWNER", status: "ACTIVE" },
        },
      },
    });
    const auth = createMockAuth(users);
    const rateLimiter = {
      async consumeQuota() {
        return { allowed: true, attempts: 1, limit: 10, bucketId: "b-test" };
      },
    };

    return {
      service: createProClubStaffCandidateResolutionService({
        firestore,
        auth,
        rateLimiter,
      }),
      firestore,
    };
  }

  it("1. OWNER can resolve candidate by exact email", async () => {
    const { service, firestore } = setupService();
    const result = await service.resolveCandidate({
      requesterUid: OWNER,
      requestBody: { clubId: CLUB, email: TARGET_EMAIL },
    });

    assert.equal(result.targetUid, TARGET_UID);
    assert.equal(result.email, TARGET_EMAIL);
    assert.equal(result.displayName, "Staff Candidate");

    // Verify paths accessed: only club doc and reviewer member doc
    assert.deepEqual(firestore.readPaths, [
      `proClubs/${CLUB}`,
      `proClubs/${CLUB}/members/${OWNER}`,
    ]);
  });

  it("2. ADMIN can resolve candidate by exact email", async () => {
    const { service } = setupService();
    const result = await service.resolveCandidate({
      requesterUid: ADMIN,
      requestBody: { clubId: CLUB, email: TARGET_EMAIL },
    });

    assert.equal(result.targetUid, TARGET_UID);
    assert.equal(result.email, TARGET_EMAIL);
  });

  it("3. MEMBER is denied (403 FORBIDDEN)", async () => {
    const { service } = setupService();
    await assert.rejects(
      service.resolveCandidate({
        requesterUid: MEMBER,
        requestBody: { clubId: CLUB, email: TARGET_EMAIL },
      }),
      (err: any) =>
        err instanceof ProClubStaffCandidateResolutionError &&
        err.code === RESOLUTION_ERROR_CODES.FORBIDDEN,
    );
  });

  it("4. Non-member outsider is denied (403 FORBIDDEN)", async () => {
    const { service } = setupService();
    await assert.rejects(
      service.resolveCandidate({
        requesterUid: OUTSIDER,
        requestBody: { clubId: CLUB, email: TARGET_EMAIL },
      }),
      (err: any) =>
        err instanceof ProClubStaffCandidateResolutionError &&
        err.code === RESOLUTION_ERROR_CODES.FORBIDDEN,
    );
  });

  it("5. Reviewer from another club cannot resolve for foreign club", async () => {
    const { service } = setupService();
    await assert.rejects(
      service.resolveCandidate({
        requesterUid: OWNER, // OWNER of CLUB, but queries OTHER_CLUB
        requestBody: { clubId: OTHER_CLUB, email: TARGET_EMAIL },
      }),
      (err: any) =>
        err instanceof ProClubStaffCandidateResolutionError &&
        err.code === RESOLUTION_ERROR_CODES.FORBIDDEN,
    );
  });

  it("6. Inactive reviewer is denied (403 FORBIDDEN)", async () => {
    const { service } = setupService();
    await assert.rejects(
      service.resolveCandidate({
        requesterUid: INACTIVE_OWNER,
        requestBody: { clubId: CLUB, email: TARGET_EMAIL },
      }),
      (err: any) =>
        err instanceof ProClubStaffCandidateResolutionError &&
        err.code === RESOLUTION_ERROR_CODES.FORBIDDEN,
    );
  });

  it("7. Inactive club is denied (403 FORBIDDEN)", async () => {
    const { service } = setupService({
      [CLUB]: { name: "TNSU Club", status: "SUSPENDED" },
    });
    await assert.rejects(
      service.resolveCandidate({
        requesterUid: OWNER,
        requestBody: { clubId: CLUB, email: TARGET_EMAIL },
      }),
      (err: any) =>
        err instanceof ProClubStaffCandidateResolutionError &&
        err.code === RESOLUTION_ERROR_CODES.FORBIDDEN,
    );
  });

  it("8. Unauthenticated / invalid requesterUid denied (401 UNAUTHORIZED)", async () => {
    const { service } = setupService();
    await assert.rejects(
      service.resolveCandidate({
        requesterUid: "", // Missing/invalid requester UID
        requestBody: { clubId: CLUB, email: TARGET_EMAIL },
      }),
      (err: any) =>
        err instanceof ProClubStaffCandidateResolutionError &&
        err.code === RESOLUTION_ERROR_CODES.UNAUTHORIZED,
    );
  });

  it("9. Unknown account returns generic 404 CANDIDATE_NOT_FOUND", async () => {
    const { service } = setupService();
    await assert.rejects(
      service.resolveCandidate({
        requesterUid: OWNER,
        requestBody: { clubId: CLUB, email: "nonexistent@example.com" },
      }),
      (err: any) =>
        err instanceof ProClubStaffCandidateResolutionError &&
        err.code === RESOLUTION_ERROR_CODES.CANDIDATE_NOT_FOUND &&
        err.message === "Unable to use this account for a Pro Club invitation.",
    );
  });

  it("10. Disabled account returns generic 404 CANDIDATE_NOT_FOUND", async () => {
    const { service } = setupService();
    await assert.rejects(
      service.resolveCandidate({
        requesterUid: OWNER,
        requestBody: { clubId: CLUB, email: "disabled@example.com" },
      }),
      (err: any) =>
        err instanceof ProClubStaffCandidateResolutionError &&
        err.code === RESOLUTION_ERROR_CODES.CANDIDATE_NOT_FOUND &&
        err.message === "Unable to use this account for a Pro Club invitation.",
    );
  });

  it("11. Self-lookup is rejected with generic 404 CANDIDATE_NOT_FOUND", async () => {
    const { service } = setupService();
    await assert.rejects(
      service.resolveCandidate({
        requesterUid: OWNER,
        requestBody: { clubId: CLUB, email: "owner@example.com" },
      }),
      (err: any) =>
        err instanceof ProClubStaffCandidateResolutionError &&
        err.code === RESOLUTION_ERROR_CODES.CANDIDATE_NOT_FOUND &&
        err.message === "Unable to use this account for a Pro Club invitation.",
    );
  });
});
