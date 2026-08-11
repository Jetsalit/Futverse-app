#!/usr/bin/env node
import {
  accessSync,
  constants,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  collectMembershipPlanningExport,
  MembershipExportSafetyError,
  type MembershipExportReadSource,
} from "./membershipExportReadOnlyCore";
import {
  createFirestoreMembershipReadSource,
  type InMemoryServiceAccountCredential,
} from "./firestoreMembershipReadSource";
import {
  isExactFirestoreIdentifier,
  parseOfflineExport,
  sha256Text,
} from "./membershipBackfillDryRunCore";

export const READ_ONLY_CONFIRMATION = "I_HAVE_VERIFIED_DATASTORE_VIEWER_ONLY";
export const EXPORTER_VERSION = "1.0.0";
export const EXPORT_ARTIFACT_NAMES = [
  "membership-planning-export.json",
  "membership-planning-export.sha256",
  "export-manifest.json",
  "README-SENSITIVE.txt",
] as const;

export interface MembershipExportArguments {
  projectId: string;
  databaseId: string;
  credentialsPath: string;
  outputDirectory: string;
  confirmation: string;
}

export interface ValidatedServiceAccountCredential extends InMemoryServiceAccountCredential {
  clientEmail: string;
}

export interface ExportManifest {
  sensitive: true;
  notice: string;
  generatedAt: string;
  completedAt: string;
  projectId: string;
  databaseId: string;
  serviceAccountEmail: string;
  sourceCommit: string;
  exporterVersion: string;
  counts: {
    academies: number;
    users: number;
    memberships: number;
    academyInvites: number;
  };
  queriedPaths: string[];
  exportSha256: string;
  transactionalSnapshot: false;
  writeCapabilityUsed: false;
  productionWritesPerformed: false;
}

export type ExportSourceFactory = (
  projectId: string,
  databaseId: string,
  credential: InMemoryServiceAccountCredential,
) => MembershipExportReadSource | Promise<MembershipExportReadSource>;

export interface ExportExecutionDependencies {
  createSource?: ExportSourceFactory;
  now?: () => string;
  sourceCommit?: () => string;
  writeArtifact?: (path: string, data: string | Uint8Array) => void;
  beforePublish?: (outputDirectory: string) => void;
  publishDirectory?: (temporaryDirectory: string, outputDirectory: string) => void;
}

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SENSITIVE_NOTICE = "SENSITIVE MEMBERSHIP PLANNING EXPORT: contains operational identity and tenant data.";
const README_SENSITIVE = `SENSITIVE MEMBERSHIP PLANNING EXPORT

This directory contains operational identity and Academy membership data.
Keep it outside Git, restrict access, and encrypt it at rest and in transit.
The snapshot is non-transactional and may contain records read at different times.
It is planning input only. It does not authorize writes, migration, or backfill.
Review every ADMIN proposal manually and re-export immediately before any separately authorized write.
Keep a separate Firestore backup and obtain separate execution and rollback authorization.
`;

function lstatIfExists(path: string): ReturnType<typeof lstatSync> | null {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function comparablePath(path: string): string {
  const absolutePath = resolve(path);
  return process.platform === "win32" ? absolutePath.toLowerCase() : absolutePath;
}

function pathIsInsideOrEqual(parentPath: string, candidatePath: string): boolean {
  const parent = comparablePath(parentPath);
  const candidate = comparablePath(candidatePath);
  const difference = relative(parent, candidate);
  return difference === ""
    || (difference !== ".." && !difference.startsWith(`..${sep}`) && !isAbsolute(difference));
}

function requireAbsolutePath(path: string, label: string): void {
  if (!isAbsolute(path)) throw new MembershipExportSafetyError(`${label} must be an absolute path.`);
}

function requireExactOptionValue(value: string, label: string): void {
  if (!isExactFirestoreIdentifier(value)) {
    throw new MembershipExportSafetyError(`${label} must be an exact non-empty Firestore identifier.`);
  }
}

export function parseArguments(argv: string[]): MembershipExportArguments {
  const expected = new Set([
    "--project-id",
    "--database-id",
    "--credentials",
    "--output",
    "--confirm-read-only",
  ]);
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!expected.has(option)) throw new MembershipExportSafetyError(`Unknown argument: ${option}`);
    if (values.has(option)) throw new MembershipExportSafetyError(`Duplicate argument: ${option}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new MembershipExportSafetyError(`Argument ${option} requires a value.`);
    }
    values.set(option, value);
    index += 1;
  }
  for (const option of expected) {
    if (!values.has(option)) throw new MembershipExportSafetyError(`Missing required argument: ${option}`);
  }

  const result: MembershipExportArguments = {
    projectId: values.get("--project-id")!,
    databaseId: values.get("--database-id")!,
    credentialsPath: values.get("--credentials")!,
    outputDirectory: values.get("--output")!,
    confirmation: values.get("--confirm-read-only")!,
  };
  requireExactOptionValue(result.projectId, "project-id");
  requireExactOptionValue(result.databaseId, "database-id");
  requireAbsolutePath(result.credentialsPath, "credentials");
  requireAbsolutePath(result.outputDirectory, "output");
  if (result.confirmation !== READ_ONLY_CONFIRMATION) {
    throw new MembershipExportSafetyError("The exact read-only confirmation phrase is required.");
  }
  return result;
}

function validateOutsideRepository(path: string, repositoryRoot: string, label: string): void {
  if (pathIsInsideOrEqual(repositoryRoot, path)) {
    throw new MembershipExportSafetyError(`${label} must be outside the repository.`);
  }
}

export function validateCredentialFile(
  credentialPath: string,
  projectId: string,
  repositoryRoot = REPOSITORY_ROOT,
): ValidatedServiceAccountCredential {
  requireAbsolutePath(credentialPath, "credentials");
  const repositoryRealPath = realpathSync(repositoryRoot);
  const status = lstatIfExists(credentialPath);
  if (!status) throw new MembershipExportSafetyError("Credential file does not exist.");
  if (status.isSymbolicLink()) throw new MembershipExportSafetyError("Credential file must not be a symbolic link or junction.");
  if (!status.isFile()) throw new MembershipExportSafetyError("Credential path must be a regular file.");
  const credentialRealPath = realpathSync(credentialPath);
  if (comparablePath(credentialRealPath) !== comparablePath(credentialPath)) {
    throw new MembershipExportSafetyError("Credential path must not resolve through a symbolic link or junction.");
  }
  validateOutsideRepository(credentialRealPath, repositoryRealPath, "Credential file");

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(credentialRealPath, "utf8"));
  } catch {
    throw new MembershipExportSafetyError("Credential file is not valid JSON.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new MembershipExportSafetyError("Credential JSON must be an object.");
  }
  const record = parsed as Record<string, unknown>;
  if (record.type !== "service_account") {
    throw new MembershipExportSafetyError("Credential type must be service_account.");
  }
  if (record.project_id !== projectId) {
    throw new MembershipExportSafetyError("Credential project does not match --project-id.");
  }
  if (typeof record.client_email !== "string"
    || !/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?@/.test(record.client_email)
    || !record.client_email.endsWith(`@${projectId}.iam.gserviceaccount.com`)) {
    throw new MembershipExportSafetyError("Credential client email is not a service account for --project-id.");
  }
  if (typeof record.private_key !== "string" || record.private_key.length === 0) {
    throw new MembershipExportSafetyError("Credential private key is missing.");
  }
  return {
    projectId,
    clientEmail: record.client_email,
    privateKey: record.private_key,
  };
}

export function validateOutputDirectory(
  outputDirectory: string,
  repositoryRoot = REPOSITORY_ROOT,
): void {
  requireAbsolutePath(outputDirectory, "output");
  if (lstatIfExists(outputDirectory)) {
    throw new MembershipExportSafetyError("Output directory already exists and will not be overwritten.");
  }
  const parent = dirname(outputDirectory);
  const status = lstatIfExists(parent);
  if (!status) {
    throw new MembershipExportSafetyError("Output parent must be an existing normal directory.");
  }
  if (status.isSymbolicLink()) {
    throw new MembershipExportSafetyError("Output parent must not be a symbolic link or junction.");
  }
  if (!status.isDirectory()) {
    throw new MembershipExportSafetyError("Output parent must be an existing normal directory.");
  }
  const parentRealPath = realpathSync(parent);
  if (comparablePath(parentRealPath) !== comparablePath(parent)) {
    throw new MembershipExportSafetyError("Output parent must not resolve through a symbolic link or junction.");
  }
  accessSync(parentRealPath, constants.W_OK);
  validateOutsideRepository(join(parentRealPath, basename(outputDirectory)), realpathSync(repositoryRoot), "Output directory");
}

function defaultSourceCommit(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

function writeDefault(path: string, data: string | Uint8Array): void {
  writeFileSync(path, data);
}

function verifyTemporaryArtifacts(directory: string, expectedHash: string): void {
  const actualNames = readdirSync(directory).sort();
  const expectedNames = [...EXPORT_ARTIFACT_NAMES].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new MembershipExportSafetyError("Temporary output must contain exactly four required artifacts.");
  }
  for (const name of EXPORT_ARTIFACT_NAMES) {
    const status = lstatSync(join(directory, name));
    if (status.isSymbolicLink() || !status.isFile()) {
      throw new MembershipExportSafetyError(`Output artifact ${name} must be a regular file.`);
    }
  }
  const exportBytes = readFileSync(join(directory, "membership-planning-export.json"));
  parseOfflineExport(exportBytes.toString("utf8"));
  JSON.parse(readFileSync(join(directory, "export-manifest.json"), "utf8"));
  const actualHash = sha256Text(exportBytes);
  if (actualHash !== expectedHash) {
    throw new MembershipExportSafetyError("Export SHA-256 verification failed.");
  }
  const hashFile = readFileSync(join(directory, "membership-planning-export.sha256"), "utf8");
  if (hashFile !== `${expectedHash}  membership-planning-export.json\n`) {
    throw new MembershipExportSafetyError("SHA-256 artifact does not match the exact export bytes.");
  }
}

export async function executeReadOnlyExport(
  options: MembershipExportArguments,
  dependencies: ExportExecutionDependencies = {},
): Promise<ExportManifest> {
  requireExactOptionValue(options.projectId, "project-id");
  requireExactOptionValue(options.databaseId, "database-id");
  requireAbsolutePath(options.credentialsPath, "credentials");
  requireAbsolutePath(options.outputDirectory, "output");
  if (options.confirmation !== READ_ONLY_CONFIRMATION) {
    throw new MembershipExportSafetyError("The exact read-only confirmation phrase is required.");
  }
  validateOutputDirectory(options.outputDirectory);
  const credential = validateCredentialFile(options.credentialsPath, options.projectId);

  const now = dependencies.now ?? (() => new Date().toISOString());
  const generatedAt = now();
  const createSource = dependencies.createSource ?? createFirestoreMembershipReadSource;
  const source = await createSource(options.projectId, options.databaseId, credential);
  let collected;
  try {
    collected = await collectMembershipPlanningExport(source, generatedAt);
  } finally {
    await source.close();
  }

  const completedAt = now();
  const exportText = `${JSON.stringify(collected.exportData, null, 2)}\n`;
  const exportBytes = Buffer.from(exportText, "utf8");
  const exportSha256 = sha256Text(exportBytes);
  const manifest: ExportManifest = {
    sensitive: true,
    notice: SENSITIVE_NOTICE,
    generatedAt,
    completedAt,
    projectId: options.projectId,
    databaseId: options.databaseId,
    serviceAccountEmail: credential.clientEmail,
    sourceCommit: (dependencies.sourceCommit ?? defaultSourceCommit)(),
    exporterVersion: EXPORTER_VERSION,
    counts: {
      academies: collected.exportData.academies.length,
      users: collected.exportData.users.length,
      memberships: collected.exportData.memberships.length,
      academyInvites: collected.exportData.academyInvites.length,
    },
    queriedPaths: collected.queriedPaths,
    exportSha256,
    transactionalSnapshot: false,
    writeCapabilityUsed: false,
    productionWritesPerformed: false,
  };

  const outputParent = dirname(options.outputDirectory);
  const writeArtifact = dependencies.writeArtifact ?? writeDefault;
  const publishDirectory = dependencies.publishDirectory ?? renameSync;
  let temporaryDirectory: string | undefined;
  try {
    temporaryDirectory = mkdtempSync(join(outputParent, `${basename(options.outputDirectory)}.tmp-`));
    writeArtifact(join(temporaryDirectory, "membership-planning-export.json"), exportBytes);
    writeArtifact(
      join(temporaryDirectory, "membership-planning-export.sha256"),
      `${exportSha256}  membership-planning-export.json\n`,
    );
    writeArtifact(join(temporaryDirectory, "export-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    writeArtifact(join(temporaryDirectory, "README-SENSITIVE.txt"), README_SENSITIVE);
    verifyTemporaryArtifacts(temporaryDirectory, exportSha256);
    dependencies.beforePublish?.(options.outputDirectory);
    if (lstatIfExists(options.outputDirectory)) {
      throw new MembershipExportSafetyError("Output directory appeared during export and will not be overwritten.");
    }
    publishDirectory(temporaryDirectory, options.outputDirectory);
    temporaryDirectory = undefined;
    return manifest;
  } finally {
    if (temporaryDirectory && lstatIfExists(temporaryDirectory)) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

export async function runCli(
  argv: string[],
  writeError: (message: string) => void = (message) => process.stderr.write(message),
): Promise<0 | 1> {
  try {
    const options = parseArguments(argv);
    await executeReadOnlyExport(options);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown exporter failure.";
    writeError(`${JSON.stringify({ error: message }, null, 2)}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  process.exitCode = await runCli(process.argv.slice(2));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
