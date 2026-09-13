#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Firestore } from "firebase-admin/firestore";
import { initializeAdminServices } from "../functions/src/lib/firebaseAdmin.ts";
import {
  isValidDocumentIdentifier,
  validateProClub,
  validateProClubMembership,
  validateProClubStaffAssignment,
} from "../src/lib/proClubModel.ts";
import {
  resolveProClubTechnicalAuthority,
  type ProClubTechnicalAuthorityRole,
  type ProClubTechnicalStaffCandidate,
} from "../src/lib/proClubTechnicalGovernance.ts";
import {
  assertPinnedProject,
  EXPECTED_PROJECT_ID,
  LOCAL_OPERATOR_ENV_KEY,
  resolveTrustedLocalOperatorUid,
} from "./lib/localTrustedOperatorVerifier.ts";

export interface LocalTechnicalGovernanceBootstrapOptions {
  clubId: string;
  dryRun: boolean;
  jsonOutput: boolean;
}

export interface LocalTechnicalGovernanceBootstrapDependencies {
  app?: { options?: { projectId?: unknown } };
  firestore: Firestore;
  env?: Record<string, string | undefined>;
  expectedProjectId?: string;
}

export type TechnicalGovernanceBootstrapErrorCode =
  | "INVALID_CLUB_ID"
  | "UNAUTHORIZED_OPERATOR"
  | "CLUB_MISSING"
  | "CLUB_INVALID"
  | "CLUB_INACTIVE"
  | "STAFF_INVALID"
  | "MEMBERSHIP_INVALID"
  | "AUTHORITY_MISSING"
  | "AUTHORITY_AMBIGUOUS"
  | "AUTHORITY_INVALID"
  | "CURRENT_CONFLICT";

export class TechnicalGovernanceBootstrapError extends Error {
  constructor(
    readonly code: TechnicalGovernanceBootstrapErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TechnicalGovernanceBootstrapError";
  }
}

export interface TechnicalGovernanceCurrentV1 {
  schemaVersion: 1;
  status: "ACTIVE";
  authorityUid: string;
  authorityRole: ProClubTechnicalAuthorityRole;
}

interface TechnicalGovernanceBootstrapResultBase {
  ok: true;
  targetProjectId: string;
  operatorUid: string;
  clubId: string;
  authorityUid: string;
  authorityRole: ProClubTechnicalAuthorityRole;
}

export interface TechnicalGovernanceBootstrapLiveResult
  extends TechnicalGovernanceBootstrapResultBase {
  dryRun: false;
  status: "CREATED" | "NOOP";
}

export interface TechnicalGovernanceBootstrapDryRunResult
  extends TechnicalGovernanceBootstrapResultBase {
  dryRun: true;
  status: "DRY_RUN";
  wouldStatus: "CREATED" | "NOOP";
}

export type TechnicalGovernanceBootstrapResult =
  | TechnicalGovernanceBootstrapLiveResult
  | TechnicalGovernanceBootstrapDryRunResult;

const TECHNICAL_ROLES = new Set<ProClubTechnicalAuthorityRole>([
  "TECHNICAL_DIRECTOR",
  "HEAD_COACH",
]);

const CURRENT_FIELDS = [
  "authorityRole",
  "authorityUid",
  "schemaVersion",
  "status",
] as const;

const FORBIDDEN_IDENTITY_FLAG =
  /^--(?:operator|requester|superadmin|authority)(?:[-_]?(?:uid|role))?$/i;

function fail(
  code: TechnicalGovernanceBootstrapErrorCode,
  message: string,
): never {
  throw new TechnicalGovernanceBootstrapError(code, message);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function assertCanonicalClubId(value: unknown): asserts value is string {
  if (!isValidDocumentIdentifier(value) || /\s/.test(value)) {
    fail("INVALID_CLUB_ID", "--club-id must be one exact canonical document identifier");
  }
}

function isTechnicalRole(value: unknown): value is ProClubTechnicalAuthorityRole {
  return value === "TECHNICAL_DIRECTOR" || value === "HEAD_COACH";
}

function buildCurrentDocument(input: {
  authorityUid: string;
  authorityRole: ProClubTechnicalAuthorityRole;
}): TechnicalGovernanceCurrentV1 {
  return {
    schemaVersion: 1,
    status: "ACTIVE",
    authorityUid: input.authorityUid,
    authorityRole: input.authorityRole,
  };
}

function isExactCurrentDocument(
  value: unknown,
): value is TechnicalGovernanceCurrentV1 {
  const record = asRecord(value);
  if (!record) return false;

  const fields = Object.keys(record).sort();
  return (
    fields.length === CURRENT_FIELDS.length &&
    fields.every((field, index) => field === CURRENT_FIELDS[index]) &&
    record.schemaVersion === 1 &&
    record.status === "ACTIVE" &&
    isValidDocumentIdentifier(record.authorityUid) &&
    isTechnicalRole(record.authorityRole)
  );
}

function currentDocumentsMatch(
  left: TechnicalGovernanceCurrentV1,
  right: TechnicalGovernanceCurrentV1,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.status === right.status &&
    left.authorityUid === right.authorityUid &&
    left.authorityRole === right.authorityRole
  );
}

export function parseTechnicalGovernanceBootstrapArgs(
  argv: string[],
): LocalTechnicalGovernanceBootstrapOptions {
  let clubId: string | undefined;
  let dryRun = false;
  let jsonOutput = false;

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith("--")) {
      throw new Error(`Unexpected positional argument '${raw}'`);
    }

    const equalsIndex = raw.indexOf("=");
    const flag = equalsIndex >= 0 ? raw.slice(0, equalsIndex) : raw;

    if (FORBIDDEN_IDENTITY_FLAG.test(flag)) {
      throw new Error(
        `Security Violation: '${flag}' is forbidden. Operator identity must come exclusively from ${LOCAL_OPERATOR_ENV_KEY}, and authority must be resolved from canonical staff state.`,
      );
    }

    if (flag === "--club-id") {
      if (clubId !== undefined) {
        throw new Error("Duplicate option for '--club-id'");
      }
      const value =
        equalsIndex >= 0 ? raw.slice(equalsIndex + 1) : argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing required value for '--club-id'");
      }
      if (equalsIndex < 0) index += 1;
      clubId = value;
      continue;
    }

    if (flag === "--dry-run" || flag === "--json") {
      if (equalsIndex >= 0) {
        throw new Error(`Boolean flag '${flag}' does not accept a value`);
      }
      if (flag === "--dry-run") {
        if (dryRun) throw new Error("Duplicate option for '--dry-run'");
        dryRun = true;
      } else {
        if (jsonOutput) throw new Error("Duplicate option for '--json'");
        jsonOutput = true;
      }
      continue;
    }

    throw new Error(`Unknown or unrecognized flag '${flag}'`);
  }

  if (clubId === undefined) {
    throw new Error("Missing required option: --club-id");
  }
  assertCanonicalClubId(clubId);
  return { clubId, dryRun, jsonOutput };
}

function assertAuthorizedOperator(snapshot: {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}): void {
  if (!snapshot.exists) {
    fail("UNAUTHORIZED_OPERATOR", "Trusted operator user does not exist");
  }
  const operator = snapshot.data();
  if (operator?.status !== "Active" && operator?.status !== "ACTIVE") {
    fail("UNAUTHORIZED_OPERATOR", "Trusted operator account is not active");
  }
  if (operator.role !== "SUPERADMIN") {
    fail("UNAUTHORIZED_OPERATOR", "Trusted operator is not a SUPERADMIN");
  }
}

function failForResolution(
  resolution: ReturnType<typeof resolveProClubTechnicalAuthority>,
): never {
  if (resolution.state === "MISSING") {
    fail("AUTHORITY_MISSING", "Canonical technical authority is missing");
  }
  if (resolution.state === "AMBIGUOUS") {
    fail("AUTHORITY_AMBIGUOUS", "Canonical technical authority is ambiguous");
  }
  fail("AUTHORITY_INVALID", "Canonical technical authority input is invalid");
}

export async function executeLocalTechnicalGovernanceBootstrap(
  options: LocalTechnicalGovernanceBootstrapOptions,
  dependencies: LocalTechnicalGovernanceBootstrapDependencies,
): Promise<TechnicalGovernanceBootstrapResult> {
  const targetProjectId =
    dependencies.expectedProjectId ?? EXPECTED_PROJECT_ID;

  // These gates deliberately execute before any Firestore reference or operation.
  assertPinnedProject(dependencies.app, dependencies.firestore, targetProjectId);
  const operatorUid = resolveTrustedLocalOperatorUid(
    dependencies.env ?? process.env,
  );
  assertCanonicalClubId(options.clubId);

  return dependencies.firestore.runTransaction(async (transaction) => {
    const operatorRef = dependencies.firestore
      .collection("users")
      .doc(operatorUid);
    const operatorSnapshot = await transaction.get(operatorRef);
    assertAuthorizedOperator(operatorSnapshot);

    const clubRef = dependencies.firestore
      .collection("proClubs")
      .doc(options.clubId);
    const clubSnapshot = await transaction.get(clubRef);
    if (!clubSnapshot.exists) {
      fail("CLUB_MISSING", "Existing Pro Club does not exist");
    }
    if (
      !validateProClub(clubSnapshot.data(), {
        clubId: options.clubId,
        documentId: clubSnapshot.id,
      })
    ) {
      fail("CLUB_INVALID", "Existing Pro Club document is not canonical");
    }
    if (clubSnapshot.data()?.status !== "ACTIVE") {
      fail("CLUB_INACTIVE", "Existing Pro Club is not ACTIVE");
    }

    const staffCollection = clubRef.collection("staff");
    const staffSnapshot = await transaction.get(staffCollection);
    const candidates: ProClubTechnicalStaffCandidate[] = [];

    for (const staffDocument of staffSnapshot.docs) {
      const staffData = staffDocument.data();
      const rawStaffRole = asRecord(staffData)?.staffRole;
      if (!isTechnicalRole(rawStaffRole)) continue;

      if (
        !validateProClubStaffAssignment(staffData, {
          clubId: options.clubId,
          documentClubId: clubSnapshot.id,
          userId: staffDocument.id,
          documentId: staffDocument.id,
        })
      ) {
        fail("STAFF_INVALID", "Technical staff assignment is not canonical");
      }

      const memberRef = clubRef.collection("members").doc(staffDocument.id);
      const memberSnapshot = await transaction.get(memberRef);
      if (
        !memberSnapshot.exists ||
        !validateProClubMembership(memberSnapshot.data(), {
          clubId: options.clubId,
          documentClubId: clubSnapshot.id,
          userId: staffDocument.id,
          documentId: memberSnapshot.id,
        }) ||
        memberSnapshot.data()?.status !== "ACTIVE"
      ) {
        fail(
          "MEMBERSHIP_INVALID",
          "Technical staff candidate lacks a matching canonical ACTIVE membership",
        );
      }

      candidates.push({
        uid: staffDocument.id,
        staffRole: staffData.staffRole,
        status: staffData.status,
      });
    }

    const resolution = resolveProClubTechnicalAuthority(
      { authorityMode: "AUTO" },
      candidates,
    );
    if (resolution.state !== "FOUND") {
      failForResolution(resolution);
    }

    const expectedCurrent = buildCurrentDocument(resolution);
    const currentRef = clubRef.collection("technicalGovernance").doc("current");
    const currentSnapshot = await transaction.get(currentRef);

    if (currentSnapshot.exists) {
      const currentData = currentSnapshot.data();
      if (
        !isExactCurrentDocument(currentData) ||
        !currentDocumentsMatch(currentData, expectedCurrent)
      ) {
        fail(
          "CURRENT_CONFLICT",
          "Existing technicalGovernance/current is malformed or differs from canonical resolution",
        );
      }

      if (options.dryRun) {
        return {
          ok: true,
          dryRun: true,
          status: "DRY_RUN",
          wouldStatus: "NOOP",
          targetProjectId,
          operatorUid,
          clubId: options.clubId,
          authorityUid: resolution.authorityUid,
          authorityRole: resolution.authorityRole,
        };
      }

      return {
        ok: true,
        dryRun: false,
        status: "NOOP",
        targetProjectId,
        operatorUid,
        clubId: options.clubId,
        authorityUid: resolution.authorityUid,
        authorityRole: resolution.authorityRole,
      };
    }

    if (options.dryRun) {
      return {
        ok: true,
        dryRun: true,
        status: "DRY_RUN",
        wouldStatus: "CREATED",
        targetProjectId,
        operatorUid,
        clubId: options.clubId,
        authorityUid: resolution.authorityUid,
        authorityRole: resolution.authorityRole,
      };
    }

    transaction.create(currentRef, expectedCurrent);
    return {
      ok: true,
      dryRun: false,
      status: "CREATED",
      targetProjectId,
      operatorUid,
      clubId: options.clubId,
      authorityUid: resolution.authorityUid,
      authorityRole: resolution.authorityRole,
    };
  });
}

export async function runLocalTechnicalGovernanceBootstrapCli(
  argv: string[],
  io: {
    stdout?: (message: string) => void;
    stderr?: (message: string) => void;
  } = {},
  injectedDependencies?: Partial<LocalTechnicalGovernanceBootstrapDependencies>,
): Promise<0 | 1> {
  const out = io.stdout ?? ((message) => process.stdout.write(message));
  const err = io.stderr ?? ((message) => process.stderr.write(message));

  try {
    const options = parseTechnicalGovernanceBootstrapArgs(argv);
    let dependencies: LocalTechnicalGovernanceBootstrapDependencies;
    if (injectedDependencies?.firestore) {
      dependencies =
        injectedDependencies as LocalTechnicalGovernanceBootstrapDependencies;
    } else {
      const admin = initializeAdminServices({ projectId: EXPECTED_PROJECT_ID });
      dependencies = {
        app: admin.app,
        firestore: admin.firestore,
        ...injectedDependencies,
      };
    }

    const result = await executeLocalTechnicalGovernanceBootstrap(
      options,
      dependencies,
    );
    if (options.jsonOutput) {
      out(`${JSON.stringify(result, null, 2)}\n`);
    } else if (result.dryRun) {
      out(
        `[DRY RUN] Technical governance bootstrap passed all gates; live outcome would be ${result.wouldStatus}. No Firestore write was performed.\n`,
      );
      out(`  Project        : ${result.targetProjectId}\n`);
      out(`  Operator UID   : ${result.operatorUid}\n`);
      out(`  Club ID        : ${result.clubId}\n`);
      out(`  Authority UID  : ${result.authorityUid}\n`);
      out(`  Authority Role : ${result.authorityRole}\n`);
    } else {
      out(`[${result.status}] Technical governance bootstrap completed.\n`);
      out(`  Project        : ${result.targetProjectId}\n`);
      out(`  Operator UID   : ${result.operatorUid}\n`);
      out(`  Club ID        : ${result.clubId}\n`);
      out(`  Authority UID  : ${result.authorityUid}\n`);
      out(`  Authority Role : ${result.authorityRole}\n`);
    }
    return 0;
  } catch (error) {
    const message =
      error instanceof TechnicalGovernanceBootstrapError
        ? `[${error.code}] ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error);
    err(`ERROR: ${message}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  process.exitCode = await runLocalTechnicalGovernanceBootstrapCli(
    process.argv.slice(2),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  await main();
}
