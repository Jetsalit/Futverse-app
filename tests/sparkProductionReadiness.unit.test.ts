import assert from "node:assert/strict";
import test from "node:test";
import {
  SPARK_EXPECTED_PROJECT_ID,
  SPARK_READINESS_COMMAND,
  verifySparkProductionReadinessFromSources,
  type SparkReadinessSources,
} from "../scripts/verifySparkProductionReadiness.ts";

function validSources(): SparkReadinessSources {
  return {
    firebasercText: JSON.stringify({
      projects: { default: SPARK_EXPECTED_PROJECT_ID },
    }),
    sparkConfigText: JSON.stringify({
      hosting: {
        public: "dist",
        predeploy: [
          "node scripts/verifyProductionAppCheck.mjs",
          "npm run build",
        ],
        rewrites: [{ source: "**", destination: "/index.html" }],
      },
    }),
    productionConfigText: JSON.stringify({
      hosting: {
        rewrites: [
          {
            source: "/api/pro-club/provision-v1",
            function: {
              functionId: "provisionProClubV1",
              region: "asia-southeast1",
            },
          },
          {
            source: "/api/pro-club/verify-audit-v1",
            function: {
              functionId: "verifyProClubProvisioningAuditV1",
              region: "asia-southeast1",
            },
          },
          {
            source: "/api/pro-club/rename-v1",
            function: {
              functionId: "renameProClubV1",
              region: "asia-southeast1",
            },
          },
          { source: "**", destination: "/index.html" },
        ],
      },
      functions: [{ runtime: "nodejs22" }],
    }),
    packageJsonText: JSON.stringify({
      scripts: {
        "verify:spark-production-readiness": SPARK_READINESS_COMMAND,
      },
    }),
  };
}

function mutateJson(
  text: string,
  mutate: (value: any) => void,
): string {
  const value = JSON.parse(text);
  mutate(value);
  return JSON.stringify(value);
}

test("Spark production readiness accepts the reviewed Hosting-only boundary", () => {
  const result = verifySparkProductionReadinessFromSources(validSources());
  assert.equal(result.projectId, "futverse-d7872");
  assert.deepEqual(result.checks, [
    "firebase-project-pinned",
    "canonical-app-check-before-build",
    "hosting-only-no-server-rewrites",
    "future-server-control-plane-preserved",
    "operator-readiness-command-pinned",
  ]);
});

test("Spark production readiness rejects Firebase project drift", () => {
  const sources = validSources();
  sources.firebasercText = JSON.stringify({ projects: { default: "wrong-project" } });
  assert.throws(
    () => verifySparkProductionReadinessFromSources(sources),
    /Firebase default project must be exactly 'futverse-d7872'/,
  );
});

test("Spark production readiness rejects Functions or any extra deploy resource", () => {
  const sources = validSources();
  sources.sparkConfigText = mutateJson(sources.sparkConfigText, (config) => {
    config.functions = [{ source: "functions" }];
  });
  assert.throws(
    () => verifySparkProductionReadinessFromSources(sources),
    /Hosting only/,
  );
});

test("Spark production readiness rejects Function rewrites", () => {
  const sources = validSources();
  sources.sparkConfigText = mutateJson(sources.sparkConfigText, (config) => {
    config.hosting.rewrites = [
      {
        source: "/api/pro-club/provision-v1",
        function: {
          functionId: "provisionProClubV1",
          region: "asia-southeast1",
        },
      },
      { source: "**", destination: "/index.html" },
    ];
  });
  assert.throws(
    () => verifySparkProductionReadinessFromSources(sources),
    /only the SPA catch-all rewrite/,
  );
});

test("Spark production readiness rejects App Check predeploy reordering or bypass", () => {
  const sources = validSources();
  sources.sparkConfigText = mutateJson(sources.sparkConfigText, (config) => {
    config.hosting.predeploy = [
      "npm run build",
      "node scripts/verifyProductionAppCheck.mjs",
    ];
  });
  assert.throws(
    () => verifySparkProductionReadinessFromSources(sources),
    /canonical App Check guard/,
  );
});

test("Spark production readiness preserves the future server control plane", () => {
  const sources = validSources();
  sources.productionConfigText = mutateJson(
    sources.productionConfigText,
    (config) => {
      config.hosting.rewrites.shift();
    },
  );
  assert.throws(
    () => verifySparkProductionReadinessFromSources(sources),
    /Preserved protected rewrite/,
  );
});

test("Spark production readiness rejects Functions runtime drift in the preserved config", () => {
  const sources = validSources();
  sources.productionConfigText = mutateJson(
    sources.productionConfigText,
    (config) => {
      config.functions[0].runtime = "nodejs20";
    },
  );
  assert.throws(
    () => verifySparkProductionReadinessFromSources(sources),
    /must remain nodejs22/,
  );
});

test("Spark production readiness pins the operator command chain", () => {
  const sources = validSources();
  sources.packageJsonText = JSON.stringify({
    scripts: {
      "verify:spark-production-readiness":
        "node --import tsx scripts/verifySparkProductionReadiness.ts",
    },
  });
  assert.throws(
    () => verifySparkProductionReadinessFromSources(sources),
    /exact reviewed Spark readiness command chain/,
  );
});
