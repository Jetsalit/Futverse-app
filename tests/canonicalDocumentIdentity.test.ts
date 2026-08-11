import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import {
  mapCanonicalSnapshot,
  withoutCanonicalDocumentId,
} from "../src/lib/firestore/canonicalDocument.js";
import { mapUserSnapshot } from "../src/lib/firestore/users.js";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDirectory, "..");
const sourceRoot = path.join(repoRoot, "src");

function snapshot(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

function productionTypeScriptFiles(directory = sourceRoot): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(absolutePath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [absolutePath] : [];
  });
}

function unsafeCanonicalFirstMappings(filePath: string): string[] {
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isObjectLiteralExpression(node)) {
      node.properties.forEach((property, index) => {
        if (!ts.isPropertyAssignment(property)) return;
        const propertyName = property.name.getText(sourceFile).replace(/["']/g, "");
        if (propertyName !== "id" && propertyName !== "uid") return;
        if (
          !ts.isPropertyAccessExpression(property.initializer)
          || property.initializer.name.text !== "id"
        ) {
          return;
        }
        if (!node.properties.slice(index + 1).some(ts.isSpreadAssignment)) return;

        const { line, character } = sourceFile.getLineAndCharacterOfPosition(property.getStart());
        findings.push(
          `${path.relative(repoRoot, filePath)}:${line + 1}:${character + 1}`,
        );
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

describe("Access A6 canonical Firestore document identity", () => {
  it("canonical mapper overwrites a malicious stored id", () => {
    const mapped = mapCanonicalSnapshot(snapshot("actual-document", {
      id: "victim-document",
      name: "Ordinary field",
    }));

    assert.equal(mapped.id, "actual-document");
  });

  it("canonical mapper preserves ordinary fields and does not mutate snapshot data", () => {
    const stored = {
      id: "victim-document",
      name: "Player One",
      nested: { score: 9 },
    };
    const before = structuredClone(stored);
    const mapped = mapCanonicalSnapshot(snapshot("actual-document", stored));

    assert.equal(mapped.name, "Player One");
    assert.deepEqual(mapped.nested, { score: 9 });
    assert.deepEqual(stored, before);
    assert.notEqual(mapped, stored);
  });

  it("write payload stripping removes only the UI document id without mutation", () => {
    const record = { id: "actual-document", name: "Player One", playerId: "FUT-9" };
    const before = structuredClone(record);
    const payload = withoutCanonicalDocumentId(record);

    assert.deepEqual(payload, { name: "Player One", playerId: "FUT-9" });
    assert.deepEqual(record, before);
    assert.equal("id" in payload, false);
  });

  for (const [label, collection] of [
    ["Scout submission", "scoutPlayers"],
    ["tenant player", "academies/academy-a/players"],
    ["profile Claim", "profile_claims"],
    ["Coach record", "academies/academy-a/coaches"],
    ["ProPlayer record", "proPlayers"],
    ["drill record", "drills"],
    ["Fitness and Youth Player record", "academies/academy-a/players"],
  ] as const) {
    it(`${label} malicious stored id cannot redirect its mutation target`, () => {
      const mapped = mapCanonicalSnapshot(snapshot("actual-document", {
        id: "victim-document",
        name: label,
      }));

      assert.equal(`${collection}/${mapped.id}`, `${collection}/actual-document`);
      assert.notEqual(mapped.id, "victim-document");
    });
  }

  it("path-bound player academy identity wins over stored data", () => {
    const player = {
      ...mapCanonicalSnapshot(snapshot("player-a", {
        id: "victim-player",
        academyId: "victim-academy",
        name: "Player A",
      })),
      academyId: "academy-a",
    };

    assert.equal(player.id, "player-a");
    assert.equal(player.academyId, "academy-a");
  });

  it("User mapping uses snapshot id and never exposes a stored uid mismatch", () => {
    const [user] = mapUserSnapshot({
      docs: [{
        id: "canonical-uid",
        data: () => ({
          id: "victim-id",
          uid: "victim-uid",
          name: "User",
          role: "USER",
        }),
      }],
    });

    assert.equal(user.id, "canonical-uid");
    assert.equal(user.uid, undefined);
  });

  it("every affected production consumer uses the canonical mapper", () => {
    const affectedFiles = [
      "src/contexts/AcademyContext.tsx",
      "src/contexts/AuthContext.tsx",
      "src/hooks/useDrillDatabase.ts",
      "src/services/membershipService.ts",
      "src/components/CoachManagement.tsx",
      "src/components/FitnessTesting.tsx",
      "src/components/JoinAcademy.tsx",
      "src/components/PlayerDashboard.tsx",
      "src/components/ProPlayerManager.tsx",
      "src/components/ScoutDashboard.tsx",
      "src/components/YouthPlayerManager.tsx",
      "src/lib/firestore/users.ts",
    ];

    for (const relativePath of affectedFiles) {
      assert.match(
        readFileSync(path.join(repoRoot, relativePath), "utf8"),
        /mapCanonicalSnapshot/,
        `${relativePath} must map snapshot identity canonically`,
      );
    }
  });

  it("production structural audit finds zero canonical-first/data-spread-last mappings", () => {
    const findings = productionTypeScriptFiles().flatMap(unsafeCanonicalFirstMappings);
    assert.deepEqual(findings, []);
  });

  it("ProPlayer and Scout form state excludes Firestore document id", () => {
    for (const relativePath of [
      "src/components/ProPlayerManager.tsx",
      "src/components/ScoutDashboard.tsx",
    ]) {
      const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
      assert.match(source, /Partial<Omit<[^>]+,\s*"id">>/);
      assert.match(source, /withoutCanonicalDocumentId\s*\(/);
    }
  });
});
