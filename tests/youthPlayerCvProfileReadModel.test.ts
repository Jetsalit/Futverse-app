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
      /const\s+profile\s*=\s*toAcademyPlayerProfileReadModel\s*\(\s*profileSourceFromYouthPlayer\s*\(\s*player\s*\)\s*,[\s\S]*?calendarDateInTimeZone\s*\(\s*new Date\s*\(\s*\)\s*,\s*"Asia\/Bangkok"\s*,?\s*\)\s*\?\?\s*""\s*,?\s*\)/,
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
  "3. YouthPlayerCV normalizes legacy partial player records before the shared adapter",
  () => {
    const optionalLegacyFields = [
      /firstName\?:\s*string;/,
      /lastName\?:\s*string;/,
      /position\?:\s*string;/,
      /ageGroup\?:\s*string;/,
      /dob\?:\s*string;/,
      /avatar\?:\s*string\s*\|\s*null;/,
    ];

    for (const pattern of optionalLegacyFields) {
      assert.match(cvSource, pattern);
    }

    assert.match(
      cvSource,
      /function\s+profileSourceFromYouthPlayer[\s\S]*?firstName:[\s\S]*?typeof\s+player\.firstName\s*===\s*"string"[\s\S]*?:\s*""/,
    );

    assert.match(
      cvSource,
      /lastName:[\s\S]*?typeof\s+player\.lastName\s*===\s*"string"[\s\S]*?:\s*""/,
    );

    assert.match(
      cvSource,
      /position:[\s\S]*?typeof\s+player\.position\s*===\s*"string"[\s\S]*?:\s*""/,
    );

    assert.match(
      cvSource,
      /ageGroup:[\s\S]*?typeof\s+player\.ageGroup\s*===\s*"string"[\s\S]*?:\s*""/,
    );

    assert.match(
      cvSource,
      /dob:[\s\S]*?typeof\s+player\.dob\s*===\s*"string"[\s\S]*?:\s*""/,
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
