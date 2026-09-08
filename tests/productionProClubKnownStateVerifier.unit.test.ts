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

function renameRecord(overrides: Record<string, unknown> = {}) {
  return {
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
  assert.equal(result.provisioningTimestampBindingMatches, true);
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
    nameHistory: [renameRecord()],
  }));
  assert.equal(result.auditOriginalNameMatches, true);
  assert.equal(result.currentNameStillOriginal, false);
  assert.equal(result.historyShapeValid, true);
  assert.equal(result.historyTemporalOrderValid, true);
  assert.equal(result.historyFirstLinkValid, true);
  assert.equal(result.historyCurrentLinkValid, true);
  assert.equal(result.historyRootTimestampValid, true);
  assert.equal(result.renameContinuityHealthy, true);
  assert.equal(result.overall, true);
});

test("broken rename continuity fails closed", () => {
  const result = evaluateKnownState(makeInput({
    club: {
      ...makeInput().club,
      name: "Unexpected Name",
      shortName: "UN",
      updatedAt: "2026-09-08T03:00:00.000Z",
    },
    nameHistory: [renameRecord({
      previousName: "Wrong Previous Name",
      newName: "Unexpected Name",
      newShortName: "UN",
    })],
  }));
  assert.equal(result.historyFirstLinkValid, false);
  assert.equal(result.renameContinuityHealthy, false);
  assert.equal(result.overall, false);
});

test("rename history with unexpected fields fails exact-shape validation", () => {
  const result = evaluateKnownState(makeInput({
    club: {
      ...makeInput().club,
      name: "Lampang United",
      shortName: "LUFC",
      updatedAt: "2026-09-08T03:00:00.000Z",
    },
    nameHistory: [renameRecord({ unexpectedField: true })],
  }));
  assert.equal(result.historyShapeValid, false);
  assert.equal(result.renameContinuityHealthy, false);
  assert.equal(result.overall, false);
});

test("malformed history missing effectiveAt fails closed instead of being hidden by query ordering", () => {
  const malformed = renameRecord();
  delete malformed.effectiveAt;
  const result = evaluateKnownState(makeInput({
    club: {
      ...makeInput().club,
      name: "Lampang United",
      shortName: "LUFC",
      updatedAt: "2026-09-08T03:00:00.000Z",
    },
    nameHistory: [malformed],
  }));
  assert.equal(result.historyShapeValid, false);
  assert.equal(result.historyTemporalOrderValid, false);
  assert.equal(result.renameContinuityHealthy, false);
  assert.equal(result.overall, false);
});

test("rename history is sorted in-memory and must form a monotonic effectiveAt chain", () => {
  const first = renameRecord({
    newName: "Lampang United",
    newShortName: "LUFC",
    effectiveAt: "2026-09-08T03:00:00.000Z",
    changedAt: "2026-09-08T03:30:00.000Z",
  });
  const second = renameRecord({
    previousName: "Lampang United",
    previousShortName: "LUFC",
    newName: "Lampang City",
    newShortName: "LCFC",
    effectiveAt: "2026-09-08T04:00:00.000Z",
    changedAt: "2026-09-08T05:00:00.000Z",
  });
  const result = evaluateKnownState(makeInput({
    club: {
      ...makeInput().club,
      name: "Lampang City",
      shortName: "LCFC",
      updatedAt: "2026-09-08T05:00:00.000Z",
    },
    nameHistory: [second, first],
  }));
  assert.equal(result.historyShapeValid, true);
  assert.equal(result.historyChainValid, true);
  assert.equal(result.historyTemporalOrderValid, true);
  assert.equal(result.historyCurrentLinkValid, true);
  assert.equal(result.historyRootTimestampValid, true);
  assert.equal(result.overall, true);
});

test("duplicate or non-increasing effectiveAt values fail closed", () => {
  const first = renameRecord({
    newName: "Lampang United",
    newShortName: "LUFC",
    effectiveAt: "2026-09-08T04:00:00.000Z",
    changedAt: "2026-09-08T04:01:00.000Z",
  });
  const second = renameRecord({
    previousName: "Lampang United",
    previousShortName: "LUFC",
    newName: "Lampang City",
    newShortName: "LCFC",
    effectiveAt: "2026-09-08T04:00:00.000Z",
    changedAt: "2026-09-08T05:00:00.000Z",
  });
  const result = evaluateKnownState(makeInput({
    club: {
      ...makeInput().club,
      name: "Lampang City",
      shortName: "LCFC",
      updatedAt: "2026-09-08T05:00:00.000Z",
    },
    nameHistory: [first, second],
  }));
  assert.equal(result.historyShapeValid, true);
  assert.equal(result.historyTemporalOrderValid, false);
  assert.equal(result.renameContinuityHealthy, false);
  assert.equal(result.overall, false);
});

test("provisioning audit createdAt must bind exactly to club createdAt", () => {
  const result = evaluateKnownState(makeInput({
    club: {
      ...makeInput().club,
      createdAt: "2026-09-04T16:14:34.000Z",
      updatedAt: "2026-09-04T16:14:34.000Z",
    },
  }));
  assert.equal(result.canonicalClub, true);
  assert.equal(result.provisioningTimestampBindingMatches, false);
  assert.equal(result.provisioningEvidenceHealthy, false);
  assert.equal(result.overall, false);
});

test("latest rename changedAt must bind exactly to club updatedAt", () => {
  const result = evaluateKnownState(makeInput({
    club: {
      ...makeInput().club,
      name: "Lampang United",
      shortName: "LUFC",
      updatedAt: "2026-09-08T03:00:01.000Z",
    },
    nameHistory: [renameRecord()],
  }));
  assert.equal(result.historyRootTimestampValid, false);
  assert.equal(result.renameContinuityHealthy, false);
  assert.equal(result.overall, false);
});

test("historical provisioning operator may later become inactive without revoking current owner runtime", () => {
  const result = evaluateKnownState(makeInput({
    operatorUser: { status: "INACTIVE", role: "SUPERADMIN" },
  }));
  assert.equal(result.operatorActiveSuperAdmin, false);
  assert.equal(result.provisioningEvidenceHealthy, true);
  assert.equal(result.runtimeAuthorityHealthy, true);
  assert.equal(result.overall, true);
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
