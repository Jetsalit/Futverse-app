import assert from "node:assert/strict";
import test from "node:test";
import { computeProvisioningRequestFingerprint } from "../functions/src/proClubProvisioning/core.ts";
import {
  evaluateKnownState,
  loadKnownStateConfig,
  type KnownStateTarget,
} from "../scripts/verifyProductionProClubKnownState.ts";

const target: KnownStateTarget = {
  clubId: "tnsu-lampang",
  provisioningId: "proclub-tnsu-lampang-20260904-001",
  originalName: "มหาวิทยาลัยการกีฬาแห่งชาติ วิทยาเขตลำปาง",
  originalShortName: "TNSU Lampang",
  level: "T3",
  country: "TH",
};

const ownerUid = "owner-test-uid-0000000001";
const operatorUid = "operator-test-uid-0000001";
const createdAt = "2026-09-04T16:14:33.556Z";

function makeAudit() {
  const normalized = {
    clubId: target.clubId,
    country: target.country,
    initialOwnerUid: ownerUid,
    level: target.level,
    logoUrl: null,
    name: target.originalName,
    provisioningId: target.provisioningId,
    requestingSuperAdminUid: operatorUid,
    shortName: target.originalShortName,
  } as const;
  return {
    schemaVersion: 1,
    provisioningId: target.provisioningId,
    clubId: target.clubId,
    ownerUid,
    requestingSuperAdminUid: operatorUid,
    requestFingerprint: computeProvisioningRequestFingerprint(normalized),
    normalizedRequest: normalized,
    createdAt,
    status: "COMPLETED",
  };
}

function makeInput(overrides: Partial<Parameters<typeof evaluateKnownState>[0]> = {}) {
  return {
    target,
    club: {
      name: target.originalName,
      shortName: target.originalShortName,
      level: target.level,
      status: "ACTIVE",
      country: target.country,
      createdAt,
      updatedAt: createdAt,
    },
    audit: makeAudit(),
    membership: { authorizationRole: "OWNER", status: "ACTIVE" },
    ownerUser: { status: "ACTIVE" },
    operatorUser: { status: "ACTIVE", role: "SUPERADMIN" },
    ownerAuthEnabled: true,
    nameHistory: [],
    ...overrides,
  };
}

test("UTF-8 config preserves the canonical Thai TNSU Lampang name exactly", () => {
  const config = loadKnownStateConfig();
  assert.equal(config.projectId, "futverse-d7872");
  assert.equal(config.targets.length, 1);
  assert.equal(config.targets[0].originalName, target.originalName);
  assert.equal(config.targets[0].originalName.includes("?"), false);
});

test("unchanged Thai club state passes without shell encoding dependencies", () => {
  const result = evaluateKnownState(makeInput());
  assert.equal(result.canonicalClub, true);
  assert.equal(result.canonicalAudit, true);
  assert.equal(result.auditOriginalNameMatches, true);
  assert.equal(result.currentNameStillOriginal, true);
  assert.equal(result.renameContinuityHealthy, true);
  assert.equal(result.overall, true);
});

test("a valid rename chain may change the current name without invalidating provisioning evidence", () => {
  const renamedClub = {
    ...makeInput().club,
    name: "Lampang United",
    shortName: "LUFC",
    updatedAt: "2026-09-08T03:00:00.000Z",
  };
  const result = evaluateKnownState(makeInput({
    club: renamedClub,
    nameHistory: [{
      schemaVersion: 1,
      clubId: target.clubId,
      previousName: target.originalName,
      previousShortName: target.originalShortName,
      newName: "Lampang United",
      newShortName: "LUFC",
      reason: "REBRAND",
      reasonNote: null,
      effectiveAt: "2026-09-08T02:00:00.000Z",
      changedAt: "2026-09-08T03:00:00.000Z",
      changedBy: operatorUid,
    }],
  }));
  assert.equal(result.auditOriginalNameMatches, true);
  assert.equal(result.currentNameStillOriginal, false);
  assert.equal(result.historyFirstLinkValid, true);
  assert.equal(result.historyCurrentLinkValid, true);
  assert.equal(result.renameContinuityHealthy, true);
  assert.equal(result.overall, true);
});

test("broken rename continuity fails closed", () => {
  const result = evaluateKnownState(makeInput({
    club: {
      ...makeInput().club,
      name: "Unexpected Name",
      shortName: "UN",
    },
    nameHistory: [{
      previousName: "Wrong Previous Name",
      previousShortName: target.originalShortName,
      newName: "Unexpected Name",
      newShortName: "UN",
    }],
  }));
  assert.equal(result.historyFirstLinkValid, false);
  assert.equal(result.renameContinuityHealthy, false);
  assert.equal(result.overall, false);
});

test("tampered provisioning evidence fails the canonical audit fingerprint gate", () => {
  const originalAudit = makeAudit();
  const tamperedAudit = {
    ...originalAudit,
    normalizedRequest: {
      ...originalAudit.normalizedRequest,
      name: "Tampered Name",
    },
  };
  const result = evaluateKnownState(makeInput({ audit: tamperedAudit }));
  assert.equal(result.canonicalAudit, false);
  assert.equal(result.provisioningEvidenceHealthy, false);
  assert.equal(result.overall, false);
});

test("inactive or disabled owner fails runtime authority without changing provisioning evidence", () => {
  const result = evaluateKnownState(makeInput({ ownerAuthEnabled: false }));
  assert.equal(result.provisioningEvidenceHealthy, true);
  assert.equal(result.ownerActive, false);
  assert.equal(result.runtimeAuthorityHealthy, false);
  assert.equal(result.overall, false);
});
