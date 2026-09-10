import assert from "node:assert/strict";
import { mkdir, readFile, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { build } from "vite";

const productHead = "f83e63e784e9e3a939ec88e77fc44a5f1eeb3ba0";
const entry = resolve("src/config/runtimeCapabilities.ts");
const tmpRoot = resolve(".tmp-team2-saved-draft-serve-only");

async function compileCapability(label, { mode, nodeEnv }) {
  const outDir = resolve(tmpRoot, label);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const oldNodeEnv = process.env.NODE_ENV;
  try {
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
    await build({
      mode,
      logLevel: "silent",
      build: {
        outDir,
        emptyOutDir: true,
        minify: "esbuild",
        lib: { entry, formats: ["es"], fileName: () => "capability.mjs" },
      },
    });
  } finally {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
  }
  return import(`${pathToFileURL(resolve(outDir, "capability.mjs")).href}?${Date.now()}-${label}`);
}

const source = await readFile(entry, "utf8");
assert.match(source, /PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED = false as const/);
assert.match(source, /\.hot !== undefined/);
assert.doesNotMatch(source, /import\.meta[^;]*\.env[^;]*(DEV|MODE)/);
assert.doesNotMatch(source, /process\.env/);

for (const [label, config] of Object.entries({
  prod: { mode: "production", nodeEnv: "production" },
  inheritedDevEnv: { mode: "production", nodeEnv: "development" },
  developmentMode: { mode: "development", nodeEnv: "production" },
  bothDevelopmentSignals: { mode: "development", nodeEnv: "development" },
  arbitraryMode: { mode: "staging", nodeEnv: "development" },
})) {
  const built = await compileCapability(label, config);
  assert.equal(built.PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED, false, `${label}: index evidence drift`);
  assert.equal(built.WEEKLY_TRAINING_SAVED_DRAFT_READ_AVAILABLE, false, `${label}: build escaped fail-closed boundary`);
}

const workspace = await readFile("src/components/pro-club/operations/ProClubRoleWorkspace.tsx", "utf8");
assert.match(workspace, /WEEKLY_TRAINING_SAVED_DRAFT_READ_AVAILABLE \? \(/);
assert.match(workspace, /<SavedDraftReadPending \/>/);

const spark = JSON.parse(await readFile("firebase.spark.json", "utf8"));
assert.deepEqual(Object.keys(spark).sort(), ["hosting"]);

await rm(tmpRoot, { recursive: true, force: true });
console.log(`TEAM2_PRODUCT_HEAD=${productHead}`);
console.log("TEAM2_SAVED_DRAFT_SERVE_ONLY_AUDIT=PASS");
