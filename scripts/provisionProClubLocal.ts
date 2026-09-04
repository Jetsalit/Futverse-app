#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Firestore } from "firebase-admin/firestore";
import {
  ERROR_CODES,
  ProClubProvisioningError,
  type ProClubLevel,
} from "../functions/src/proClubProvisioning/core.ts";
import {
  createProClubProvisioningService,
  type ProClubProvisioningService,
  type ProvisionProClubResult,
} from "../functions/src/proClubProvisioning/service.ts";
import { initializeAdminServices } from "../functions/src/lib/firebaseAdmin.ts";
import type { ServerAuthTokenVerifier } from "../functions/src/lib/serverAuthTokenVerifier.ts";
import {
  assertPinnedProject,
  createLocalTrustedOperatorVerifier,
  EXPECTED_PROJECT_ID,
  LOCAL_OPERATOR_ENV_KEY,
  resolveTrustedLocalOperatorUid,
} from "./lib/localTrustedOperatorVerifier.ts";

export interface LocalProvisioningCliOptions {
  provisioningId: string;
  clubId: string;
  name: string;
  shortName?: string | null;
  level: ProClubLevel;
  country?: string | null;
  logoUrl?: string | null;
  initialOwnerUid: string;
  dryRun?: boolean;
  jsonOutput?: boolean;
}

export interface LocalProvisioningDependencies {
  app?: { options?: { projectId?: unknown } };
  firestore: Firestore;
  authTokenVerifier?: ServerAuthTokenVerifier;
  service?: ProClubProvisioningService;
  env?: Record<string, string | undefined>;
  trustedClock?: () => Date;
  expectedProjectId?: string;
}

export interface LocalProvisioningLiveResult {
  ok: true;
  dryRun: false;
  status: "COMPLETED";
  provisioningId: string;
  clubId: string;
  ownerUid: string;
  requestingSuperAdminUid: string;
  isReplay: boolean;
  createdAt: string;
}

export interface LocalProvisioningDryRunResult {
  ok: true;
  dryRun: true;
  status: "READY_FOR_PROVISIONING";
  targetProjectId: string;
  operatorUid: string;
  requestPayload: {
    provisioningId: string;
    clubId: string;
    name: string;
    shortName: string | null;
    level: ProClubLevel;
    country: string | null;
    logoUrl: string | null;
    initialOwnerUid: string;
  };
}

export type LocalProvisioningExecutionResult =
  | LocalProvisioningLiveResult
  | LocalProvisioningDryRunResult;

const FORBIDDEN_ARGUMENT_REGEX =
  /^--(?:requester|operator|superadmin|admin|caller)(?:[-_]?(?:uid))?$/i;

/**
 * Parses and strictly validates CLI arguments for local Pro Club provisioning.
 * Rejects any requester/operator UID override flags, unknown options, or positional arguments.
 */
export function parseProvisioningCliArgs(argv: string[]): LocalProvisioningCliOptions {
  // First pass: check for forbidden argument injection
  for (const arg of argv) {
    const flag = arg.split("=")[0];
    if (FORBIDDEN_ARGUMENT_REGEX.test(flag)) {
      throw new Error(
        `Security Violation: Specifying requester or operator UID via CLI arguments ('${flag}') is strictly forbidden. Operator identity must come exclusively from ${LOCAL_OPERATOR_ENV_KEY}.`,
      );
    }
  }

  const parsed: Partial<LocalProvisioningCliOptions> = {
    dryRun: false,
    jsonOutput: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (raw === "--help" || raw === "-h") {
      throw new Error("HELP_REQUESTED");
    }

    let key: string;
    let value: string | undefined;

    if (raw.startsWith("--")) {
      const eqIdx = raw.indexOf("=");
      if (eqIdx !== -1) {
        key = raw.slice(0, eqIdx);
        value = raw.slice(eqIdx + 1);
      } else {
        key = raw;
        if (key === "--dry-run" || key === "--dryRun" || key === "--json") {
          value = undefined;
        } else {
          i++;
          if (i >= argv.length || argv[i].startsWith("--")) {
            throw new Error(`Missing required value for flag '${key}'`);
          }
          value = argv[i];
        }
      }
    } else {
      throw new Error(`Unexpected positional argument '${raw}'. All options must use explicit flags.`);
    }

    switch (key) {
      case "--provisioning-id":
      case "--provisioningId":
        parsed.provisioningId = value;
        break;
      case "--club-id":
      case "--clubId":
        parsed.clubId = value;
        break;
      case "--name":
        parsed.name = value;
        break;
      case "--short-name":
      case "--shortName":
        parsed.shortName = value;
        break;
      case "--level":
        if (value !== "T1" && value !== "T2" && value !== "T3") {
          throw new ProClubProvisioningError(
            ERROR_CODES.INVALID_PROVISIONING_REQUEST,
            `level must be strictly 'T1' | 'T2' | 'T3' (got '${value}')`,
          );
        }
        parsed.level = value as ProClubLevel;
        break;
      case "--country":
        parsed.country = value;
        break;
      case "--logo-url":
      case "--logoUrl":
        parsed.logoUrl = value;
        break;
      case "--initial-owner-uid":
      case "--initialOwnerUid":
        parsed.initialOwnerUid = value;
        break;
      case "--dry-run":
      case "--dryRun":
        parsed.dryRun = true;
        break;
      case "--json":
        parsed.jsonOutput = true;
        break;
      default:
        throw new Error(`Unknown or unrecognized flag '${key}'`);
    }
  }

  // Required field checks
  if (!parsed.provisioningId || parsed.provisioningId.trim().length === 0) {
    throw new ProClubProvisioningError(
      ERROR_CODES.INVALID_PROVISIONING_REQUEST,
      "Missing required option: --provisioning-id",
    );
  }
  if (!parsed.clubId || parsed.clubId.trim().length === 0) {
    throw new ProClubProvisioningError(
      ERROR_CODES.INVALID_PROVISIONING_REQUEST,
      "Missing required option: --club-id",
    );
  }
  if (!parsed.name || parsed.name.trim().length === 0) {
    throw new ProClubProvisioningError(
      ERROR_CODES.INVALID_PROVISIONING_REQUEST,
      "Missing required option: --name",
    );
  }
  if (!parsed.level) {
    throw new ProClubProvisioningError(
      ERROR_CODES.INVALID_PROVISIONING_REQUEST,
      "Missing required option: --level",
    );
  }
  if (!parsed.initialOwnerUid || parsed.initialOwnerUid.trim().length === 0) {
    throw new ProClubProvisioningError(
      ERROR_CODES.INVALID_PROVISIONING_REQUEST,
      "Missing required option: --initial-owner-uid",
    );
  }

  return {
    provisioningId: parsed.provisioningId,
    clubId: parsed.clubId,
    name: parsed.name,
    shortName: parsed.shortName,
    level: parsed.level,
    country: parsed.country,
    logoUrl: parsed.logoUrl,
    initialOwnerUid: parsed.initialOwnerUid,
    dryRun: parsed.dryRun ?? false,
    jsonOutput: parsed.jsonOutput ?? false,
  };
}

/**
 * Executes local Pro Club provisioning using the existing production service.
 * Enforces fail-closed project pinning and binds the requesting SuperAdmin
 * identity strictly to FUTVERSE_LOCAL_OPERATOR_UID via the local operator verifier.
 */
export async function executeLocalProClubProvisioning(
  options: LocalProvisioningCliOptions,
  dependencies: LocalProvisioningDependencies,
): Promise<LocalProvisioningExecutionResult> {
  const targetProject = dependencies.expectedProjectId ?? EXPECTED_PROJECT_ID;

  // 1. Fail-closed project pinning assertion before any database calls
  assertPinnedProject(dependencies.app, dependencies.firestore, targetProject);

  // 2. Resolve trusted local operator UID from environment
  const operatorUid = resolveTrustedLocalOperatorUid(dependencies.env ?? process.env);

  // 3. Prepare payload strictly adhering to pure core schema (no caller-supplied requesterUid)
  const requestPayload = {
    provisioningId: options.provisioningId,
    clubId: options.clubId,
    name: options.name,
    shortName: options.shortName ?? null,
    level: options.level,
    country: options.country ?? null,
    logoUrl: options.logoUrl ?? null,
    initialOwnerUid: options.initialOwnerUid,
  };

  // 4. Dry-run early exit
  if (options.dryRun) {
    return {
      ok: true,
      dryRun: true as const,
      status: "READY_FOR_PROVISIONING",
      targetProjectId: targetProject,
      operatorUid,
      requestPayload,
    };
  }

  // 5. Instantiate or use injected provisioning service with local operator verifier
  const verifier =
    dependencies.authTokenVerifier ??
    createLocalTrustedOperatorVerifier({ env: dependencies.env });

  const service =
    dependencies.service ??
    createProClubProvisioningService({
      firestore: dependencies.firestore,
      authTokenVerifier: verifier,
      trustedClock: dependencies.trustedClock,
    });

  const result = await service.provisionProClub({
    authorizationHeader: undefined,
    requestBody: requestPayload,
  });

  return {
    ok: true,
    dryRun: false as const,
    ...result,
  };
}

export function printUsage(write: (msg: string) => void): void {
  write(`Futverse Pro Club Local Trusted Admin Provisioning CLI

Usage:
  npm run provision:pro-club:local -- \\
    --provisioning-id <id> \\
    --club-id <id> \\
    --name "<name>" \\
    --level <T1|T2|T3> \\
    --initial-owner-uid <uid> [options]

Required Options:
  --provisioning-id     Unique idempotency document identifier
  --club-id             Canonical Pro Club identifier
  --name                Display name of the club
  --level               Club competition tier: 'T1' | 'T2' | 'T3'
  --initial-owner-uid   Target user UID who will receive ACTIVE OWNER membership

Optional Business Fields:
  --short-name          Abbreviated club display name
  --country             ISO 3166-1 alpha-2 country code
  --logo-url            HTTPS URL for club logo

Operational Flags:
  --dry-run             Validate configuration and schema without performing database writes
  --json                Output clean JSON format
  --help, -h            Show this help text

Security Notice:
  The operator identity is NEVER passed as a CLI argument or request body.
  It MUST be configured in the local shell environment via:
    export ${LOCAL_OPERATOR_ENV_KEY}="<superadmin-uid>"
`);
}

/**
 * Entry point for CLI invocation.
 */
export async function runLocalProvisioningCli(
  argv: string[],
  io: {
    stdout?: (msg: string) => void;
    stderr?: (msg: string) => void;
  } = {},
  injectedDependencies?: Partial<LocalProvisioningDependencies>,
): Promise<0 | 1> {
  const writeOut = io.stdout ?? ((msg) => process.stdout.write(msg));
  const writeErr = io.stderr ?? ((msg) => process.stderr.write(msg));

  try {
    const options = parseProvisioningCliArgs(argv);

    let dependencies: LocalProvisioningDependencies;
    if (injectedDependencies && injectedDependencies.firestore) {
      dependencies = injectedDependencies as LocalProvisioningDependencies;
    } else {
      const admin = initializeAdminServices({
        projectId: EXPECTED_PROJECT_ID,
      });
      dependencies = {
        app: admin.app,
        firestore: admin.firestore,
        ...injectedDependencies,
      };
    }

    const result = await executeLocalProClubProvisioning(options, dependencies);

    if (options.jsonOutput) {
      writeOut(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      if (result.dryRun === true) {
        writeOut(`[DRY RUN] Provisioning check passed successfully.\n`);
        writeOut(`  Target Project : ${result.targetProjectId}\n`);
        writeOut(`  Operator UID   : ${result.operatorUid}\n`);
        writeOut(`  Club ID        : ${result.requestPayload.clubId}\n`);
        writeOut(`  Initial Owner  : ${result.requestPayload.initialOwnerUid}\n`);
      } else {
        writeOut(`[PROVISIONED] Pro Club successfully provisioned.\n`);
        writeOut(`  Status         : ${result.status}\n`);
        writeOut(`  Provisioning ID: ${result.provisioningId}\n`);
        writeOut(`  Club ID        : ${result.clubId}\n`);
        writeOut(`  Owner UID      : ${result.ownerUid}\n`);
        writeOut(`  SuperAdmin UID : ${result.requestingSuperAdminUid}\n`);
        writeOut(`  Replay         : ${result.isReplay}\n`);
        writeOut(`  Created At     : ${result.createdAt}\n`);
      }
    }
    return 0;
  } catch (error) {
    if (error instanceof Error && error.message === "HELP_REQUESTED") {
      printUsage(writeOut);
      return 0;
    }

    const errorMessage =
      error instanceof ProClubProvisioningError
        ? `[${error.code}] ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error);

    writeErr(`ERROR: ${errorMessage}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  process.exitCode = await runLocalProvisioningCli(process.argv.slice(2));
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  await main();
}
