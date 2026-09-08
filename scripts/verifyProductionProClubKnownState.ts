#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeAdminServices, cleanupAdminApp } from "../functions/src/lib/firebaseAdmin.ts";
import { assertPinnedProject } from "./lib/localTrustedOperatorVerifier.ts";
import {
  validateStoredClubPayload,
  validateStoredMembershipPayload,
} from "../functions/src/proClubProvisioning/core.ts";
import { validateStoredProClubProvisioningAuditForVerification } from "../functions/src/proClubProvisioningAuditVerification/core.ts";

export const KNOWN_STATE_CONFIG_PATH = "config/productionProClubKnownState.json";
export const EXPECTED_PROJECT_ID = "futverse-d7872";

export interface KnownStateTarget {
  clubId: string;
  provisioningId: string;
  originalName: string;
  originalShortName: string;
  level: "T1" | "T2" | "T3";
  country: string;
}

export interface KnownStateEvaluationInput {
  target: KnownStateTarget;
  club: Record<string, unknown>;
  audit: Record<string, unknown>;
  membership: Record<string, unknown> | undefined;
  ownerUser: Record<string, unknown> | undefined;
  operatorUser: Record<string, unknown> | undefined;
  ownerAuthEnabled: boolean;
  nameHistory: Array<Record<string, unknown>>;
}

export interface KnownStateEvaluation {
  canonicalClub: boolean;
  canonicalMembership: boolean;
  canonicalAudit: boolean;
  auditOriginalNameMatches: boolean;
  auditShortNameMatches: boolean;
  auditLevelMatches: boolean;
  auditCountryMatches: boolean;
  auditClubBindingMatches: boolean;
  auditOwnerBindingMatches: boolean;
  auditOperatorBindingMatches: boolean;
  currentNameStillOriginal: boolean;
  currentShortNameStillOriginal: boolean;
  currentLevelMatches: boolean;
  currentCountryMatches: boolean;
  currentStatusActive: boolean;
  ownerActive: boolean;
  operatorActiveSuperAdmin: boolean;
  historyFirstLinkValid: boolean;
  historyChainValid: boolean;
  historyCurrentLinkValid: boolean;
  provisioningEvidenceHealthy: boolean;
  runtimeAuthorityHealthy: boolean;
  currentClubHealthy: boolean;
  renameContinuityHealthy: boolean;
  overall: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function loadKnownStateConfig(path = resolve(process.cwd(), KNOWN_STATE_CONFIG_PATH)): {
  projectId: string;
  targets: KnownStateTarget[];
} {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const record = asRecord(parsed);
  if (!record || record.projectId !== EXPECTED_PROJECT_ID || !Array.isArray(record.targets)) {
    throw new Error("Invalid production Pro Club known-state config");
  }
  const targets = record.targets.map((value) => {
    const target = asRecord(value);
    if (
      !target ||
      typeof target.clubId !== "string" ||
      typeof target.provisioningId !== "string" ||
      typeof target.originalName !== "string" ||
      typeof target.originalShortName !== "string" ||
      (target.level !== "T1" && target.level !== "T2" && target.level !== "T3") ||
      typeof target.country !== "string"
    ) {
      throw new Error("Invalid production Pro Club known-state target");
    }
    return target as unknown as KnownStateTarget;
  });
  if (targets.length === 0) throw new Error("Known-state target list must not be empty");
  return { projectId: EXPECTED_PROJECT_ID, targets };
}

export function evaluateKnownState(input: KnownStateEvaluationInput): KnownStateEvaluation {
  const { target, club, audit, membership, ownerUser, operatorUser, ownerAuthEnabled, nameHistory } = input;
  const normalized = asRecord(audit.normalizedRequest) ?? {};
  const ownerUid = typeof audit.ownerUid === "string" ? audit.ownerUid : "";
  const operatorUid = typeof audit.requestingSuperAdminUid === "string" ? audit.requestingSuperAdminUid : "";

  let canonicalAudit = false;
  try {
    validateStoredProClubProvisioningAuditForVerification(audit, target.provisioningId);
    canonicalAudit = true;
  } catch {
    canonicalAudit = false;
  }

  const canonicalClub = validateStoredClubPayload(club);
  const canonicalMembership = validateStoredMembershipPayload(membership);
  const auditOriginalNameMatches = normalized.name === target.originalName;
  const auditShortNameMatches = normalized.shortName === target.originalShortName;
  const auditLevelMatches = normalized.level === target.level;
  const auditCountryMatches = normalized.country === target.country;
  const auditClubBindingMatches = audit.clubId === target.clubId && normalized.clubId === target.clubId;
  const auditOwnerBindingMatches = ownerUid.length > 0 && normalized.initialOwnerUid === ownerUid;
  const auditOperatorBindingMatches = operatorUid.length > 0 && normalized.requestingSuperAdminUid === operatorUid;
  const currentNameStillOriginal = club.name === target.originalName;
  const currentShortNameStillOriginal = club.shortName === target.originalShortName;
  const currentLevelMatches = club.level === target.level;
  const currentCountryMatches = club.country === target.country;
  const currentStatusActive = club.status === "ACTIVE";
  const ownerActive = Boolean(
    ownerUser &&
    (ownerUser.status === "ACTIVE" || ownerUser.status === "Active") &&
    ownerAuthEnabled,
  );
  const operatorActiveSuperAdmin = Boolean(
    operatorUser &&
    (operatorUser.status === "ACTIVE" || operatorUser.status === "Active") &&
    operatorUser.role === "SUPERADMIN",
  );

  let historyFirstLinkValid = true;
  let historyChainValid = true;
  let historyCurrentLinkValid = true;
  if (nameHistory.length > 0) {
    historyFirstLinkValid = nameHistory[0]?.previousName === normalized.name;
    for (let index = 1; index < nameHistory.length; index += 1) {
      const previous = nameHistory[index - 1];
      const current = nameHistory[index];
      if (
        previous?.newName !== current?.previousName ||
        (previous?.newShortName ?? null) !== (current?.previousShortName ?? null)
      ) {
        historyChainValid = false;
      }
    }
    const latest = nameHistory[nameHistory.length - 1];
    historyCurrentLinkValid =
      latest?.newName === club.name &&
      (latest?.newShortName ?? null) === (club.shortName ?? null);
  }

  const provisioningEvidenceHealthy =
    canonicalAudit &&
    auditOriginalNameMatches &&
    auditShortNameMatches &&
    auditLevelMatches &&
    auditCountryMatches &&
    auditClubBindingMatches &&
    auditOwnerBindingMatches &&
    auditOperatorBindingMatches;

  const runtimeAuthorityHealthy = canonicalMembership && ownerActive && operatorActiveSuperAdmin;
  const currentClubHealthy = canonicalClub && currentLevelMatches && currentCountryMatches && currentStatusActive;
  const renameContinuityHealthy = nameHistory.length === 0
    ? currentNameStillOriginal && currentShortNameStillOriginal
    : historyFirstLinkValid && historyChainValid && historyCurrentLinkValid;

  return {
    canonicalClub,
    canonicalMembership,
    canonicalAudit,
    auditOriginalNameMatches,
    auditShortNameMatches,
    auditLevelMatches,
    auditCountryMatches,
    auditClubBindingMatches,
    auditOwnerBindingMatches,
    auditOperatorBindingMatches,
    currentNameStillOriginal,
    currentShortNameStillOriginal,
    currentLevelMatches,
    currentCountryMatches,
    currentStatusActive,
    ownerActive,
    operatorActiveSuperAdmin,
    historyFirstLinkValid,
    historyChainValid,
    historyCurrentLinkValid,
    provisioningEvidenceHealthy,
    runtimeAuthorityHealthy,
    currentClubHealthy,
    renameContinuityHealthy,
    overall: provisioningEvidenceHealthy && runtimeAuthorityHealthy && currentClubHealthy && renameContinuityHealthy,
  };
}

export async function verifyProductionKnownState(target: KnownStateTarget): Promise<KnownStateEvaluation> {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST must be absent for production known-state verification");
  }
  const appName = `known-state-${target.clubId}-${Date.now()}`;
  const admin = initializeAdminServices({ projectId: EXPECTED_PROJECT_ID, appName });
  try {
    assertPinnedProject(admin.app, admin.firestore, EXPECTED_PROJECT_ID);
    const clubRef = admin.firestore.collection("proClubs").doc(target.clubId);
    const auditRef = admin.firestore.collection("proClubProvisioningAudits").doc(target.provisioningId);
    const [clubSnap, auditSnap, historySnap] = await Promise.all([
      clubRef.get(),
      auditRef.get(),
      clubRef.collection("nameHistory").orderBy("effectiveAt", "asc").get(),
    ]);
    if (!clubSnap.exists) throw new Error(`Known Pro Club '${target.clubId}' is missing`);
    if (!auditSnap.exists) throw new Error(`Known provisioning audit '${target.provisioningId}' is missing`);
    const club = clubSnap.data() ?? {};
    const audit = auditSnap.data() ?? {};
    const ownerUid = typeof audit.ownerUid === "string" ? audit.ownerUid : "";
    const operatorUid = typeof audit.requestingSuperAdminUid === "string" ? audit.requestingSuperAdminUid : "";
    if (!ownerUid || !operatorUid || ownerUid === operatorUid) throw new Error("Stored audit identity binding is invalid");
    const [membershipSnap, ownerSnap, operatorSnap] = await Promise.all([
      clubRef.collection("members").doc(ownerUid).get(),
      admin.firestore.collection("users").doc(ownerUid).get(),
      admin.firestore.collection("users").doc(operatorUid).get(),
    ]);
    let ownerAuthEnabled = false;
    try {
      const ownerAuth = await admin.auth.getUser(ownerUid);
      ownerAuthEnabled = ownerAuth.disabled !== true;
    } catch {
      ownerAuthEnabled = false;
    }
    return evaluateKnownState({
      target,
      club,
      audit,
      membership: membershipSnap.data(),
      ownerUser: ownerSnap.data(),
      operatorUser: operatorSnap.data(),
      ownerAuthEnabled,
      nameHistory: historySnap.docs.map((doc) => doc.data()),
    });
  } finally {
    await cleanupAdminApp(appName);
  }
}

async function main(): Promise<void> {
  const config = loadKnownStateConfig();
  for (const target of config.targets) {
    const result = await verifyProductionKnownState(target);
    console.log(`KNOWN_STATE_TARGET=${target.clubId}`);
    console.log(`CANONICAL_CLUB_SHAPE=${result.canonicalClub ? "PASS" : "FAIL"}`);
    console.log(`CANONICAL_MEMBERSHIP=${result.canonicalMembership ? "PASS" : "FAIL"}`);
    console.log(`CANONICAL_AUDIT_FINGERPRINT=${result.canonicalAudit ? "PASS" : "FAIL"}`);
    console.log(`RENAME_CONTINUITY=${result.renameContinuityHealthy ? "PASS" : "FAIL"}`);
    console.log(`RUNTIME_AUTHORITY=${result.runtimeAuthorityHealthy ? "PASS" : "FAIL"}`);
    console.log(`KNOWN_STATE_VERDICT=${result.overall ? "PASS" : "FAIL"}`);
    if (!result.overall) process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
