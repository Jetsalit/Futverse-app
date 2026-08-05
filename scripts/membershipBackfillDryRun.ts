#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  academyInvitePlanCsv,
  InputValidationError,
  membershipPlanCsv,
  parseOfflineExport,
  planDryRun,
  sha256Text,
  summaryMarkdown,
} from "./membershipBackfillDryRunCore";

const OUTPUT_NAMES = [
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

function parseArguments(argv: string[]): { inputPath: string; outputDirectory: string } {
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
      "Usage: tsx scripts/membershipBackfillDryRun.ts --input <offline-json-path> --output <output-directory>",
    );
  }
  return { inputPath: resolve(inputPath), outputDirectory: resolve(outputDirectory) };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main(): void {
  try {
    const { inputPath, outputDirectory } = parseArguments(process.argv.slice(2));
    if (OUTPUT_NAMES.includes(basename(inputPath) as typeof OUTPUT_NAMES[number])
      && resolve(inputPath, "..") === outputDirectory) {
      throw new InputValidationError("Output directory would overwrite the source input file.");
    }

    const rawInput = readFileSync(inputPath, "utf8");
    const input = parseOfflineExport(rawInput);
    const result = planDryRun(input, sha256Text(rawInput));

    mkdirSync(outputDirectory, { recursive: true });
    writeJson(resolve(outputDirectory, "summary.json"), result.summary);
    writeFileSync(resolve(outputDirectory, "summary.md"), summaryMarkdown(result.summary), "utf8");
    writeJson(resolve(outputDirectory, "academy-invite-plan.json"), result.academyInvitePlan);
    writeFileSync(resolve(outputDirectory, "academy-invite-plan.csv"), academyInvitePlanCsv(result), "utf8");
    writeJson(resolve(outputDirectory, "membership-backfill-plan.json"), result.membershipBackfillPlan);
    writeFileSync(resolve(outputDirectory, "membership-backfill-plan.csv"), membershipPlanCsv(result), "utf8");
    writeJson(resolve(outputDirectory, "already-satisfied.json"), result.alreadySatisfied);
    writeJson(resolve(outputDirectory, "manual-review.json"), result.manualReview);
    writeJson(resolve(outputDirectory, "blockers.json"), result.blockers);

    process.exitCode = result.summary.safeToProceed ? 0 : 2;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const issues = error instanceof InputValidationError ? error.issues : [];
    process.stderr.write(`${JSON.stringify({ error: message, issues }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

main();
