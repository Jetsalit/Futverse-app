import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const cvSource = readFileSync(
  path.join(repoRoot, "src/components/ProPlayerCV.tsx"),
  "utf8",
);

test("1. ProPlayerCV consumes the shared Pro profile read adapter", () => {
  assert.match(
    cvSource,
    /toProPlayerProfileReadModel/,
  );

  assert.match(
    cvSource,
    /const\s+profile\s*=\s*toProPlayerProfileReadModel\s*\(\s*player\s*,[\s\S]*?calendarDateInTimeZone\s*\(\s*new Date\s*\(\s*\)\s*,\s*"Asia\/Bangkok"\s*,?\s*\)\s*\?\?\s*""\s*,?\s*\)/,
  );
});

test("2. shared Profile core is rendered from the read model", () => {
  const requiredProfileReads = [
    /profile\.displayName/,
    /profile\.nationality/,
    /profile\.league/,
    /profile\.position/,
    /profile\.currentClub/,
    /profile\.age/,
    /profile\.dateOfBirth/,
    /profile\.height/,
    /profile\.weight/,
    /profile\.preferredFoot/,
  ];

  for (const pattern of requiredProfileReads) {
    assert.match(cvSource, pattern);
  }
});

test("3. ProPlayerCV no longer bypasses the read model for Profile core", () => {
  assert.doesNotMatch(
    cvSource,
    /player\.(?:name|nationality|league|position|currentClub|dob|height|weight|preferredFoot)\b/,
  );

  assert.doesNotMatch(
    cvSource,
    /calculateAgeFromDateOnly/,
  );
});

test("4. CV-specific extensions remain outside the shared Profile core", () => {
  const preservedExtensions = [
    /player\.marketValue/,
    /player\.actionShotUrl/,
    /player\.contractExpiry/,
    /player\.phoneNumber/,
    /player\.lineId/,
    /player\.facebook/,
    /player\.careerHistory/,
    /player\.highlightVideoUrl/,
    /player\?\.attributes/,
  ];

  for (const pattern of preservedExtensions) {
    assert.match(cvSource, pattern);
  }
});

test("5. IDP remains a separate CV domain", () => {
  assert.match(
    cvSource,
    /import IDPProfile from "\.\/IDPProfile"/,
  );

  assert.match(
    cvSource,
    /<IDPProfile\s*\/>/,
  );
});

test("6. ProPlayerCV remains free of persistence and identity authority", () => {
  assert.doesNotMatch(
    cvSource,
    /firebase\/firestore|addDoc\s*\(|updateDoc\s*\(|deleteDoc\s*\(|setDoc\s*\(|writeBatch\s*\(|runTransaction\s*\(/,
  );

  assert.doesNotMatch(
    cvSource,
    /playerIdentity|\bfutId\b|\bFUTID\b|\bplayerKey\b/,
  );
});