#!/usr/bin/env node
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  academyInvitePlanCsv,
  InputValidationError,
  membershipPlanCsv,
  parseOfflineExport,
  planDryRun,
  sha256Text,
  summaryMarkdown,
} from "./membershipBackfillDryRunCore";

export const OUTPUT_NAMES = [
  "summary.json",
  "summary.md",
  "academy-invite-plan.json",
  "academy-invite-plan.csv",
  "membership-backfill-plan.json",
  "membership-backfill-plan.csv",
  "already-satisfied.json",
  "manual-review.json",
  "blockers.json",
] as const;

const JSON_OUTPUT_NAMES = [
  "summary.json",
  "academy-invite-plan.json",
  "membership-backfill-plan.json",
  "already-satisfied.json",
  "manual-review.json",
  "blockers.json",
] as const;

const CSV_HEADERS: Record<string, string> = {
  "academy-invite-plan.csv": '"path","inviteCode","academyId","status","academyName"',
  "membership-backfill-plan.csv": '"path","userId","academyId","role","status","source","email","name"',
};

export type ArtifactWriter = (path: string, data: string, encoding: "utf8") => void;

const defaultArtifactWriter: ArtifactWriter = (path, data, encoding) => {
  writeFileSync(path, data, encoding);
};

function lstatIfExists(path: string): ReturnType<typeof lstatSync> | null {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function comparablePath(path: string): string {
  const resolved = resolve(path);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function pathIsInside(parentPath: string, candidatePath: string): boolean {
  const pathDifference = relative(parentPath, candidatePath);
  return pathDifference !== ""
    && pathDifference !== ".."
    && !pathDifference.startsWith(`..${sep}`)
    && !isAbsolute(pathDifference);
}

export function parseArguments(argv: string[]): { inputPath: string; outputDirectory: string } {
  let inputPath = "";
  let outputDirectory = "";
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") inputPath = argv[++index] || "";
    else if (argument === "--output") outputDirectory = argv[++index] || "";
    else throw new InputValidationError(`Unknown argument: ${argument}`);
  }
  if (!inputPath || !outputDirectory) {
    throw new InputValidationError(
      "Usage: tsx scripts/membershipBackfillDryRun.ts --input <offline-json-path> --output <new-output-directory>",
    );
  }
  return { inputPath: resolve(inputPath), outputDirectory: resolve(outputDirectory) };
}

function validateLocalPaths(inputPath: string, outputDirectory: string): void {
  const inputStatus = lstatIfExists(inputPath);
  if (!inputStatus) throw new InputValidationError("Input path does not exist.");
  if (inputStatus.isSymbolicLink()) throw new InputValidationError("Input path must not be a symbolic link.");
  if (!inputStatus.isFile()) throw new InputValidationError("Input path must be a regular file.");

  if (lstatIfExists(outputDirectory)) {
    throw new InputValidationError("Output path must not already exist and will never be overwritten.");
  }
  if (comparablePath(inputPath) === comparablePath(outputDirectory)) {
    throw new InputValidationError("Output path must not equal the input path.");
  }
  if (pathIsInside(inputPath, outputDirectory)) {
    throw new InputValidationError("Output path must not be inside the input file path.");
  }

  const outputParent = dirname(outputDirectory);
  const parentStatus = lstatIfExists(outputParent);
  if (!parentStatus || parentStatus.isSymbolicLink() || !parentStatus.isDirectory()) {
    throw new InputValidationError("Output parent must be an existing non-symbolic-link directory.");
  }
}

function writeJson(
  path: string,
  value: unknown,
  writeArtifact: ArtifactWriter,
): void {
  writeArtifact(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function verifyOutputArtifacts(directory: string, expectedInputSha256: string): void {
  const actualNames = readdirSync(directory).sort();
  const expectedNames = [...OUTPUT_NAMES].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new InputValidationError("Temporary output does not contain exactly the nine required artifacts.");
  }

  for (const name of OUTPUT_NAMES) {
    const artifactPath = join(directory, name);
    const artifactStatus = lstatSync(artifactPath);
    if (artifactStatus.isSymbolicLink() || !artifactStatus.isFile()) {
      throw new InputValidationError(`Output artifact ${name} must be a regular file.`);
    }
  }

  for (const name of JSON_OUTPUT_NAMES) {
    JSON.parse(readFileSync(join(directory, name), "utf8"));
  }

  for (const [name, expectedHeader] of Object.entries(CSV_HEADERS)) {
    const content = readFileSync(join(directory, name), "utf8");
    if (content.length === 0 || content.split(/\r?\n/, 1)[0] !== expectedHeader) {
      throw new InputValidationError(`Output artifact ${name} is empty or has an unexpected header.`);
    }
  }

  const summary = JSON.parse(readFileSync(join(directory, "summary.json"), "utf8")) as {
    inputSha256?: unknown;
  };
  if (summary.inputSha256 !== expectedInputSha256) {
    throw new InputValidationError("Summary SHA-256 does not match the exact input bytes.");
  }
}

export function executeDryRun(
  inputPathValue: string,
  outputDirectoryValue: string,
  writeArtifact: ArtifactWriter = defaultArtifactWriter,
): 0 | 2 {
  const inputPath = resolve(inputPathValue);
  const outputDirectory = resolve(outputDirectoryValue);
  validateLocalPaths(inputPath, outputDirectory);

  const rawInputBytes = readFileSync(inputPath);
  const inputSha256 = sha256Text(rawInputBytes);
  const input = parseOfflineExport(rawInputBytes.toString("utf8"));
  const result = planDryRun(input, inputSha256);

  const outputParent = dirname(outputDirectory);
  let temporaryDirectory: string | undefined;
  try {
    temporaryDirectory = mkdtempSync(join(outputParent, `${basename(outputDirectory)}.tmp-`));
    writeJson(join(temporaryDirectory, "summary.json"), result.summary, writeArtifact);
    writeArtifact(join(temporaryDirectory, "summary.md"), summaryMarkdown(result.summary), "utf8");
    writeJson(join(temporaryDirectory, "academy-invite-plan.json"), result.academyInvitePlan, writeArtifact);
    writeArtifact(join(temporaryDirectory, "academy-invite-plan.csv"), academyInvitePlanCsv(result), "utf8");
    writeJson(join(temporaryDirectory, "membership-backfill-plan.json"), result.membershipBackfillPlan, writeArtifact);
    writeArtifact(join(temporaryDirectory, "membership-backfill-plan.csv"), membershipPlanCsv(result), "utf8");
    writeJson(join(temporaryDirectory, "already-satisfied.json"), result.alreadySatisfied, writeArtifact);
    writeJson(join(temporaryDirectory, "manual-review.json"), result.manualReview, writeArtifact);
    writeJson(join(temporaryDirectory, "blockers.json"), result.blockers, writeArtifact);

    verifyOutputArtifacts(temporaryDirectory, inputSha256);
    if (lstatIfExists(outputDirectory)) {
      throw new InputValidationError("Output path appeared during generation and will not be overwritten.");
    }
    renameSync(temporaryDirectory, outputDirectory);
    temporaryDirectory = undefined;
    return result.summary.safeToProceed ? 0 : 2;
  } finally {
    if (temporaryDirectory && lstatIfExists(temporaryDirectory)) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

function main(): void {
  try {
    const { inputPath, outputDirectory } = parseArguments(process.argv.slice(2));
    process.exitCode = executeDryRun(inputPath, outputDirectory);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const issues = error instanceof InputValidationError ? error.issues : [];
    process.stderr.write(`${JSON.stringify({ error: message, issues }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
