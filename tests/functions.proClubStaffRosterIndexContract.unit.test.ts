import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

function functionConfig(source: string, exportName: string): string {
  const match = source.match(
    new RegExp(`export\\s+const\\s+${exportName}\\s*=\\s*onCall\\(\\s*\\{([\\s\\S]*?)\\},`),
  );
  assert.ok(match, `${exportName} definition not found`);
  return match[1];
}

test("loadProClubStaffRosterV1 remains App Check protected and resource bounded", () => {
  const source = readFileSync("functions/src/index.ts", "utf8");
  const config = functionConfig(source, "loadProClubStaffRosterV1");

  assert.match(config, /region:\s*"asia-southeast1"/);
  assert.match(config, /enforceAppCheck:\s*true/);
  assert.match(config, /timeoutSeconds:\s*15/);
  assert.match(config, /memory:\s*"256MiB"/);
  assert.match(config, /concurrency:\s*20/);
  assert.match(config, /maxInstances:\s*10/);
});

test("staff roster wiring uses authenticated request identity and App Check context only", () => {
  const source = readFileSync("functions/src/index.ts", "utf8");

  assert.match(
    source,
    /auth:\s*request\.auth\s*\?\s*\{\s*uid:\s*request\.auth\.uid/,
  );
  assert.match(
    source,
    /app:\s*request\.app\s*\?\s*\{\s*appId:\s*request\.app\.appId/,
  );
  assert.match(source, /executeLoadProClubStaffRosterCallableV1/);
  assert.match(source, /enforceAppCheck:\s*true/);
});
