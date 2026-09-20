import assert from "node:assert/strict";
import test from "node:test";
import {
  planProClubOwnerTechnicalDirectorDualRole,
} from "../src/lib/proClubOwnerTechnicalDirectorDualRole.ts";
import {
  parseOwnerTechnicalDirectorArgs,
} from "../scripts/assignProClubOwnerTechnicalDirectorLocal.ts";

const club = {
  name: "TNSU Lampang",
  level: "T3",
  status: "ACTIVE",
};

function ownerMembership(uid = "owner-1") {
  return {
    uid,
    data: {
      authorizationRole: "OWNER",
      status: "ACTIVE",
    },
  };
}

test("plans CREATE while preserving OWNER membership authority", () => {
  const result = planProClubOwnerTechnicalDirectorDualRole({
    clubId: "club-lampang",
    club,
    memberships: [ownerMembership()],
    ownerUser: { status: "ACTIVE" },
    existingStaffAssignment: null,
  });

  assert.deepEqual(result, {
    action: "CREATE",
    ownerUid: "owner-1",
    membershipAuthorizationRole: "OWNER",
    staffRole: "TECHNICAL_DIRECTOR",
    staffStatus: "ACTIVE",
  });
});

test("is idempotent when OWNER already has active TECHNICAL_DIRECTOR assignment", () => {
  const result = planProClubOwnerTechnicalDirectorDualRole({
    clubId: "club-lampang",
    club,
    memberships: [ownerMembership()],
    ownerUser: { status: "Active" },
    existingStaffAssignment: {
      staffRole: "TECHNICAL_DIRECTOR",
      status: "ACTIVE",
    },
  });

  assert.equal(result.action, "NOOP");
  assert.equal(result.membershipAuthorizationRole, "OWNER");
});

test("fails closed when zero or multiple ACTIVE OWNER memberships exist", () => {
  assert.throws(
    () => planProClubOwnerTechnicalDirectorDualRole({
      clubId: "club-lampang",
      club,
      memberships: [],
      ownerUser: { status: "ACTIVE" },
      existingStaffAssignment: null,
    }),
    /exactly one ACTIVE OWNER/,
  );

  assert.throws(
    () => planProClubOwnerTechnicalDirectorDualRole({
      clubId: "club-lampang",
      club,
      memberships: [ownerMembership("owner-1"), ownerMembership("owner-2")],
      ownerUser: { status: "ACTIVE" },
      existingStaffAssignment: null,
    }),
    /found 2/,
  );
});

test("refuses to overwrite an existing staff role or inactive assignment", () => {
  for (const existingStaffAssignment of [
    { staffRole: "HEAD_COACH", status: "ACTIVE" },
    { staffRole: "TECHNICAL_DIRECTOR", status: "INACTIVE" },
  ]) {
    assert.throws(
      () => planProClubOwnerTechnicalDirectorDualRole({
        clubId: "club-lampang",
        club,
        memberships: [ownerMembership()],
        ownerUser: { status: "ACTIVE" },
        existingStaffAssignment,
      }),
      /overwrite is forbidden/,
    );
  }
});

test("requires canonical active club, canonical memberships and active owner user", () => {
  assert.throws(
    () => planProClubOwnerTechnicalDirectorDualRole({
      clubId: "club-lampang",
      club: { ...club, status: "INACTIVE" },
      memberships: [ownerMembership()],
      ownerUser: { status: "ACTIVE" },
      existingStaffAssignment: null,
    }),
    /canonical and ACTIVE/,
  );

  assert.throws(
    () => planProClubOwnerTechnicalDirectorDualRole({
      clubId: "club-lampang",
      club,
      memberships: [{
        uid: "owner-1",
        data: { authorizationRole: "OWNER", status: "ACTIVE", extra: true },
      }],
      ownerUser: { status: "ACTIVE" },
      existingStaffAssignment: null,
    }),
    /membership documents must be canonical/,
  );

  assert.throws(
    () => planProClubOwnerTechnicalDirectorDualRole({
      clubId: "club-lampang",
      club,
      memberships: [ownerMembership()],
      ownerUser: { status: "INACTIVE" },
      existingStaffAssignment: null,
    }),
    /user account must be ACTIVE/,
  );
});

test("CLI accepts only club target and rejects operator identity injection", () => {
  assert.deepEqual(
    parseOwnerTechnicalDirectorArgs([
      "--club-id", "club-lampang", "--dry-run", "--json",
    ]),
    {
      clubId: "club-lampang",
      dryRun: true,
      jsonOutput: true,
    },
  );

  assert.throws(
    () => parseOwnerTechnicalDirectorArgs([
      "--club-id", "club-lampang", "--operator-uid", "attacker",
    ]),
    /forbidden/i,
  );
});

test("dual-role model integrates with existing authority resolver without downgrading OWNER", async () => {
  const {
    resolveActiveProClubStaffRole,
    hasActiveProClubMembershipAuthority,
  } = await import("../src/lib/proClubModel.ts");

  const membership = { authorizationRole: "OWNER", status: "ACTIVE" } as const;
  const assignment = { staffRole: "TECHNICAL_DIRECTOR", status: "ACTIVE" } as const;
  const clubContext = { clubId: "club-lampang", documentId: "club-lampang" };
  const memberContext = {
    clubId: "club-lampang",
    documentClubId: "club-lampang",
    userId: "owner-1",
    documentId: "owner-1",
  };

  assert.equal(
    hasActiveProClubMembershipAuthority(
      club,
      clubContext,
      membership,
      memberContext,
    ),
    true,
  );
  assert.equal(
    resolveActiveProClubStaffRole(
      club,
      clubContext,
      membership,
      memberContext,
      assignment,
      memberContext,
    ),
    "TECHNICAL_DIRECTOR",
  );
  assert.equal(membership.authorizationRole, "OWNER");
});
