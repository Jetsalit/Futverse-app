import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const fitnessSource = readFileSync(
  path.join(
    repoRoot,
    "src/components/FitnessTesting.tsx",
  ),
  "utf8",
);

test(
  "1. Fitness Testing consumes the shared Player Position V2 contract",
  () => {
    const requiredSymbols = [
      "PLAYER_POSITION_CODES",
      "POSITION_ADDITIONAL_STORAGE_FIELD",
      "inspectStoredPosition",
      "isPlayerPositionCode",
      "validatePositionSelection",
    ];

    for (const symbol of requiredSymbols) {
      assert.ok(
        fitnessSource.includes(symbol),
        "missing shared position symbol: " + symbol,
      );
    }
  },
);

test(
  "2. Fitness Testing exposes only canonical selectable positions",
  () => {
    assert.match(
      fitnessSource,
      /PLAYER_POSITION_CODES\.map\(\(position\)\s*=>/,
    );

    assert.doesNotMatch(
      fitnessSource,
      /<option\s+value="Winger">/,
    );

    assert.doesNotMatch(
      fitnessSource,
      /<option\s+value="Striker">/,
    );
  },
);

test(
  "3. legacy Fitness Testing positions are visible and never auto-normalized",
  () => {
    assert.match(
      fitnessSource,
      /inspectStoredPosition\(player\.position\)/,
    );

    assert.match(
      fitnessSource,
      /position:\s*isPlayerPositionCode\(player\.position\)[\s\S]*?\? player\.position[\s\S]*?: ""/,
    );

    assert.ok(
      fitnessSource.includes(
        "Stored position under review:",
      ),
    );

    assert.ok(
      fitnessSource.includes(
        "Leave unselected to preserve the stored value",
      ),
    );

    assert.doesNotMatch(
      fitnessSource,
      /\.suggestedCanonical/,
    );
  },
);

test(
  "4. legacy position field is omitted from update when left unchanged",
  () => {
    const saveStart =
      fitnessSource.indexOf(
        "const handleSavePlayer =",
      );

    const saveEnd =
      fitnessSource.indexOf(
        "const handleDeleteConfirm =",
        saveStart,
      );

    assert.ok(saveStart >= 0);
    assert.ok(saveEnd > saveStart);

    const saveSource =
      fitnessSource.slice(saveStart, saveEnd);

    assert.match(
      saveSource,
      /const preservingStoredPosition =/,
    );

    assert.match(
      saveSource,
      /if \(preservingStoredPosition\)[\s\S]*?delete playerData\.position/,
    );
  },
);

test(
  "5. shared validation runs before both Academy player writes",
  () => {
    const saveStart =
      fitnessSource.indexOf(
        "const handleSavePlayer =",
      );

    const saveEnd =
      fitnessSource.indexOf(
        "const handleDeleteConfirm =",
        saveStart,
      );

    const saveSource =
      fitnessSource.slice(saveStart, saveEnd);

    const validationIndex =
      saveSource.indexOf(
        "const positionValidation =",
      );

    const updateIndex =
      saveSource.indexOf("await updateDoc(");

    const createIndex =
      saveSource.indexOf("await addDoc(");

    assert.ok(validationIndex >= 0);
    assert.ok(updateIndex > validationIndex);
    assert.ok(createIndex > validationIndex);

    assert.match(
      saveSource,
      /!positionValidation\.valid/,
    );
  },
);

test(
  "6. new Fitness Testing player records initialize additionalPositions without rewriting legacy edits",
  () => {
    assert.match(
      fitnessSource,
      /if \(!editingPlayerId\)[\s\S]*?POSITION_ADDITIONAL_STORAGE_FIELD[\s\S]*?= \[\]/,
    );

    assert.match(
      fitnessSource,
      /updateDoc\(doc\(db, "academies", academyId, "players", editingPlayerId\)/,
    );

    assert.match(
      fitnessSource,
      /addDoc\(collection\(db, "academies", academyId, "players"\), playerData\)/,
    );
  },
);
