#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Firestore } from "firebase-admin/firestore";
import { initializeAdminServices } from "../functions/src/lib/firebaseAdmin.ts";
import {
  validateAndNormalizeProClubRenameRequest,
  type NormalizedProClubRenameRequestV1,
} from "../functions/src/proClubRename/core.ts";
import {
  createProClubRenameService,
  type ProClubRenameService,
} from "../functions/src/proClubRename/service.ts";
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

export interface LocalRenameOptions {
  requestJsonPath: string;
  dryRun?: boolean;
  jsonOutput?: boolean;
}

export interface LocalRenameDependencies {
  app?: { options?: { projectId?: unknown } };
  firestore: Firestore;
  service?: ProClubRenameService;
  env?: Record<string, string | undefined>;
  expectedProjectId?: string;
  trustedClock?: () => Date;
  readRequestText?: (path: string) => string;
}

export function parseLocalRenameArgs(argv: string[]): LocalRenameOptions {
  assertNoLocalOperatorCliOverride(argv);
  const valueFlags = ["--request-json", "--requestJson"] as const;
  const booleanFlags = ["--dry-run", "--dryRun", "--json"] as const;
  assertOnlyKnownFlags(argv, valueFlags, booleanFlags);
  return {
    requestJsonPath: readRequiredFlag(argv, valueFlags),
    dryRun: hasFlag(argv, ["--dry-run", "--dryRun"]),
    jsonOutput: hasFlag(argv, ["--json"]),
  };
}

function loadRenameRequest(
  path: string,
  readRequestText: (path: string) => string,
): NormalizedProClubRenameRequestV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readRequestText(path));
  } catch {
    throw new Error("Rename request file must contain valid JSON");
  }
  return validateAndNormalizeProClubRenameRequest(parsed);
}

export async function executeLocalProClubRename(
  options: LocalRenameOptions,
  dependencies: LocalRenameDependencies,
) {
  const expectedProjectId = dependencies.expectedProjectId ?? EXPECTED_PROJECT_ID;
  assertPinnedProject(dependencies.app, dependencies.firestore, expectedProjectId);
  const operatorUid = resolveTrustedLocalOperatorUid(dependencies.env ?? process.env);
  const requestBody = loadRenameRequest(
    options.requestJsonPath,
    dependencies.readRequestText ?? ((path) => readFileSync(resolve(path), "utf8")),
  );

  if (options.dryRun) {
    return {
      ok: true as const,
      dryRun: true as const,
      status: "READY_FOR_PRO_CLUB_RENAME" as const,
      targetProjectId: expectedProjectId,
      operatorUid,
      requestBody,
    };
  }

  const service = dependencies.service ?? createProClubRenameService({
    firestore: dependencies.firestore,
    authTokenVerifier: createLocalTrustedOperatorVerifier({ env: dependencies.env }),
    trustedClock: dependencies.trustedClock,
  });
  const result = await service.renameProClub({
    authorizationHeader: undefined,
    requestBody,
  });
  return { ok: true as const, dryRun: false as const, ...result };
}

export async function runLocalRenameCli(
  argv: string[],
  io: { stdout?: (message: string) => void; stderr?: (message: string) => void } = {},
  injectedDependencies?: Partial<LocalRenameDependencies>,
): Promise<0 | 1> {
  const out = io.stdout ?? ((message) => process.stdout.write(message));
  const err = io.stderr ?? ((message) => process.stderr.write(message));
  try {
    const options = parseLocalRenameArgs(argv);
    let dependencies: LocalRenameDependencies;
    if (injectedDependencies?.firestore) {
      dependencies = injectedDependencies as LocalRenameDependencies;
    } else {
      const admin = initializeAdminServices({ projectId: EXPECTED_PROJECT_ID });
      dependencies = { app: admin.app, firestore: admin.firestore, ...injectedDependencies };
    }
    const result = await executeLocalProClubRename(options, dependencies);
    if (options.jsonOutput) out(`${JSON.stringify(result, null, 2)}\n`);
    else if (result.dryRun) {
      out(`[DRY RUN] Pro Club rename request is structurally ready. No Firestore write was performed.\n`);
      out(`  Target Project : ${result.targetProjectId}\n`);
      out(`  Operator UID   : ${result.operatorUid}\n`);
      out(`  Club ID        : ${result.requestBody.clubId}\n`);
      out(`  New Name       : ${result.requestBody.newName}\n`);
    } else {
      out(`[RENAMED] Pro Club rename completed through the canonical trusted service.\n`);
      out(`  Club ID        : ${result.clubId}\n`);
      out(`  Change ID      : ${result.changeId}\n`);
      out(`  Name           : ${result.name}\n`);
      out(`  Short Name     : ${result.shortName ?? "(none)"}\n`);
      out(`  Changed At     : ${result.changedAt}\n`);
      out(`  Changed By     : ${result.changedBy}\n`);
    }
    return 0;
  } catch (error) {
    err(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = await runLocalRenameCli(process.argv.slice(2));
}
