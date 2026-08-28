import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const cvSource = readFileSync(
  path.join(
    repoRoot,
    "src/components/YouthPlayerCV.tsx",
  ),
  "utf8",
);

test(
  "1. YouthPlayerCV consumes the shared Academy Profile read adapter",
  () => {
    assert.match(
      cvSource,
      /toAcademyPlayerProfileReadModel/,
    );

    assert.match(
      cvSource,
      /const\s+profile\s*=\s*toAcademyPlayerProfileReadModel\s*\(\s*player\s*,[\s\S]*?calendarDateInTimeZone\s*\(\s*new Date\s*\(\s*\)\s*,\s*"Asia\/Bangkok"\s*,?\s*\)\s*\?\?\s*""\s*,?\s*\)/,
    );
  },
);

test(
  "2. Youth Profile core renders from the shared read model",
  () => {
    const requiredProfileReads = [
      /profile\.displayName/,
      /profile\.position/,
      /profile\.ageGroup/,
      /profile\.age/,
      /profile\.avatarUrl/,
    ];

    for (const pattern of requiredProfileReads) {
      assert.match(cvSource, pattern);
    }
  },
);

test(
  "3. YouthPlayerCV no longer bypasses the read model for Profile core",
  () => {
    assert.doesNotMatch(
      cvSource,
      /player\.(?:firstName|lastName|position|ageGroup|age|avatar|dob)\b/,
    );

    assert.match(
      cvSource,
      /\bdob:\s*string;/,
    );
  },
);

test(
  "4. Academy Evaluation remains a separate read domain keyed by the selected player record",
  () => {
    const preservedEvaluationReads = [
      /readAcademyPlayerEvaluations/,
      /LegacyPlayerEvaluationRecord/,
      /comparePlayerEvaluationsNewestFirst/,
      /evaluationDateLabel/,
      /evaluation\.player_id\s*===\s*player\.id/,
    ];

    for (const pattern of preservedEvaluationReads) {
      assert.match(cvSource, pattern);
    }
  },
);

test(
  "5. stored age remains non-authoritative in YouthPlayerCV presentation",
  () => {
    assert.doesNotMatch(
      cvSource,
      /Age\s*\{player\.age\}/,
    );

    assert.match(
      cvSource,
      /Age\s*\{profile\.age\}/,
    );
  },
);

test(
  "6. YouthPlayerCV remains free of persistence and identity authority",
  () => {
    assert.doesNotMatch(
      cvSource,
      /firebase\/firestore|addDoc\s*\(|updateDoc\s*\(|deleteDoc\s*\(|setDoc\s*\(|writeBatch\s*\(|runTransaction\s*\(/,
    );

    assert.doesNotMatch(
      cvSource,
      /playerIdentity|\bfutId\b|\bFUTID\b|\bplayerKey\b/,
    );
  },
);