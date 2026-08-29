import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  MAX_ADDITIONAL_POSITIONS,
  PLAYER_POSITION_CODES,
  POSITION_ADDITIONAL_STORAGE_FIELD,
  POSITION_LEGACY_SECONDARY_FIELD,
  POSITION_PRIMARY_STORAGE_FIELD,
  inspectStoredPosition,
  isPlayerPositionCode,
  resolveAdditionalPositionsForRead,
  validatePositionSelection,
} from "../src/lib/playerPositionSelection";

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

const repoRoot =
  path.resolve(__dirname, "..");

const source =
  readFileSync(
    path.join(
      repoRoot,
      "src/lib/playerPositionSelection.ts",
    ),
    "utf8",
  );

test(
  "1. selectable vocabulary is exact, detailed, and excludes generic Winger",
  () => {
    assert.deepEqual(
      PLAYER_POSITION_CODES,
      [
        "GK",
        "LB",
        "LWB",
        "CB",
        "RB",
        "RWB",
        "DM",
        "LM",
        "CM",
        "RM",
        "AM",
        "LW",
        "RW",
        "CF",
        "ST",
      ],
    );

    assert.equal(
      isPlayerPositionCode("Winger"),
      false,
    );

    assert.equal(
      isPlayerPositionCode("Striker"),
      false,
    );
  },
);

test(
  "2. canonical position codes are selectable exactly",
  () => {
    for (
      const code of
      PLAYER_POSITION_CODES
    ) {
      assert.equal(
        isPlayerPositionCode(code),
        true,
      );
    }

    assert.equal(
      isPlayerPositionCode("rw"),
      false,
    );

    assert.equal(
      isPlayerPositionCode(" RW "),
      false,
    );
  },
);

test(
  "3. storage field names preserve position as primary and add a separate multi-position field",
  () => {
    assert.equal(
      POSITION_PRIMARY_STORAGE_FIELD,
      "position",
    );

    assert.equal(
      POSITION_ADDITIONAL_STORAGE_FIELD,
      "additionalPositions",
    );

    assert.equal(
      POSITION_LEGACY_SECONDARY_FIELD,
      "secondaryPosition",
    );
  },
);

test(
  "4. legacy Winger is preserved and never inferred as LW or RW",
  () => {
    const review =
      inspectStoredPosition(
        "Winger",
      );

    assert.equal(
      review.originalText,
      "Winger",
    );

    assert.equal(
      review.kind,
      "LEGACY_WINGER",
    );

    assert.equal(
      review.selectable,
      false,
    );

    assert.equal(
      review.requiresConfirmation,
      true,
    );

    assert.equal(
      review.suggestedCanonical,
      null,
    );
  },
);

test(
  "5. legacy Striker can suggest ST but still requires explicit confirmation",
  () => {
    const review =
      inspectStoredPosition(
        "Striker",
      );

    assert.equal(
      review.kind,
      "LEGACY_ALIAS",
    );

    assert.equal(
      review.selectable,
      false,
    );

    assert.equal(
      review.requiresConfirmation,
      true,
    );

    assert.equal(
      review.suggestedCanonical,
      "ST",
    );
  },
);

test(
  "6. non-canonical casing or whitespace requires explicit confirmation",
  () => {
    const casingReview =
      inspectStoredPosition("rw");

    assert.equal(
      casingReview.kind,
      "NON_CANONICAL",
    );

    assert.equal(
      casingReview.selectable,
      false,
    );

    assert.equal(
      casingReview.requiresConfirmation,
      true,
    );

    assert.equal(
      casingReview.suggestedCanonical,
      "RW",
    );

    const whitespaceReview =
      inspectStoredPosition(" RW ");

    assert.equal(
      whitespaceReview.originalText,
      " RW ",
    );

    assert.equal(
      whitespaceReview.kind,
      "NON_CANONICAL",
    );

    assert.equal(
      whitespaceReview.selectable,
      false,
    );

    assert.equal(
      whitespaceReview.requiresConfirmation,
      true,
    );

    assert.equal(
      whitespaceReview.suggestedCanonical,
      "RW",
    );
  },
);

test(
  "7. primary position is required and must be a selectable canonical code",
  () => {
    assert.deepEqual(
      validatePositionSelection({
        primary: "",
        additional: [],
      }),
      {
        valid: false,
        errors: [
          "PRIMARY_REQUIRED",
        ],
      },
    );

    assert.deepEqual(
      validatePositionSelection({
        primary: "Winger",
        additional: [],
      }),
      {
        valid: false,
        errors: [
          "PRIMARY_NOT_SELECTABLE",
        ],
      },
    );
  },
);

test(
  "8. up to three distinct additional positions are accepted",
  () => {
    assert.equal(
      MAX_ADDITIONAL_POSITIONS,
      3,
    );

    const result =
      validatePositionSelection({
        primary: "RW",
        additional: [
          "LW",
          "RM",
          "AM",
        ],
      });

    assert.equal(
      result.valid,
      true,
    );

    assert.deepEqual(
      result.errors,
      [],
    );
  },
);

test(
  "9. more than three additional positions are rejected",
  () => {
    const result =
      validatePositionSelection({
        primary: "CM",
        additional: [
          "DM",
          "AM",
          "LM",
          "RM",
        ],
      });

    assert.equal(
      result.valid,
      false,
    );

    assert.ok(
      result.errors.includes(
        "TOO_MANY_ADDITIONAL",
      ),
    );
  },
);

test(
  "10. primary position cannot also appear in additional positions",
  () => {
    const result =
      validatePositionSelection({
        primary: "RW",
        additional: [
          "LW",
          "RW",
        ],
      });

    assert.equal(
      result.valid,
      false,
    );

    assert.ok(
      result.errors.includes(
        "PRIMARY_DUPLICATED_IN_ADDITIONAL",
      ),
    );
  },
);

test(
  "11. duplicate or non-selectable additional values are rejected",
  () => {
    const duplicate =
      validatePositionSelection({
        primary: "CB",
        additional: [
          "RB",
          "RB",
        ],
      });

    assert.ok(
      duplicate.errors.includes(
        "DUPLICATE_ADDITIONAL",
      ),
    );

    const legacy =
      validatePositionSelection({
        primary: "CB",
        additional: [
          "Winger",
        ],
      });

    assert.ok(
      legacy.errors.includes(
        "ADDITIONAL_NOT_SELECTABLE",
      ),
    );
  },
);

test(
  "12. new additionalPositions takes precedence over legacy Pro secondaryPosition",
  () => {
    assert.deepEqual(
      resolveAdditionalPositionsForRead({
        additionalPositions: [
          "LW",
          "RM",
        ],
        secondaryPosition: "CF",
      }),
      [
        "LW",
        "RM",
      ],
    );
  },
);

test(
  "13. explicit empty additionalPositions suppresses legacy secondary fallback",
  () => {
    assert.deepEqual(
      resolveAdditionalPositionsForRead({
        additionalPositions: [],
        secondaryPosition: "LW",
      }),
      [],
    );
  },
);

test(
  "14. legacy Pro secondaryPosition remains readable only when the new field is absent",
  () => {
    assert.deepEqual(
      resolveAdditionalPositionsForRead({
        secondaryPosition:
          "Left Winger",
      }),
      [
        "Left Winger",
      ],
    );

    assert.deepEqual(
      resolveAdditionalPositionsForRead({}),
      [],
    );
  },
);

test(
  "15. explicit null additionalPositions is authoritative and never revives legacy secondary",
  () => {
    assert.deepEqual(
      resolveAdditionalPositionsForRead({
        additionalPositions: null,
        secondaryPosition: "LW",
      }),
      [],
    );
  },
);

test(
  "16. malformed new additionalPositions suppresses legacy fallback without crashing",
  () => {
    assert.deepEqual(
      resolveAdditionalPositionsForRead({
        additionalPositions: "LW",
        secondaryPosition: "RW",
      }),
      [],
    );
  },
);

test(
  "17. runtime additional-position arrays ignore non-string corruption without rewriting valid strings",
  () => {
    assert.deepEqual(
      resolveAdditionalPositionsForRead({
        additionalPositions: [
          "LW",
          42,
          "RM",
          null,
        ],
        secondaryPosition: "CF",
      }),
      [
        "LW",
        "RM",
      ],
    );
  },
);

test(
  "18. selection foundation remains pure and never infers position from preferred foot",
  () => {
    assert.doesNotMatch(
      source,
      /firebase|firestore|addDoc\s*\(|updateDoc\s*\(|deleteDoc\s*\(|setDoc\s*\(|writeBatch\s*\(|runTransaction\s*\(/,
    );

    assert.doesNotMatch(
      source,
      /preferredFoot|preferred foot/i,
    );
  },
);