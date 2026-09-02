import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const contract = read(
  "docs/ORGANIZATION_RUNTIME_SELECTION_V1_PRO_CLUB_AUTHORITY_BRIDGE_FREEZE.md",
);

const runtimeModel = read(
  "src/lib/organizationRuntimeSelection.ts",
);

const proClubAdapter = read(
  "src/lib/firestore/proClubOrganizationAdapter.ts",
);

const proClubReadAdapter = read(
  "src/lib/firestore/proClubReadAdapter.ts",
);

const authContext = read(
  "src/contexts/AuthContext.tsx",
);

const academyContext = read(
  "src/contexts/AcademyContext.tsx",
);

const mainSource = read(
  "src/main.tsx",
);

test(
  "Organization Runtime Selection V1 Pro Club Authority Bridge Contract Freeze",
  async (t) => {
    await t.test("freezes exact approved baseline and branch", () => {
      assert.ok(
        contract.includes(
          "6944dfe1fbb9082d9002cc49e85e94a5a75056d3",
        ),
      );

      assert.ok(
        contract.includes(
          "feat/organization-runtime-selection-v1-pro-club-authority-contract",
        ),
      );
    });

    await t.test("preserves selection-not-authority invariant", () => {
      assert.ok(contract.includes("`SELECTION != AUTHORITY`"));

      assert.ok(
        contract.includes(
          "Only canonical:",
        ),
      );

      assert.ok(
        contract.includes(
          "`FOUND + hasMembershipAuthority=true`",
        ),
      );
    });

    await t.test("requires trusted Organization Runtime provenance", () => {
      assert.ok(
        contract.includes(
          "`createOrganizationResolutionResult(request, status)`",
        ),
      );

      assert.match(
        runtimeModel,
        /export function createOrganizationResolutionResult/,
      );

      assert.match(
        runtimeModel,
        /trustedResolutionRequests/,
      );

      assert.match(
        runtimeModel,
        /generation === state\.generation/,
      );

      assert.ok(
        contract.includes(
          "It must not construct a structural lookalike result object manually.",
        ),
      );
    });

    await t.test("supports exactly the Pro Club bridge path", () => {
      assert.ok(
        contract.includes(
          "`resolveProClubRuntimeAuthority(request, ops?)`",
        ),
      );

      assert.ok(
        contract.includes(
          "This bridge supports exactly:",
        ),
      );

      assert.ok(contract.includes("`PRO_CLUB`"));

      assert.ok(
        contract.includes(
          "The Pro Club resolver must not be called for an `ACADEMY` request.",
        ),
      );
    });

    await t.test("requires canonical Pro Club authority adapter", () => {
      assert.ok(
        contract.includes(
          "`resolveProClubOrganizationAuthority(clubId, uid, ops?)`",
        ),
      );

      assert.match(
        proClubAdapter,
        /export async function resolveProClubOrganizationAuthority/,
      );

      assert.match(
        proClubAdapter,
        /resolveProClubAuthoritySnapshot/,
      );

      assert.ok(
        contract.includes(
          "must not duplicate, reinterpret, or independently recreate",
        ),
      );
    });

    await t.test("freezes exact authority mapping", () => {
      for (const mapping of [
        "FOUND + hasMembershipAuthority=true -> AUTHORIZED",
        "FOUND + hasMembershipAuthority=false -> REJECTED",
        "MISSING -> REJECTED",
        "PERMISSION_DENIED -> ERROR",
        "INVALID_DATA -> ERROR",
        "ERROR -> ERROR",
      ]) {
        assert.ok(
          contract.includes(`\`${mapping}\``),
          `missing authority mapping: ${mapping}`,
        );
      }
    });

    await t.test("preserves all upstream Pro Club states", () => {
      for (const state of [
        "FOUND",
        "MISSING",
        "PERMISSION_DENIED",
        "INVALID_DATA",
        "ERROR",
      ]) {
        assert.match(
          proClubReadAdapter,
          new RegExp(`"${state}"`),
        );

        assert.match(
          contract,
          new RegExp(`\\b${state}\\b`),
        );
      }

      assert.ok(
        contract.includes(
          "Every bridge outcome must preserve the exact upstream Pro Club read state as",
        ),
      );

      assert.ok(contract.includes("`sourceState`"));

      assert.ok(
        contract.includes(
          "`PERMISSION_DENIED` must not become `MISSING`",
        ),
      );

      assert.ok(
        contract.includes(
          "`INVALID_DATA` must not become `MISSING`",
        ),
      );
    });

    await t.test("requires exact returned identity binding", () => {
      for (const check of [
        'value.organizationType === "PRO_CLUB"',
        "value.organizationId === request.organizationId",
        "value.userId === request.uid",
      ]) {
        assert.ok(
          contract.includes(`\`${check}\``),
          `missing identity check: ${check}`,
        );
      }

      assert.ok(
        contract.includes(
          "mismatched organization or user identity is an integrity",
        ),
      );

      assert.ok(
        contract.includes(
          "must map to runtime `ERROR`",
        ),
      );
    });

    await t.test("keeps membership and staff authority separate", () => {
      assert.match(
        proClubAdapter,
        /hasMembershipAuthority/,
      );

      assert.match(
        proClubAdapter,
        /staffRole/,
      );

      assert.ok(
        contract.includes(
          "A non-null `staffRole` must not authorize a request when",
        ),
      );

      assert.ok(
        contract.includes(
          "`hasMembershipAuthority` is false.",
        ),
      );

      assert.ok(
        contract.includes(
          "`MEMBER` must not become `COACH`.",
        ),
      );

      assert.ok(
        contract.includes(
          "`OWNER` must not be collapsed into `ADMIN`.",
        ),
      );
    });

    await t.test("freezes actual Firebase actor identity boundary", () => {
      assert.match(
        authContext,
        /const currentUser = supportPresentedUser \?\? actualUser;/,
      );

      assert.match(
        authContext,
        /id:\s*firebaseUser\.uid,\s*uid:\s*firebaseUser\.uid,/s,
      );

      assert.ok(
        contract.includes(
          "`actualUser.uid`",
        ),
      );

      assert.ok(
        contract.includes(
          "`currentUser.uid` must not automatically become authenticated actor authority",
        ),
      );

      assert.ok(
        contract.includes(
          "The bridge itself must not import React, `AuthContext`, or presentation state.",
        ),
      );
    });

    await t.test("preserves Academy authority unchanged", () => {
      assert.match(
        academyContext,
        /currentUser\?\.activeAcademyId\s*\?\?\s*null/,
      );

      assert.match(
        academyContext,
        /doc\(db,\s*"academies",\s*activeAcademyId,\s*"members",\s*uid\)/s,
      );

      assert.match(
        mainSource,
        /<AcademyProvider>/,
      );

      assert.match(
        mainSource,
        /<OrganizationRuntimeProvider>/,
      );

      assert.ok(
        contract.includes(
          "Academy authority remains unchanged.",
        ),
      );
    });

    await t.test("forbids persisted generic organization authority", () => {
      for (const forbidden of [
        "activeProClubId",
        "activeOrganizationId",
        "activeOrganizationType",
      ]) {
        assert.ok(
          contract.includes(`\`${forbidden}\``),
        );
      }

      assert.ok(
        contract.includes(
          "Selection remains runtime intent only.",
        ),
      );
    });

    await t.test("keeps mutation APIs outside the bridge", () => {
      for (const mutation of [
        "setDoc",
        "updateDoc",
        "deleteDoc",
        "addDoc",
        "writeBatch",
        "runTransaction",
      ]) {
        assert.ok(
          contract.includes(`\`${mutation}\``),
        );
      }

      assert.ok(
        contract.includes(
          "The bridge performs authority resolution only.",
        ),
      );
    });

    await t.test("keeps Provider UI and SuperAdmin integration closed", () => {
      assert.ok(
        contract.includes(
          "`OrganizationRuntimeProvider`",
        ),
      );

      assert.ok(
        contract.includes(
          "`OrganizationProvider`",
        ),
      );

      assert.ok(
        contract.includes(
          "`proClubAuthority = NOT_CONNECTED`",
        ),
      );

      assert.ok(
        contract.includes(
          "React/provider integration requires a later dedicated slice.",
        ),
      );
    });

    await t.test("freezes exact future implementation boundary", () => {
      assert.ok(
        contract.includes(
          "`src/lib/organizationRuntimeProClubAuthorityBridge.ts`",
        ),
      );

      assert.ok(
        contract.includes(
          "`tests/organizationRuntimeProClubAuthorityBridgeContract.test.ts`",
        ),
      );

      assert.ok(
        contract.includes(
          "No existing production source file may change during this Contract Freeze.",
        ),
      );
    });
  },
);
