import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { build } from "vite";

const entry = resolve("src/config/runtimeCapabilities.ts");
const root = resolve(".tmp-saved-draft-build-gate-r17");

async function buildAndRead({ label, mode, nodeEnv }) {
  const outDir = resolve(root, label);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const previousNodeEnv = process.env.NODE_ENV;
  try {
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;

    await build({
      mode,
      logLevel: "silent",
      build: {
        outDir,
        emptyOutDir: true,
        minify: false,
        lib: {
          entry,
          formats: ["es"],
          fileName: () => "probe.js",
        },
      },
    });
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }

  const moduleUrl = `${pathToFileURL(resolve(outDir, "probe.js")).href}?case=${encodeURIComponent(label)}-${Date.now()}`;
  return await import(moduleUrl);
}

for (const scenario of [
  { label: "default-production-build", mode: "production", nodeEnv: undefined },
  { label: "node-env-development-build", mode: "production", nodeEnv: "development" },
  { label: "vite-development-mode-build", mode: "development", nodeEnv: undefined },
  { label: "both-development-build-signals", mode: "development", nodeEnv: "development" },
]) {
  const built = await buildAndRead(scenario);
  assert.equal(
    built.PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED,
    false,
    `${scenario.label}: production index evidence must remain false`,
  );
  assert.equal(
    built.WEEKLY_TRAINING_SAVED_DRAFT_READ_AVAILABLE,
    false,
    `${scenario.label}: deployable Vite build must remain fail-closed`,
  );
}

await rm(root, { recursive: true, force: true });
console.log("SAVED_DRAFT_BUILD_GATE=PASS");
