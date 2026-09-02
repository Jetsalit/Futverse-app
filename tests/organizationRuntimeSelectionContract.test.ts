import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const contract = read(
  "docs/ORGANIZATION_RUNTIME_SELECTION_V1_FREEZE.md",
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

const appSource = read(
  "src/App.tsx",
);

const proClubOrganizationAdapter = read(
  "src/lib/firestore/proClubOrganizationAdapter.ts",
);

const accountOrganizationContext = read(
  "src/components/superadmin/superAdminAccountOrganizationContext.ts",
);

test("Organization Runtime Selection V1 Contract Freeze", async (t) => {
  await t.test("freezes approved baseline", () => {
    assert.match(
      contract,
      /feat\/organization-runtime-selection-v1-contract/,
    );
    assert.match(
      contract,
      /639a81aa051e1de09609ab7f6c4dba9fb07b9578/,
    );
  });

  await t.test("selection is not authority", () => {
    assert.match(contract, /`SELECTION != AUTHORITY`/);
    assert.match(contract, /Selection alone never grants tenant access\./);
    assert.match(
      contract,
      /Only canonical organization authority may transition runtime state to\s+`AUTHORIZED`\./,
    );
  });

  await t.test("freezes exact organization selection identity", () => {
    assert.match(contract, /\[organizationType, organizationId\]/);
    assert.match(contract, /`organizationId` alone is insufficient/);
    assert.match(contract, /\bACADEMY\b/);
    assert.match(contract, /\bPRO_CLUB\b/);
  });

  await t.test("keeps legacy account metadata outside authority", () => {
    assert.match(
      authContext,
      /Legacy\/routing metadata only\. None of these fields grants tenant or player access\./,
    );
    for (const field of [
      "role",
      "tenantRole",
      "academyId",
      "activeAcademyId",
    ]) {
      assert.match(
        contract,
        new RegExp(`users/\\{uid\\}\\.${field}`),
      );
    }
    assert.match(contract, /`ACCOUNT ROLE != TENANT ROLE`/);
  });

  await t.test("forbids new persisted authority pointers", () => {
    assert.match(contract, /`activeProClubId`/);
    assert.match(contract, /persisted `activeOrganizationId`/);
    assert.match(contract, /persisted `activeOrganizationType`/);

    const protectedBaseline =
      authContext + mainSource + appSource;

    assert.doesNotMatch(
      protectedBaseline,
      /\bactiveProClubId\b/,
    );
    assert.doesNotMatch(
      protectedBaseline,
      /\bactiveOrganizationId\b/,
    );
  });

  await t.test("preserves existing Academy authority path", () => {
    assert.match(
      academyContext,
      /currentUser\?\.activeAcademyId\s*\?\?\s*null/,
    );
    assert.match(
      academyContext,
      /doc\(db,\s*"academies",\s*activeAcademyId,\s*"members",\s*uid\)/s,
    );
    assert.match(contract, /Academy authority remains unchanged in V1\./);
  });

  await t.test("requires existing Pro Club authority stack", () => {
    assert.match(
      contract,
      /resolveProClubOrganizationAuthority\(clubId, uid, ops\?\)/,
    );
    assert.match(
      contract,
      /resolveProClubAuthoritySnapshot\(clubId, uid\)/,
    );
    assert.match(
      proClubOrganizationAdapter,
      /export async function resolveProClubOrganizationAuthority/,
    );
    assert.match(
      proClubOrganizationAdapter,
      /resolveProClubAuthoritySnapshot/,
    );
  });

  await t.test("preserves Pro Club role separation", () => {
    for (const role of [
      "OWNER",
      "ADMIN",
      "MEMBER",
      "HEAD_COACH",
      "ASSISTANT_COACH",
      "FITNESS_COACH",
      "ANALYST",
      "PHYSIO",
      "TEAM_MANAGER",
      "STAFF",
    ]) {
      assert.match(contract, new RegExp(`\\b${role}\\b`));
    }

    assert.match(contract, /`MEMBER` must not become `COACH`\./);
    assert.match(
      contract,
      /A football staff role alone must not grant tenant membership authority\./,
    );
  });

  await t.test("freezes fail-closed runtime states", () => {
    for (const state of [
      "UNSELECTED",
      "SELECTED",
      "RESOLVING",
      "AUTHORIZED",
      "REJECTED",
      "ERROR",
      "FOUND",
      "MISSING",
      "PERMISSION_DENIED",
      "INVALID_DATA",
    ]) {
      assert.match(contract, new RegExp(`\\b${state}\\b`));
    }

    assert.match(
      contract,
      /`SELECTED` is never equivalent to `AUTHORIZED`\./,
    );
  });

  await t.test("supports multi-organization and switching", () => {
    assert.match(
      contract,
      /FutVerse must not assume one account belongs to only one organization\./,
    );
    assert.match(contract, /multiple Academies/);
    assert.match(contract, /multiple Pro Clubs/);
    assert.match(
      contract,
      /both Academy and Pro Club organizations/,
    );
    assert.match(
      contract,
      /No cross-organization authority carryover is permitted\./,
    );
  });

  await t.test("requires stale-result protection and logout clearing", () => {
    assert.match(
      contract,
      /older result\s+must never reactivate stale organization authority\./,
    );
    assert.match(
      contract,
      /authenticated UID still matches/,
    );
    assert.match(
      contract,
      /Logout must clear Organization Runtime Selection state\./,
    );
  });

  await t.test("keeps SuperAdmin Pro Club integration closed", () => {
    assert.match(
      accountOrganizationContext,
      /const PRO_CLUB_NOT_CONNECTED = "NOT_CONNECTED" as const;/,
    );
    assert.match(
      accountOrganizationContext,
      /relationship\.organizationType !== "ACADEMY"/,
    );
    assert.match(
      contract,
      /SuperAdmin `proClubAuthority` remains `NOT_CONNECTED`\./,
    );
  });

  await t.test("preserves provider tree and Match boundary", () => {
    assert.match(mainSource, /<AcademyProvider>/);
    assert.match(
      mainSource,
      /<OrganizationRuntimeProvider>/,
    );
    assert.match(
      contract,
      /No shared React provider is approved in this Contract Freeze\./,
    );
    assert.match(
      contract,
      /Current Match Workspace remains Academy-specific\./,
    );
  });

  await t.test("freezes pure implementation files", () => {
    assert.match(
      contract,
      /src\/lib\/organizationRuntimeSelection\.ts/,
    );
    assert.match(
      contract,
      /tests\/organizationRuntimeSelection\.test\.ts/,
    );
    assert.match(
      contract,
      /It must perform no network I\/O and no persistence\./,
    );
  });

  await t.test("freezes exact Contract Freeze scope", () => {
    assert.match(
      contract,
      /docs\/ORGANIZATION_RUNTIME_SELECTION_V1_FREEZE\.md/,
    );
    assert.match(
      contract,
      /tests\/organizationRuntimeSelectionContract\.test\.ts/,
    );
    assert.match(
      contract,
      /No existing production source file may change during Contract Freeze\./,
    );
  });
});
