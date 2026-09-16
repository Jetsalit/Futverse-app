#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Firestore } from "firebase-admin/firestore";
import { initializeAdminServices } from "../functions/src/lib/firebaseAdmin.ts";
import { isValidDocumentIdentifier } from "../functions/src/proClubProvisioning/core.ts";
import {
  assertPinnedProject,
  EXPECTED_PROJECT_ID,
  LOCAL_OPERATOR_ENV_KEY,
  resolveTrustedLocalOperatorUid,
} from "./lib/localTrustedOperatorVerifier.ts";

export interface MembershipDiscoveryBackfillOptions {
  uid: string;
  clubId: string;
  dryRun?: boolean;
}

export interface MembershipDiscoveryBackfillDependencies {
  app?: { options?: { projectId?: unknown } };
  firestore: Firestore;
  env?: Record<string, string | undefined>;
  expectedProjectId?: string;
}

export interface MembershipDiscoveryBackfillResult {
  ok: true;
  dryRun: boolean;
  status: "READY" | "CREATED" | "ALREADY_PRESENT";
  targetProjectId: string;
  operatorUid: string;
  uid: string;
  clubId: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isExactDiscoveryPointer(value: unknown, clubId: string): boolean {
  const record = asRecord(value);
  if (!record) return false;
  return (
    record.schemaVersion === 1 &&
    record.clubId === clubId &&
    Object.keys(record).sort().join(",") === "clubId,schemaVersion"
  );
}

function isActiveCanonicalMembership(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) return false;
  return (
    (record.authorizationRole === "OWNER" ||
      record.authorizationRole === "ADMIN" ||
      record.authorizationRole === "MEMBER") &&
    record.status === "ACTIVE" &&
    Object.keys(record).every(
      (field) => field === "authorizationRole" || field === "status",
    )
  );
}

function assertOptions(options: MembershipDiscoveryBackfillOptions): void {
  if (!isValidDocumentIdentifier(options.uid)) {
    throw new Error("Invalid Membership Discovery backfill user UID.");
  }
  if (!isValidDocumentIdentifier(options.clubId)) {
    throw new Error("Invalid Membership Discovery backfill club ID.");
  }
}

export async function executeLocalProClubMembershipDiscoveryBackfill(
  options: MembershipDiscoveryBackfillOptions,
  dependencies: MembershipDiscoveryBackfillDependencies,
): Promise<MembershipDiscoveryBackfillResult> {
  const targetProjectId =
    dependencies.expectedProjectId ?? EXPECTED_PROJECT_ID;

  // Project pinning must happen before any canonical read or write.
  assertPinnedProject(
    dependencies.app,
    dependencies.firestore,
    targetProjectId,
  );

  assertOptions(options);
  const operatorUid = resolveTrustedLocalOperatorUid(
    dependencies.env ?? process.env,
  );

  const { firestore } = dependencies;
  const userRef = firestore.collection("users").doc(options.uid);
  const clubRef = firestore.collection("proClubs").doc(options.clubId);
  const membershipRef = clubRef.collection("members").doc(options.uid);
  const pointerRef = userRef
    .collection("proClubMemberships")
    .doc(options.clubId);

  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new Error("Canonical user does not exist.");
  }
  const userStatus = userSnap.data()?.status;
  if (userStatus !== "Active" && userStatus !== "ACTIVE") {
    throw new Error("Canonical user account is not active.");
  }

  const clubSnap = await clubRef.get();
  if (!clubSnap.exists) {
    throw new Error("Canonical Pro Club does not exist.");
  }
  if (clubSnap.data()?.status !== "ACTIVE") {
    throw new Error("Canonical Pro Club is not active.");
  }

  const membershipSnap = await membershipRef.get();
  if (
    !membershipSnap.exists ||
    !isActiveCanonicalMembership(membershipSnap.data())
  ) {
    throw new Error("Canonical Pro Club membership is missing or inactive.");
  }

  const pointerSnap = await pointerRef.get();
  if (pointerSnap.exists) {
    if (!isExactDiscoveryPointer(pointerSnap.data(), options.clubId)) {
      throw new Error(
        "Membership Discovery pointer integrity violation: existing pointer is malformed or mismatched.",
      );
    }

    return {
      ok: true,
      dryRun: options.dryRun === true,
      status: "ALREADY_PRESENT",
      targetProjectId,
      operatorUid,
      uid: options.uid,
      clubId: options.clubId,
    };
  }

  if (options.dryRun === true) {
    return {
      ok: true,
      dryRun: true,
      status: "READY",
      targetProjectId,
      operatorUid,
      uid: options.uid,
      clubId: options.clubId,
    };
  }

  await pointerRef.create({
    schemaVersion: 1,
    clubId: options.clubId,
  });

  return {
    ok: true,
    dryRun: false,
    status: "CREATED",
    targetProjectId,
    operatorUid,
    uid: options.uid,
    clubId: options.clubId,
  };
}

export function parseMembershipDiscoveryBackfillArgs(
  argv: string[],
): MembershipDiscoveryBackfillOptions {
  const parsed: Partial<MembershipDiscoveryBackfillOptions> = {
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (raw === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (raw === "--help" || raw === "-h") {
      throw new Error("HELP_REQUESTED");
    }
    if (raw !== "--uid" && raw !== "--club-id") {
      throw new Error(`Unknown or forbidden argument '${raw}'.`);
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing required value for '${raw}'.`);
    }
    index += 1;

    if (raw === "--uid") parsed.uid = value;
    if (raw === "--club-id") parsed.clubId = value;
  }

  if (!parsed.uid) throw new Error("Missing required option: --uid");
  if (!parsed.clubId) throw new Error("Missing required option: --club-id");

  const result: MembershipDiscoveryBackfillOptions = {
    uid: parsed.uid,
    clubId: parsed.clubId,
    dryRun: parsed.dryRun === true,
  };
  assertOptions(result);
  return result;
}

export function printMembershipDiscoveryBackfillUsage(
  write: (message: string) => void,
): void {
  write(`FutVerse Pro Club Membership Discovery Backfill\n\nUsage:\n  node --import tsx scripts/backfillProClubMembershipDiscoveryLocal.ts --uid <uid> --club-id <clubId> [--dry-run]\n\nRequired:\n  --uid       Exact canonical user UID\n  --club-id   Exact canonical Pro Club ID\n\nOperational:\n  --dry-run   Validate canonical state without writing\n  --help      Show this help\n\nSecurity:\n  Operator identity must come from ${LOCAL_OPERATOR_ENV_KEY}.\n  This command handles exactly one explicit (uid, clubId) pair and performs no broad scan.\n`);
}

export async function runMembershipDiscoveryBackfillCli(
  argv: string[],
  io: {
    stdout?: (message: string) => void;
    stderr?: (message: string) => void;
  } = {},
): Promise<0 | 1> {
  const writeOut = io.stdout ?? ((message) => process.stdout.write(message));
  const writeErr = io.stderr ?? ((message) => process.stderr.write(message));

  try {
    const options = parseMembershipDiscoveryBackfillArgs(argv);
    const admin = initializeAdminServices({ projectId: EXPECTED_PROJECT_ID });
    const result = await executeLocalProClubMembershipDiscoveryBackfill(
      options,
      {
        app: admin.app,
        firestore: admin.firestore,
      },
    );

    writeOut(
      `${result.dryRun ? "[DRY RUN]" : "[BACKFILL]"} ${result.status} uid=${result.uid} clubId=${result.clubId}\n`,
    );
    return 0;
  } catch (error) {
    if (error instanceof Error && error.message === "HELP_REQUESTED") {
      printMembershipDiscoveryBackfillUsage(writeOut);
      return 0;
    }

    writeErr(
      `ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

async function main(): Promise<void> {
  process.exitCode = await runMembershipDiscoveryBackfillCli(
    process.argv.slice(2),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  await main();
}
