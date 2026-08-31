import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveProClubOrganizationAuthority,
} from "../src/lib/firestore/proClubOrganizationAdapter";

import type {
  ProClubReadDocumentSnapshot,
  ProClubReadOps,
} from "../src/lib/firestore/proClubReadAdapter";

type DocumentMap =
  Record<string, ProClubReadDocumentSnapshot>;

function makeOps(
  documents: DocumentMap,
  reads: string[] = [],
): ProClubReadOps {
  return {
    async readDocument(path) {
      const key = path.join("/");
      reads.push(key);

      return (
        documents[key] ?? {
          id: path[path.length - 1] ?? "",
          exists: false,
        }
      );
    },
  };
}

function activeClub(
  id: string,
  overrides: Record<string, unknown> = {},
): ProClubReadDocumentSnapshot {
  return {
    id,
    exists: true,
    data: {
      name: "FutVerse United",
      shortName: "FVU",
      level: "T3",
      status: "ACTIVE",
      country: "TH",
      ...overrides,
    },
  };
}

function membership(
  uid: string,
  authorizationRole:
    | "OWNER"
    | "ADMIN"
    | "MEMBER",
  status:
    | "ACTIVE"
    | "INACTIVE"
    | "LEFT"
    | "REVOKED",
): ProClubReadDocumentSnapshot {
  return {
    id: uid,
    exists: true,
    data: {
      authorizationRole,
      status,
    },
  };
}

function staff(
  uid: string,
  staffRole:
    | "HEAD_COACH"
    | "ASSISTANT_COACH"
    | "FITNESS_COACH"
    | "ANALYST"
    | "PHYSIO"
    | "TEAM_MANAGER"
    | "STAFF",
  status:
    | "ACTIVE"
    | "INACTIVE"
    | "LEFT",
): ProClubReadDocumentSnapshot {
  return {
    id: uid,
    exists: true,
    data: {
      staffRole,
      status,
    },
  };
}

test(
  "Pro Club Organization Adapter V1",
  async (t) => {
    await t.test(
      "maps exact active Pro Club authority without collapsing membership and staff roles",
      async () => {
        const clubId = "club-a";
        const uid = "owner-a";

        const result =
          await resolveProClubOrganizationAuthority(
            clubId,
            uid,
            makeOps({
              [`proClubs/${clubId}`]:
                activeClub(clubId),
              [`proClubs/${clubId}/members/${uid}`]:
                membership(
                  uid,
                  "OWNER",
                  "ACTIVE",
                ),
              [`proClubs/${clubId}/staff/${uid}`]:
                staff(
                  uid,
                  "HEAD_COACH",
                  "ACTIVE",
                ),
            }),
          );

        assert.equal(
          result.state,
          "FOUND",
        );

        if (result.state !== "FOUND") {
          return;
        }

        assert.deepEqual(
          result.value,
          {
            organizationId: clubId,
            organizationType: "PRO_CLUB",
            organizationName:
              "FutVerse United",
            organizationShortName:
              "FVU",
            organizationLevel: "T3",
            organizationStatus: "ACTIVE",
            userId: uid,
            membershipAuthorizationRole:
              "OWNER",
            membershipStatus:
              "ACTIVE",
            hasMembershipAuthority:
              true,
            staffRole:
              "HEAD_COACH",
          },
        );
      },
    );

    await t.test(
      "preserves inactive membership relationship role but never grants active authority",
      async () => {
        const clubId = "club-b";
        const uid = "member-b";
        const reads: string[] = [];

        const result =
          await resolveProClubOrganizationAuthority(
            clubId,
            uid,
            makeOps(
              {
                [`proClubs/${clubId}`]:
                  activeClub(clubId),
                [`proClubs/${clubId}/members/${uid}`]:
                  membership(
                    uid,
                    "MEMBER",
                    "INACTIVE",
                  ),
                [`proClubs/${clubId}/staff/${uid}`]:
                  staff(
                    uid,
                    "FITNESS_COACH",
                    "ACTIVE",
                  ),
              },
              reads,
            ),
          );

        assert.equal(
          result.state,
          "FOUND",
        );

        if (result.state !== "FOUND") {
          return;
        }

        assert.equal(
          result.value
            .membershipAuthorizationRole,
          "MEMBER",
        );

        assert.equal(
          result.value.membershipStatus,
          "INACTIVE",
        );

        assert.equal(
          result.value
            .hasMembershipAuthority,
          false,
        );

        assert.equal(
          result.value.staffRole,
          null,
        );

        assert.deepEqual(
          reads,
          [
            `proClubs/${clubId}`,
            `proClubs/${clubId}/members/${uid}`,
          ],
        );
      },
    );

    await t.test(
      "keeps active membership authority when exact staff assignment is missing",
      async () => {
        const clubId = "club-c";
        const uid = "admin-c";

        const result =
          await resolveProClubOrganizationAuthority(
            clubId,
            uid,
            makeOps({
              [`proClubs/${clubId}`]:
                activeClub(clubId),
              [`proClubs/${clubId}/members/${uid}`]:
                membership(
                  uid,
                  "ADMIN",
                  "ACTIVE",
                ),
            }),
          );

        assert.equal(
          result.state,
          "FOUND",
        );

        if (result.state !== "FOUND") {
          return;
        }

        assert.equal(
          result.value
            .membershipAuthorizationRole,
          "ADMIN",
        );

        assert.equal(
          result.value
            .hasMembershipAuthority,
          true,
        );

        assert.equal(
          result.value.staffRole,
          null,
        );
      },
    );

    await t.test(
      "preserves MISSING from the authoritative Pro Club boundary",
      async () => {
        const result =
          await resolveProClubOrganizationAuthority(
            "missing-club",
            "user-a",
            makeOps({}),
          );

        assert.equal(
          result.state,
          "MISSING",
        );
      },
    );

    await t.test(
      "preserves PERMISSION_DENIED without converting it to missing",
      async () => {
        const ops: ProClubReadOps = {
          async readDocument() {
            const error =
              Object.assign(
                new Error(
                  "permission denied",
                ),
                {
                  code:
                    "permission-denied",
                },
              );

            throw error;
          },
        };

        const result =
          await resolveProClubOrganizationAuthority(
            "club-a",
            "user-a",
            ops,
          );

        assert.equal(
          result.state,
          "PERMISSION_DENIED",
        );
      },
    );

    await t.test(
      "preserves INVALID_DATA for malformed canonical Pro Club data",
      async () => {
        const clubId =
          "malformed-club";

        const result =
          await resolveProClubOrganizationAuthority(
            clubId,
            "user-a",
            makeOps({
              [`proClubs/${clubId}`]: {
                id: clubId,
                exists: true,
                data: {
                  name:
                    "Malformed Club",
                  level: "T3",
                  status: "ACTIVE",
                  clubId,
                },
              },
            }),
          );

        assert.equal(
          result.state,
          "INVALID_DATA",
        );
      },
    );

    await t.test(
      "fails closed on malformed requested identity without a Firestore read",
      async () => {
        const reads: string[] = [];

        const result =
          await resolveProClubOrganizationAuthority(
            " club-a ",
            "user-a",
            makeOps(
              {},
              reads,
            ),
          );

        assert.equal(
          result.state,
          "INVALID_DATA",
        );

        assert.deepEqual(
          reads,
          [],
        );
      },
    );

    await t.test(
      "preserves generic upstream ERROR without converting it to another result state",
      async () => {
        const ops: ProClubReadOps = {
          async readDocument() {
            throw new Error(
              "synthetic transport failure",
            );
          },
        };

        const result =
          await resolveProClubOrganizationAuthority(
            "club-error",
            "user-error",
            ops,
          );

        assert.equal(
          result.state,
          "ERROR",
        );
      },
    );

    await t.test(
      "preserves LEFT membership as terminal relationship evidence without authority or staff resolution",
      async () => {
        const clubId = "club-left";
        const uid = "user-left";
        const reads: string[] = [];

        const result =
          await resolveProClubOrganizationAuthority(
            clubId,
            uid,
            makeOps(
              {
                [`proClubs/${clubId}`]:
                  activeClub(clubId),

                [`proClubs/${clubId}/members/${uid}`]:
                  membership(
                    uid,
                    "MEMBER",
                    "LEFT",
                  ),

                [`proClubs/${clubId}/staff/${uid}`]:
                  staff(
                    uid,
                    "HEAD_COACH",
                    "ACTIVE",
                  ),
              },
              reads,
            ),
          );

        assert.equal(
          result.state,
          "FOUND",
        );

        if (result.state !== "FOUND") {
          return;
        }

        assert.equal(
          result.value.membershipAuthorizationRole,
          "MEMBER",
        );

        assert.equal(
          result.value.membershipStatus,
          "LEFT",
        );

        assert.equal(
          result.value.hasMembershipAuthority,
          false,
        );

        assert.equal(
          result.value.staffRole,
          null,
        );

        assert.deepEqual(
          reads,
          [
            `proClubs/${clubId}`,
            `proClubs/${clubId}/members/${uid}`,
          ],
        );
      },
    );

    await t.test(
      "preserves REVOKED membership as terminal relationship evidence without authority",
      async () => {
        const clubId = "club-revoked";
        const uid = "user-revoked";

        const result =
          await resolveProClubOrganizationAuthority(
            clubId,
            uid,
            makeOps({
              [`proClubs/${clubId}`]:
                activeClub(clubId),

              [`proClubs/${clubId}/members/${uid}`]:
                membership(
                  uid,
                  "ADMIN",
                  "REVOKED",
                ),
            }),
          );

        assert.equal(
          result.state,
          "FOUND",
        );

        if (result.state !== "FOUND") {
          return;
        }

        assert.equal(
          result.value.membershipAuthorizationRole,
          "ADMIN",
        );

        assert.equal(
          result.value.membershipStatus,
          "REVOKED",
        );

        assert.equal(
          result.value.hasMembershipAuthority,
          false,
        );

        assert.equal(
          result.value.staffRole,
          null,
        );
      },
    );

    await t.test(
      "keeps active membership authority while inactive football staff resolves to null",
      async () => {
        const clubId =
          "club-inactive-staff";

        const uid =
          "user-inactive-staff";

        const result =
          await resolveProClubOrganizationAuthority(
            clubId,
            uid,
            makeOps({
              [`proClubs/${clubId}`]:
                activeClub(clubId),

              [`proClubs/${clubId}/members/${uid}`]:
                membership(
                  uid,
                  "ADMIN",
                  "ACTIVE",
                ),

              [`proClubs/${clubId}/staff/${uid}`]:
                staff(
                  uid,
                  "FITNESS_COACH",
                  "INACTIVE",
                ),
            }),
          );

        assert.equal(
          result.state,
          "FOUND",
        );

        if (result.state !== "FOUND") {
          return;
        }

        assert.equal(
          result.value.membershipAuthorizationRole,
          "ADMIN",
        );

        assert.equal(
          result.value.membershipStatus,
          "ACTIVE",
        );

        assert.equal(
          result.value.hasMembershipAuthority,
          true,
        );

        assert.equal(
          result.value.staffRole,
          null,
        );
      },
    );
    await t.test(
      "implementation composes the frozen resolver and introduces no discovery or mutation API",
      () => {
        const source =
          readFileSync(
            "src/lib/firestore/proClubOrganizationAdapter.ts",
            "utf8",
          );

        assert.match(
          source,
          /resolveProClubAuthoritySnapshot/,
        );

        assert.doesNotMatch(
          source,
          /\bcollectionGroup\s*\(/,
        );

        assert.doesNotMatch(
          source,
          /\bcollection\s*\(/,
        );

        assert.doesNotMatch(
          source,
          /\bsetDoc\s*\(/,
        );

        assert.doesNotMatch(
          source,
          /\bupdateDoc\s*\(/,
        );

        assert.doesNotMatch(
          source,
          /\bdeleteDoc\s*\(/,
        );

        assert.doesNotMatch(
          source,
          /\brunTransaction\s*\(/,
        );

        assert.doesNotMatch(
          source,
          /\bwriteBatch\s*\(/,
        );
      },
    );
  },
);