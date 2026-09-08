#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeAdminServices, cleanupAdminApp } from "../functions/src/lib/firebaseAdmin.ts";
import { assertPinnedProject } from "./lib/localTrustedOperatorVerifier.ts";
import {
  isValidCanonicalIsoUtcTimestamp,
  isValidDocumentIdentifier,
  validateStoredClubPayload,
  validateStoredMembershipPayload,
} from "../functions/src/proClubProvisioning/core.ts";
import { validateStoredProClubProvisioningAuditForVerification } from "../functions/src/proClubProvisioningAuditVerification/core.ts";

export const KNOWN_STATE_CONFIG_PATH = "config/productionProClubKnownState.json";
export const EXPECTED_PROJECT_ID = "futverse-d7872";

const CONFIG_FIELDS = new Set(["projectId", "targets"]);
const TARGET_FIELDS = new Set([
  "clubId",
  "provisioningId",
  "originalName",
  "originalShortName",
  "level",
  "country",
]);
const HISTORY_FIELDS = new Set([
  "schemaVersion",
  "clubId",
  "previousName",
  "previousShortName",
  "newName",
  "newShortName",
  "reason",
  "reasonNote",
  "effectiveAt",
  "changedAt",
  "changedBy",
]);
const RENAME_REASONS = new Set(["TAKEOVER", "REBRAND", "LEGAL_NAME_CHANGE", "OTHER"]);
const MAX_RENAME_NAME_LENGTH = 120;
const MAX_REASON_NOTE_LENGTH = 500;

export interface KnownStateTarget {
  clubId: string;
  provisioningId: string;
  originalName: string;
  originalShortName: string | null;
  level: "T1" | "T2" | "T3";
  country: string | null;
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
  provisioningTimestampBindingMatches: boolean;
  currentNameStillOriginal: boolean;
  currentShortNameStillOriginal: boolean;
  currentLevelMatches: boolean;
  currentCountryMatches: boolean;
  currentStatusActive: boolean;
  ownerActive: boolean;
  operatorActiveSuperAdmin: boolean;
  historyShapeValid: boolean;
  historyTemporalOrderValid: boolean;
  historyFirstLinkValid: boolean;
  historyChainValid: boolean;
  historyCurrentLinkValid: boolean;
  historyRootTimestampValid: boolean;
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

function hasExactKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  const keys = Object.keys(record);
  return keys.length === allowed.size && keys.every((key) => allowed.has(key));
}

function isCanonicalText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function isNullableCanonicalText(value: unknown): value is string | null {
  return value === null || isCanonicalText(value);
}

function isCanonicalHistoryRecord(value: unknown, clubId: string): value is Record<string, unknown> {
  const history = asRecord(value);
  if (!history || !hasExactKeys(history, HISTORY_FIELDS)) return false;
  if (history.schemaVersion !== 1 || history.clubId !== clubId) return false;
  if (!isCanonicalText(history.previousName) || !isCanonicalText(history.newName)) return false;
  if (history.newName.length > MAX_RENAME_NAME_LENGTH) return false;
  if (!isNullableCanonicalText(history.previousShortName) || !isNullableCanonicalText(history.newShortName)) return false;
  if (typeof history.reason !== "string" || !RENAME_REASONS.has(history.reason)) return false;
  if (!isNullableCanonicalText(history.reasonNote)) return false;
  if (history.reasonNote !== null && history.reasonNote.length > MAX_REASON_NOTE_LENGTH) return false;
  if (history.reason === "OTHER" ? history.reasonNote === null : history.reasonNote !== null) return false;
  if (!isValidCanonicalIsoUtcTimestamp(history.effectiveAt) || !isValidCanonicalIsoUtcTimestamp(history.changedAt)) return false;
  if (Date.parse(history.effectiveAt) > Date.parse(history.changedAt)) return false;
  return isValidDocumentIdentifier(history.changedBy);
}

function sortedCanonicalHistory(nameHistory: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return [...nameHistory].sort((left, right) => {
    const effectiveDelta = Date.parse(left.effectiveAt as string) - Date.parse(right.effectiveAt as string);
    if (effectiveDelta !== 0) return effectiveDelta;
    const changedDelta = Date.parse(left.changedAt as string) - Date.parse(right.changedAt as string);
    if (changedDelta !== 0) return changedDelta;
    return String(left.changedBy).localeCompare(String(right.changedBy));
  });
}

export function loadKnownStateConfig(path = resolve(process.cwd(), KNOWN_STATE_CONFIG_PATH)): {
  projectId: string;
  targets: KnownStateTarget[];
} {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const record = asRecord(parsed);
  if (
    !record ||
    !hasExactKeys(record, CONFIG_FIELDS) ||
    record.projectId !== EXPECTED_PROJECT_ID ||
    !Array.isArray(record.targets)
  ) {
    throw new Error("Invalid production Pro Club known-state config");
  }
  const targets = record.targets.map((value) => {
    const target = asRecord(value);
    if (
      !target ||
      !hasExactKeys(target, TARGET_FIELDS) ||
      !isValidDocumentIdentifier(target.clubId) ||
      !isValidDocumentIdentifier(target.provisioningId) ||
      !isCanonicalText(target.originalName) ||
      !isNullableCanonicalText(target.originalShortName) ||
      (target.level !== "T1" && target.level !== "T2" && target.level !== "T3") ||
      !isNullableCanonicalText(target.country)
    ) {
      throw new Error("Invalid production Pro Club known-state target");
    }
    return target as unknown as KnownStateTarget;
  });
  if (targets.length === 0) throw new Error("Known-state target list must not be empty");
  const clubIds = targets.map((target) => target.clubId);
  const provisioningIds = targets.map((target) => target.provisioningId);
  if (new Set(clubIds).size !== clubIds.length || new Set(provisioningIds).size !== provisioningIds.length) {
    throw new Error("Known-state targets must have unique clubId and provisioningId values");
  }
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
  const provisioningTimestampBindingMatches =
    typeof audit.createdAt === "string" &&
    typeof club.createdAt === "string" &&
    audit.createdAt === club.createdAt;
  const currentNameStillOriginal = club.name === target.originalName;
  const currentShortNameStillOriginal = (club.shortName ?? null) === target.originalShortName;
  const currentLevelMatches = club.level === target.level;
  const currentCountryMatches = (club.country ?? null) === target.country;
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

  const historyShapeValid = nameHistory.every((entry) => isCanonicalHistoryRecord(entry, target.clubId));
  const orderedHistory = historyShapeValid ? sortedCanonicalHistory(nameHistory) : [];
  let historyTemporalOrderValid = historyShapeValid;
  let historyFirstLinkValid = nameHistory.length === 0;
  let historyChainValid = nameHistory.length === 0;
  let historyCurrentLinkValid = nameHistory.length === 0;
  let historyRootTimestampValid = nameHistory.length === 0;

  if (nameHistory.length > 0 && !historyShapeValid) {
    historyTemporalOrderValid = false;
    historyFirstLinkValid = false;
    historyChainValid = false;
    historyCurrentLinkValid = false;
    historyRootTimestampValid = false;
  } else if (orderedHistory.length > 0) {
    const first = orderedHistory[0];
    historyFirstLinkValid =
      first.previousName === normalized.name &&
      (first.previousShortName ?? null) === (normalized.shortName ?? null);

    const clubCreatedAt = typeof club.createdAt === "string" ? club.createdAt : null;
    if (
      clubCreatedAt &&
      isValidCanonicalIsoUtcTimestamp(clubCreatedAt) &&
      typeof first.effectiveAt === "string" &&
      Date.parse(first.effectiveAt) < Date.parse(clubCreatedAt)
    ) {
      historyTemporalOrderValid = false;
    }

    historyChainValid = true;
    for (let index = 1; index < orderedHistory.length; index += 1) {
      const previous = orderedHistory[index - 1];
      const current = orderedHistory[index];
      if (
        previous.newName !== current.previousName ||
        (previous.newShortName ?? null) !== (current.previousShortName ?? null)
      ) {
        historyChainValid = false;
      }
      if (
        typeof previous.effectiveAt !== "string" ||
        typeof current.effectiveAt !== "string" ||
        Date.parse(current.effectiveAt) <= Date.parse(previous.effectiveAt)
      ) {
        historyTemporalOrderValid = false;
      }
    }

    const latest = orderedHistory[orderedHistory.length - 1];
    historyCurrentLinkValid =
      latest.newName === club.name &&
      (latest.newShortName ?? null) === (club.shortName ?? null);
    historyRootTimestampValid =
      typeof latest.changedAt === "string" &&
      typeof club.updatedAt === "string" &&
      latest.changedAt === club.updatedAt;
  }

  const provisioningEvidenceHealthy =
    canonicalAudit &&
    auditOriginalNameMatches &&
    auditShortNameMatches &&
    auditLevelMatches &&
    auditCountryMatches &&
    auditClubBindingMatches &&
    auditOwnerBindingMatches &&
    auditOperatorBindingMatches &&
    provisioningTimestampBindingMatches;

  // Current owner runtime authority does not depend on whether the historical
  // provisioning operator still holds SUPERADMIN authority today. The current
  // operator state remains reported separately as an informational signal.
  const runtimeAuthorityHealthy = canonicalMembership && ownerActive;
  const currentClubHealthy = canonicalClub && currentLevelMatches && currentCountryMatches && currentStatusActive;
  const renameContinuityHealthy = nameHistory.length === 0
    ? currentNameStillOriginal && currentShortNameStillOriginal
    : historyShapeValid &&
      historyTemporalOrderValid &&
      historyFirstLinkValid &&
      historyChainValid &&
      historyCurrentLinkValid &&
      historyRootTimestampValid;

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
    provisioningTimestampBindingMatches,
    currentNameStillOriginal,
    currentShortNameStillOriginal,
    currentLevelMatches,
    currentCountryMatches,
    currentStatusActive,
    ownerActive,
    operatorActiveSuperAdmin,
    historyShapeValid,
    historyTemporalOrderValid,
    historyFirstLinkValid,
    historyChainValid,
    historyCurrentLinkValid,
    historyRootTimestampValid,
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
      // Intentionally read the entire collection without orderBy. Firestore
      // orderBy excludes documents missing the ordered field, which could hide
      // malformed/tampered history from an integrity verifier.
      clubRef.collection("nameHistory").get(),
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
    console.log(`PROVISIONING_TIMESTAMP_BINDING=${result.provisioningTimestampBindingMatches ? "PASS" : "FAIL"}`);
    console.log(`RENAME_HISTORY_SHAPE=${result.historyShapeValid ? "PASS" : "FAIL"}`);
    console.log(`RENAME_HISTORY_ORDER=${result.historyTemporalOrderValid ? "PASS" : "FAIL"}`);
    console.log(`RENAME_HISTORY_ROOT_TIMESTAMP=${result.historyRootTimestampValid ? "PASS" : "FAIL"}`);
    console.log(`RENAME_CONTINUITY=${result.renameContinuityHealthy ? "PASS" : "FAIL"}`);
    console.log(`RUNTIME_AUTHORITY=${result.runtimeAuthorityHealthy ? "PASS" : "FAIL"}`);
    console.log(`ORIGINAL_OPERATOR_CURRENT_SUPERADMIN=${result.operatorActiveSuperAdmin ? "YES" : "NO"}`);
    console.log(`KNOWN_STATE_VERDICT=${result.overall ? "PASS" : "FAIL"}`);
    if (!result.overall) process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
