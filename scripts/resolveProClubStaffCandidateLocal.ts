#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { initializeAdminServices } from "../functions/src/lib/firebaseAdmin.ts";
import {
  createFirestoreRateLimiter,
  type ProClubStaffResolutionRateLimiter,
} from "../functions/src/proClubStaffCandidateResolution/rateLimiter.ts";
import {
  createProClubStaffCandidateResolutionService,
  type ProClubStaffCandidateResolutionService,
} from "../functions/src/proClubStaffCandidateResolution/service.ts";
import {
  assertPinnedProject,
  EXPECTED_PROJECT_ID,
  resolveTrustedLocalOperatorUid,
} from "./lib/localTrustedOperatorVerifier.ts";
import {
  assertNoLocalOperatorCliOverride,
  assertOnlyKnownFlags,
  hasFlag,
  readRequiredFlag,
} from "./lib/localTrustedOperatorCli.ts";

export interface LocalStaffCandidateOptions {
  clubId: string;
  email: string;
  dryRun?: boolean;
  jsonOutput?: boolean;
}

export interface LocalStaffCandidateDependencies {
  app?: { options?: { projectId?: unknown } };
  firestore: Firestore;
  auth: Auth;
  rateLimiter?: ProClubStaffResolutionRateLimiter;
  service?: ProClubStaffCandidateResolutionService;
  env?: Record<string, string | undefined>;
  expectedProjectId?: string;
  now?: Date;
}

export function parseLocalStaffCandidateArgs(argv: string[]): LocalStaffCandidateOptions {
  assertNoLocalOperatorCliOverride(argv);
  const valueFlags = ["--club-id", "--clubId", "--email"] as const;
  const booleanFlags = ["--dry-run", "--dryRun", "--json"] as const;
  assertOnlyKnownFlags(argv, valueFlags, booleanFlags);
  return {
    clubId: readRequiredFlag(argv, ["--club-id", "--clubId"]),
    email: readRequiredFlag(argv, ["--email"]),
    dryRun: hasFlag(argv, ["--dry-run", "--dryRun"]),
    jsonOutput: hasFlag(argv, ["--json"]),
  };
}

export async function executeLocalStaffCandidateResolution(
  options: LocalStaffCandidateOptions,
  dependencies: LocalStaffCandidateDependencies,
) {
  const expectedProjectId = dependencies.expectedProjectId ?? EXPECTED_PROJECT_ID;
  assertPinnedProject(dependencies.app, dependencies.firestore, expectedProjectId);
  const requesterUid = resolveTrustedLocalOperatorUid(dependencies.env ?? process.env);
  const email = options.email.trim().toLowerCase();
  if (!options.clubId || options.clubId.trim() !== options.clubId || options.clubId.includes("/")) {
    throw new Error("clubId must be a canonical document identifier");
  }
  if (!email || !email.includes("@")) throw new Error("email must be valid");

  if (options.dryRun) {
    return {
      ok: true as const,
      dryRun: true as const,
      status: "READY_FOR_STAFF_CANDIDATE_RESOLUTION" as const,
      targetProjectId: expectedProjectId,
      requesterUid,
      clubId: options.clubId,
      email,
    };
  }

  const rateLimiter = dependencies.rateLimiter ?? createFirestoreRateLimiter(dependencies.firestore);
  const service = dependencies.service ?? createProClubStaffCandidateResolutionService({
    firestore: dependencies.firestore,
    auth: dependencies.auth,
    rateLimiter,
  });
  const result = await service.resolveCandidate({
    requesterUid,
    requestBody: { clubId: options.clubId, email },
    now: dependencies.now,
  });
  return { ok: true as const, dryRun: false as const, ...result };
}

export async function runLocalStaffCandidateCli(
  argv: string[],
  io: { stdout?: (message: string) => void; stderr?: (message: string) => void } = {},
  injectedDependencies?: Partial<LocalStaffCandidateDependencies>,
): Promise<0 | 1> {
  const out = io.stdout ?? ((message) => process.stdout.write(message));
  const err = io.stderr ?? ((message) => process.stderr.write(message));
  try {
    const options = parseLocalStaffCandidateArgs(argv);
    let dependencies: LocalStaffCandidateDependencies;
    if (injectedDependencies?.firestore && injectedDependencies.auth) {
      dependencies = injectedDependencies as LocalStaffCandidateDependencies;
    } else {
      const admin = initializeAdminServices({ projectId: EXPECTED_PROJECT_ID });
      dependencies = { app: admin.app, firestore: admin.firestore, auth: admin.auth, ...injectedDependencies };
    }
    const result = await executeLocalStaffCandidateResolution(options, dependencies);
    if (options.jsonOutput) out(`${JSON.stringify(result, null, 2)}\n`);
    else if (result.dryRun) {
      out(`[DRY RUN] Staff candidate resolution configuration is ready.\n`);
      out(`  Target Project : ${result.targetProjectId}\n`);
      out(`  Requester UID  : ${result.requesterUid}\n`);
      out(`  Club ID        : ${result.clubId}\n`);
      out(`  Email          : ${result.email}\n`);
    } else {
      out(`[RESOLVED] Staff candidate account verified.\n`);
      out(`  Target UID     : ${result.targetUid}\n`);
      out(`  Email          : ${result.email}\n`);
      out(`  Display Name   : ${result.displayName ?? "(none)"}\n`);
    }
    return 0;
  } catch (error) {
    err(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = await runLocalStaffCandidateCli(process.argv.slice(2));
}
