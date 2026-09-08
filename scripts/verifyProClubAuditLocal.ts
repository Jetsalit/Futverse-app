#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Firestore } from "firebase-admin/firestore";
import { initializeAdminServices } from "../functions/src/lib/firebaseAdmin.ts";
import {
  createProClubProvisioningAuditVerificationService,
  type ProClubProvisioningAuditVerificationService,
} from "../functions/src/proClubProvisioningAuditVerification/service.ts";
import {
  assertPinnedProject,
  createLocalTrustedOperatorVerifier,
  EXPECTED_PROJECT_ID,
  resolveTrustedLocalOperatorUid,
} from "./lib/localTrustedOperatorVerifier.ts";
import {
  assertNoLocalOperatorCliOverride,
  assertOnlyKnownFlags,
  hasFlag,
  readRequiredFlag,
} from "./lib/localTrustedOperatorCli.ts";

export interface LocalAuditVerificationOptions {
  provisioningId: string;
  jsonOutput?: boolean;
}

export interface LocalAuditVerificationDependencies {
  app?: { options?: { projectId?: unknown } };
  firestore: Firestore;
  service?: ProClubProvisioningAuditVerificationService;
  env?: Record<string, string | undefined>;
  expectedProjectId?: string;
}

export function parseLocalAuditVerificationArgs(argv: string[]): LocalAuditVerificationOptions {
  assertNoLocalOperatorCliOverride(argv);
  const valueFlags = ["--provisioning-id", "--provisioningId"] as const;
  const booleanFlags = ["--json"] as const;
  assertOnlyKnownFlags(argv, valueFlags, booleanFlags);
  return {
    provisioningId: readRequiredFlag(argv, valueFlags),
    jsonOutput: hasFlag(argv, booleanFlags),
  };
}

export async function executeLocalAuditVerification(
  options: LocalAuditVerificationOptions,
  dependencies: LocalAuditVerificationDependencies,
) {
  const expectedProjectId = dependencies.expectedProjectId ?? EXPECTED_PROJECT_ID;
  assertPinnedProject(dependencies.app, dependencies.firestore, expectedProjectId);
  resolveTrustedLocalOperatorUid(dependencies.env ?? process.env);

  const service = dependencies.service ?? createProClubProvisioningAuditVerificationService({
    firestore: dependencies.firestore,
    authTokenVerifier: createLocalTrustedOperatorVerifier({ env: dependencies.env }),
  });

  return service.verifyAudit({
    authorizationHeader: undefined,
    requestBody: { provisioningId: options.provisioningId },
  });
}

export async function runLocalAuditVerificationCli(
  argv: string[],
  io: { stdout?: (message: string) => void; stderr?: (message: string) => void } = {},
  injectedDependencies?: Partial<LocalAuditVerificationDependencies>,
): Promise<0 | 1> {
  const out = io.stdout ?? ((message) => process.stdout.write(message));
  const err = io.stderr ?? ((message) => process.stderr.write(message));
  try {
    const options = parseLocalAuditVerificationArgs(argv);
    let dependencies: LocalAuditVerificationDependencies;
    if (injectedDependencies?.firestore) {
      dependencies = injectedDependencies as LocalAuditVerificationDependencies;
    } else {
      const admin = initializeAdminServices({ projectId: EXPECTED_PROJECT_ID });
      dependencies = { app: admin.app, firestore: admin.firestore, ...injectedDependencies };
    }
    const result = await executeLocalAuditVerification(options, dependencies);
    if (options.jsonOutput) out(`${JSON.stringify(result, null, 2)}\n`);
    else {
      out(`[VERIFIED] Pro Club provisioning audit is canonical.\n`);
      out(`  Provisioning ID: ${result.provisioningId}\n`);
      out(`  Club ID        : ${result.clubId}\n`);
      out(`  Owner UID      : ${result.ownerUid}\n`);
      out(`  Created At     : ${result.createdAt}\n`);
    }
    return 0;
  } catch (error) {
    err(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = await runLocalAuditVerificationCli(process.argv.slice(2));
}
