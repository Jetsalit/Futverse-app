#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Firestore } from "firebase-admin/firestore";
import { initializeAdminServices } from "../functions/src/lib/firebaseAdmin.ts";
import {
  planProClubOwnerTechnicalDirectorDualRole,
  type ProClubOwnerMembershipCandidate,
} from "../src/lib/proClubOwnerTechnicalDirectorDualRole.ts";
import {
  assertPinnedProject,
  EXPECTED_PROJECT_ID,
  LOCAL_OPERATOR_ENV_KEY,
  resolveTrustedLocalOperatorUid,
} from "./lib/localTrustedOperatorVerifier.ts";
import {
  assertNoLocalOperatorCliOverride,
  assertOnlyKnownFlags,
  hasFlag,
  readRequiredFlag,
} from "./lib/localTrustedOperatorCli.ts";

export interface LocalOwnerTechnicalDirectorOptions {
  clubId: string;
  dryRun: boolean;
  jsonOutput: boolean;
}

export interface LocalOwnerTechnicalDirectorDependencies {
  app?: { options?: { projectId?: unknown } };
  firestore: Firestore;
  env?: Record<string, string | undefined>;
  expectedProjectId?: string;
}

export function parseOwnerTechnicalDirectorArgs(
  argv: string[],
): LocalOwnerTechnicalDirectorOptions {
  assertNoLocalOperatorCliOverride(argv);
  const valueFlags = ["--club-id"] as const;
  const booleanFlags = ["--dry-run", "--json"] as const;
  assertOnlyKnownFlags(argv, valueFlags, booleanFlags);

  return {
    clubId: readRequiredFlag(argv, valueFlags),
    dryRun: hasFlag(argv, ["--dry-run"]),
    jsonOutput: hasFlag(argv, ["--json"]),
  };
}

function assertAuthorizedOperator(snapshot: {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}): void {
  if (!snapshot.exists) {
    throw new Error("Trusted local operator user does not exist");
  }
  const operator = snapshot.data();
  if (operator?.status !== "Active" && operator?.status !== "ACTIVE") {
    throw new Error("Trusted local operator account is not ACTIVE");
  }
  if (operator.role !== "SUPERADMIN") {
    throw new Error("Trusted local operator is not SUPERADMIN");
  }
}

export async function executeLocalOwnerTechnicalDirectorAssignment(
  options: LocalOwnerTechnicalDirectorOptions,
  dependencies: LocalOwnerTechnicalDirectorDependencies,
) {
  const expectedProjectId =
    dependencies.expectedProjectId ?? EXPECTED_PROJECT_ID;

  assertPinnedProject(
    dependencies.app,
    dependencies.firestore,
    expectedProjectId,
  );

  const operatorUid = resolveTrustedLocalOperatorUid(
    dependencies.env ?? process.env,
  );

  return dependencies.firestore.runTransaction(async (transaction) => {
    const operatorRef = dependencies.firestore.collection("users").doc(operatorUid);
    const operatorSnapshot = await transaction.get(operatorRef);
    assertAuthorizedOperator(operatorSnapshot);

    const clubRef = dependencies.firestore.collection("proClubs").doc(options.clubId);
    const clubSnapshot = await transaction.get(clubRef);
    if (!clubSnapshot.exists) {
      throw new Error("Pro Club does not exist");
    }

    const membersSnapshot = await transaction.get(clubRef.collection("members"));
    const memberships: ProClubOwnerMembershipCandidate[] =
      membersSnapshot.docs.map((document) => ({
        uid: document.id,
        data: document.data(),
      }));

    const activeOwnerDocuments = memberships.filter((document) => {
      const data = document.data as Record<string, unknown> | null;
      return (
        data &&
        data.authorizationRole === "OWNER" &&
        data.status === "ACTIVE"
      );
    });

    if (activeOwnerDocuments.length !== 1) {
      throw new Error(
        `OWNER_TECHNICAL_DIRECTOR_DUAL_ROLE_BLOCKED: exactly one ACTIVE OWNER is required; found ${activeOwnerDocuments.length}`,
      );
    }

    const ownerUid = activeOwnerDocuments[0].uid;
    const ownerUserRef = dependencies.firestore.collection("users").doc(ownerUid);
    const ownerUserSnapshot = await transaction.get(ownerUserRef);
    if (!ownerUserSnapshot.exists) {
      throw new Error("OWNER user document does not exist");
    }

    const staffRef = clubRef.collection("staff").doc(ownerUid);
    const staffSnapshot = await transaction.get(staffRef);

    const plan = planProClubOwnerTechnicalDirectorDualRole({
      clubId: options.clubId,
      club: clubSnapshot.data(),
      memberships,
      ownerUser: ownerUserSnapshot.data(),
      existingStaffAssignment: staffSnapshot.exists
        ? staffSnapshot.data()
        : null,
    });

    if (options.dryRun) {
      return {
        ok: true as const,
        dryRun: true as const,
        status: "DRY_RUN" as const,
        wouldAction: plan.action,
        targetProjectId: expectedProjectId,
        operatorUid,
        clubId: options.clubId,
        ownerUid: plan.ownerUid,
        membershipAuthorizationRole: plan.membershipAuthorizationRole,
        staffRole: plan.staffRole,
        staffStatus: plan.staffStatus,
      };
    }

    if (plan.action === "CREATE") {
      transaction.create(staffRef, {
        staffRole: "TECHNICAL_DIRECTOR",
        status: "ACTIVE",
      });
    }

    return {
      ok: true as const,
      dryRun: false as const,
      status: plan.action === "CREATE" ? "CREATED" as const : "NOOP" as const,
      targetProjectId: expectedProjectId,
      operatorUid,
      clubId: options.clubId,
      ownerUid: plan.ownerUid,
      membershipAuthorizationRole: plan.membershipAuthorizationRole,
      staffRole: plan.staffRole,
      staffStatus: plan.staffStatus,
    };
  });
}

export async function runOwnerTechnicalDirectorCli(
  argv: string[],
  io: {
    stdout?: (message: string) => void;
    stderr?: (message: string) => void;
  } = {},
  injectedDependencies?: Partial<LocalOwnerTechnicalDirectorDependencies>,
): Promise<0 | 1> {
  const out = io.stdout ?? ((message) => process.stdout.write(message));
  const err = io.stderr ?? ((message) => process.stderr.write(message));

  try {
    const options = parseOwnerTechnicalDirectorArgs(argv);
    let dependencies: LocalOwnerTechnicalDirectorDependencies;

    if (injectedDependencies?.firestore) {
      dependencies =
        injectedDependencies as LocalOwnerTechnicalDirectorDependencies;
    } else {
      const admin = initializeAdminServices({ projectId: EXPECTED_PROJECT_ID });
      dependencies = {
        app: admin.app,
        firestore: admin.firestore,
        ...injectedDependencies,
      };
    }

    const result = await executeLocalOwnerTechnicalDirectorAssignment(
      options,
      dependencies,
    );

    if (options.jsonOutput) {
      out(`${JSON.stringify(result, null, 2)}\n`);
    } else if (result.dryRun) {
      out(
        `[DRY RUN] OWNER + TECHNICAL_DIRECTOR dual-role gate passed. Live action would be ${result.wouldAction}. No Firestore write was performed.\n`,
      );
      out(`  Project      : ${result.targetProjectId}\n`);
      out(`  Club ID      : ${result.clubId}\n`);
      out(`  Owner UID    : ${result.ownerUid}\n`);
      out(`  Membership   : ${result.membershipAuthorizationRole}\n`);
      out(`  Staff role   : ${result.staffRole}\n`);
    } else {
      out(`[${result.status}] OWNER + TECHNICAL_DIRECTOR dual-role assignment completed.\n`);
      out(`  Project      : ${result.targetProjectId}\n`);
      out(`  Club ID      : ${result.clubId}\n`);
      out(`  Owner UID    : ${result.ownerUid}\n`);
      out(`  Membership   : ${result.membershipAuthorizationRole}\n`);
      out(`  Staff role   : ${result.staffRole}\n`);
    }

    return 0;
  } catch (error) {
    err(
      `ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

async function main(): Promise<void> {
  process.exitCode = await runOwnerTechnicalDirectorCli(
    process.argv.slice(2),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  await main();
}
