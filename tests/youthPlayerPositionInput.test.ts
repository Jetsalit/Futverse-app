import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const managerSource = readFileSync(
  path.join(
    repoRoot,
    "src/components/YouthPlayerManager.tsx",
  ),
  "utf8",
);

test(
  "1. Academy position input consumes the shared Position V2 foundation",
  () => {
    const requiredFoundation = [
      "PLAYER_POSITION_CODES",
      "MAX_ADDITIONAL_POSITIONS",
      "POSITION_ADDITIONAL_STORAGE_FIELD",
      "inspectStoredPosition",
      "isPlayerPositionCode",
      "resolveAdditionalPositionsForRead",
      "validatePositionSelection",
    ];

    for (const symbol of requiredFoundation) {
      assert.ok(
        managerSource.includes(symbol),
        `missing shared position symbol: ${symbol}`,
      );
    }
  },
);

test(
  "2. new Academy input exposes only canonical position values",
  () => {
    assert.match(
      managerSource,
      /PLAYER_POSITION_CODES\.map\(\(position\)\s*=>/,
    );

    assert.doesNotMatch(
      managerSource,
      /<option\s+value="Winger">/,
    );

    assert.doesNotMatch(
      managerSource,
      /<option\s+value="Striker">/,
    );
  },
);

test(
  "3. Academy form supports exactly the shared maximum additional positions",
  () => {
    assert.match(
      managerSource,
      /additionalPositions:\s*emptyAdditionalPositions\(\)/,
    );

    assert.match(
      managerSource,
      /length:\s*MAX_ADDITIONAL_POSITIONS/,
    );

    assert.match(
      managerSource,
      /position\s*===\s*formData\.position/,
    );

    assert.match(
      managerSource,
      /selectedElsewhere/,
    );
  },
);

test(
  "4. legacy primary values require explicit selection and are never auto-normalized",
  () => {
    assert.match(
      managerSource,
      /inspectStoredPosition\(player\.position\)/,
    );

    assert.match(
      managerSource,
      /primaryPositionReviewRequired/,
    );

    assert.doesNotMatch(
      managerSource,
      /\.suggestedCanonical/,
    );
  },
);

test(
  "5. malformed stored additional positions require explicit review",
  () => {
    assert.match(
      managerSource,
      /Object\.prototype\.hasOwnProperty\.call/,
    );

    assert.match(
      managerSource,
      /Array\.isArray\(rawStoredAdditionalPositions\)/,
    );

    assert.match(
      managerSource,
      /additionalPositionsReviewRequired/,
    );

    assert.ok(
      managerSource.includes(
        "additionalPositionsReviewValues",
      ),
    );

    assert.ok(
      managerSource.includes(
        "Stored values under review:",
      ),
    );

    assert.match(
      managerSource,
      /additionalPositionsReviewValues\.map/,
    );

    assert.match(
      managerSource,
      /setAdditionalPositionsReviewValues\([\s\S]*?additionalPositionsRequireReview[\s\S]*?\? resolvedAdditionalPositions[\s\S]*?: \[\]/,
    );

    assert.match(
      managerSource,
      /Confirm reviewed additional positions/,
    );
  },
);

test(
  "6. shared validation executes before either Firestore write",
  () => {
    const validationIndex =
      managerSource.indexOf(
        "const positionValidation =",
      );

    const updateIndex =
      managerSource.indexOf("await updateDoc(");

    const addIndex =
      managerSource.indexOf("await addDoc(");

    assert.ok(validationIndex >= 0);
    assert.ok(updateIndex > validationIndex);
    assert.ok(addIndex > validationIndex);

    assert.match(
      managerSource,
      /if\s*\(!positionValidation\.valid\)/,
    );
  },
);

test(
  "7. Academy create writes the new field while legacy update preserves field absence until explicit additional-position interaction",
  () => {
    const updateStart =
      managerSource.indexOf("if (editingPlayerId) {");

    const createStart =
      managerSource.indexOf(
        "const newPlayer = {",
        updateStart,
      );

    assert.ok(updateStart >= 0);
    assert.ok(createStart > updateStart);

    const updateSource =
      managerSource.slice(updateStart, createStart);

    const createSource =
      managerSource.slice(createStart);

    assert.match(
      managerSource,
      /additionalPositionsFieldPresentAtEdit/,
    );

    assert.match(
      managerSource,
      /additionalPositionsTouched/,
    );

    assert.match(
      managerSource,
      /setAdditionalPositionsTouched\(true\)/,
    );

    assert.match(
      updateSource,
      /shouldWriteAdditionalPositions/,
    );

    assert.match(
      updateSource,
      /\.\.\.\(shouldWriteAdditionalPositions[\s\S]*?\?\s*\{\s*additionalPositions\s*\}[\s\S]*?:\s*\{\}\)/,
    );

    assert.doesNotMatch(
      updateSource,
      /^\s*additionalPositions,\s*$/m,
    );

    assert.match(
      createSource,
      /^\s*additionalPositions,\s*$/m,
    );
  },
);

test(
  "8. Academy input does not add Pro, Rules, or migration authority",
  () => {
    assert.doesNotMatch(
      managerSource,
      /ProPlayerManager|firestore\.rules|migration/i,
    );
  },
);