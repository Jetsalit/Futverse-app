import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyOrganizationResolution,
  beginOrganizationResolution,
  bindOrganizationRuntimeUid,
  createOrganizationRuntime,
  getOrganizationResolutionRequest,
  isOrganizationRuntimeAuthorized,
  selectOrganization,
  type OrganizationRuntimeState,
  type OrganizationType,
} from "../src/lib/organizationRuntimeSelection";

import {
  resolveProClubRuntimeAuthority,
} from "../src/lib/organizationRuntimeProClubAuthorityBridge";

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
          id:
            path[path.length - 1] ??
            "",
          exists: false,
        }
      );
    },
  };
}


function activeClub(
  id: string,
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
): ProClubReadDocumentSnapshot {
  return {
    id: uid,
    exists: true,
    data: {
      staffRole: "HEAD_COACH",
      status: "ACTIVE",
    },
  };
}


function createResolvingRuntime(
  organizationType: OrganizationType,
  organizationId: string,
  uid: string,
): {
  state: OrganizationRuntimeState;
  request: NonNullable<
    ReturnType<
      typeof getOrganizationResolutionRequest
    >
  >;
} {
  let state =
    createOrganizationRuntime();

  state =
    bindOrganizationRuntimeUid(
      state,
      uid,
    );

  state =
    selectOrganization(
      state,
      organizationType,
      organizationId,
    );

  state =
    beginOrganizationResolution(
      state,
    );

  const request =
    getOrganizationResolutionRequest(
      state,
    );

  assert.ok(request);

  return {
    state,
    request,
  };
}


test(
  "Organization Runtime Pro Club Authority Bridge V1",
  async (t) => {

    await t.test(
      "authorizes only an exact active canonical Pro Club membership",
      async () => {
        const clubId = "club-active";
        const uid = "user-active";

        const runtime =
          createResolvingRuntime(
            "PRO_CLUB",
            clubId,
            uid,
          );

        const result =
          await resolveProClubRuntimeAuthority(
            runtime.request,
            makeOps({
              [`proClubs/${clubId}`]:
                activeClub(clubId),

              [`proClubs/${clubId}/members/${uid}`]:
                membership(
                  uid,
                  "MEMBER",
                  "ACTIVE",
                ),
            }),
          );

        assert.equal(
          result.sourceState,
          "FOUND",
        );

        assert.equal(
          result.runtimeResult?.status,
          "AUTHORIZED",
        );

        const applied =
          applyOrganizationResolution(
            runtime.state,
            result.runtimeResult,
          );

        assert.equal(
          applied.status,
          "AUTHORIZED",
        );

        assert.equal(
          isOrganizationRuntimeAuthorized(
            applied,
          ),
          true,
        );
      },
    );


    await t.test(
      "rejects inactive membership and never lets staff role independently authorize",
      async () => {
        const clubId =
          "club-inactive";

        const uid =
          "user-inactive";

        const reads: string[] = [];

        const runtime =
          createResolvingRuntime(
            "PRO_CLUB",
            clubId,
            uid,
          );

        const result =
          await resolveProClubRuntimeAuthority(
            runtime.request,
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
                  staff(uid),
              },
              reads,
            ),
          );

        assert.equal(
          result.sourceState,
          "FOUND",
        );

        assert.equal(
          result.runtimeResult?.status,
          "REJECTED",
        );

        const applied =
          applyOrganizationResolution(
            runtime.state,
            result.runtimeResult,
          );

        assert.equal(
          applied.status,
          "REJECTED",
        );

        assert.equal(
          isOrganizationRuntimeAuthorized(
            applied,
          ),
          false,
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
      "maps MISSING to REJECTED while preserving source state",
      async () => {
        const runtime =
          createResolvingRuntime(
            "PRO_CLUB",
            "missing-club",
            "missing-user",
          );

        const result =
          await resolveProClubRuntimeAuthority(
            runtime.request,
            makeOps({}),
          );

        assert.equal(
          result.sourceState,
          "MISSING",
        );

        assert.equal(
          result.runtimeResult?.status,
          "REJECTED",
        );
      },
    );


    await t.test(
      "maps PERMISSION_DENIED to ERROR without erasing the source state",
      async () => {
        const runtime =
          createResolvingRuntime(
            "PRO_CLUB",
            "club-denied",
            "user-denied",
          );

        const ops: ProClubReadOps = {
          async readDocument() {
            throw Object.assign(
              new Error(
                "permission denied",
              ),
              {
                code:
                  "permission-denied",
              },
            );
          },
        };

        const result =
          await resolveProClubRuntimeAuthority(
            runtime.request,
            ops,
          );

        assert.equal(
          result.sourceState,
          "PERMISSION_DENIED",
        );

        assert.equal(
          result.runtimeResult?.status,
          "ERROR",
        );
      },
    );


    await t.test(
      "maps INVALID_DATA to ERROR while preserving source state",
      async () => {
        const clubId =
          "malformed-club";

        const runtime =
          createResolvingRuntime(
            "PRO_CLUB",
            clubId,
            "user-malformed",
          );

        const result =
          await resolveProClubRuntimeAuthority(
            runtime.request,
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
          result.sourceState,
          "INVALID_DATA",
        );

        assert.equal(
          result.runtimeResult?.status,
          "ERROR",
        );
      },
    );


    await t.test(
      "maps generic upstream ERROR to runtime ERROR",
      async () => {
        const runtime =
          createResolvingRuntime(
            "PRO_CLUB",
            "club-error",
            "user-error",
          );

        const ops: ProClubReadOps = {
          async readDocument() {
            throw new Error(
              "synthetic transport failure",
            );
          },
        };

        const result =
          await resolveProClubRuntimeAuthority(
            runtime.request,
            ops,
          );

        assert.equal(
          result.sourceState,
          "ERROR",
        );

        assert.equal(
          result.runtimeResult?.status,
          "ERROR",
        );
      },
    );


    await t.test(
      "trusted ACADEMY request fails closed without calling the Pro Club adapter",
      async () => {
        const reads: string[] = [];

        const runtime =
          createResolvingRuntime(
            "ACADEMY",
            "academy-a",
            "user-a",
          );

        const result =
          await resolveProClubRuntimeAuthority(
            runtime.request,
            makeOps(
              {},
              reads,
            ),
          );

        assert.equal(
          result.sourceState,
          null,
        );

        assert.equal(
          result.runtimeResult?.status,
          "ERROR",
        );

        assert.deepEqual(
          reads,
          [],
        );

        const applied =
          applyOrganizationResolution(
            runtime.state,
            result.runtimeResult,
          );

        assert.equal(
          applied.status,
          "ERROR",
        );

        assert.equal(
          isOrganizationRuntimeAuthorized(
            applied,
          ),
          false,
        );
      },
    );


    await t.test(
      "fabricated structural PRO_CLUB request fails provenance gate before any authority read",
      async () => {
        const reads: string[] = [];

        const fabricatedRequest =
          Object.freeze({
            uid: "fake-user",
            organizationType:
              "PRO_CLUB",
            organizationId:
              "fake-club",
            generation: 1,
          });

        const result =
          await resolveProClubRuntimeAuthority(
            fabricatedRequest,
            makeOps(
              {},
              reads,
            ),
          );

        assert.equal(
          result.sourceState,
          null,
        );

        assert.equal(
          result.runtimeResult,
          null,
        );

        assert.deepEqual(
          reads,
          [],
        );
      },
    );


    await t.test(
      "stale authorized result cannot authorize a newer Organization Runtime generation",
      async () => {
        const clubId =
          "club-old";

        const uid =
          "user-switch";

        const oldRuntime =
          createResolvingRuntime(
            "PRO_CLUB",
            clubId,
            uid,
          );

        const oldResult =
          await resolveProClubRuntimeAuthority(
            oldRuntime.request,
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
          oldResult.runtimeResult
            ?.status,
          "AUTHORIZED",
        );

        let newerState =
          selectOrganization(
            oldRuntime.state,
            "PRO_CLUB",
            "club-new",
          );

        newerState =
          beginOrganizationResolution(
            newerState,
          );

        assert.equal(
          newerState.status,
          "RESOLVING",
        );

        const afterStaleApply =
          applyOrganizationResolution(
            newerState,
            oldResult.runtimeResult,
          );

        assert.equal(
          afterStaleApply.status,
          "RESOLVING",
        );

        assert.equal(
          isOrganizationRuntimeAuthorized(
            afterStaleApply,
          ),
          false,
        );
      },
    );


    await t.test(
      "implementation contains explicit identity-integrity guards",
      () => {
        const source =
          readFileSync(
            "src/lib/organizationRuntimeProClubAuthorityBridge.ts",
            "utf8",
          );

        assert.match(
          source,
          /authorityResult\.value\.organizationType\s*!==\s*"PRO_CLUB"/,
        );

        assert.match(
          source,
          /authorityResult\.value\.organizationId\s*!==\s*trustedRequest\.organizationId/,
        );

        assert.match(
          source,
          /authorityResult\.value\.userId\s*!==\s*trustedRequest\.uid/,
        );

        assert.match(
          source,
          /return createBridgeResult\(\s*"FOUND",\s*request,\s*"ERROR"/s,
        );
      },
    );


    await t.test(
      "bridge composes canonical authority only and introduces no persistence mutation React or presentation dependency",
      () => {
        const source =
          readFileSync(
            "src/lib/organizationRuntimeProClubAuthorityBridge.ts",
            "utf8",
          );

        assert.match(
          source,
          /resolveProClubOrganizationAuthority/,
        );

        assert.match(
          source,
          /createOrganizationResolutionResult/,
        );

        assert.doesNotMatch(
          source,
          /from\s+["']react["']/,
        );

        assert.doesNotMatch(
          source,
          /AuthContext|AcademyContext/,
        );

        assert.doesNotMatch(
          source,
          /localStorage|sessionStorage|document\.cookie/,
        );

        assert.doesNotMatch(
          source,
          /\bsetDoc\b|\bupdateDoc\b|\bdeleteDoc\b|\baddDoc\b|\bwriteBatch\b|\brunTransaction\b/,
        );
      },
    );
  },
);