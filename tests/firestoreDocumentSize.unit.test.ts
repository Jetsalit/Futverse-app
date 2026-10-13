import assert from "node:assert/strict";
import { initializeApp } from "firebase/app";
import {
  Bytes,
  GeoPoint,
  Timestamp,
  doc,
  getFirestore,
  vector,
} from "firebase/firestore";
import test from "node:test";

const sizeModule = await import("../src/lib/firestore/firestoreDocumentSize").catch(
  () => undefined,
) as
  | {
      APPLICATION_MAX_CALCULATED_BYTES?: number;
      calculateFirestoreDocumentSize?: (
        pathSegments: readonly string[],
        data: unknown,
      ) => number;
      assertFirestoreDocumentFitsApplicationCeiling?: (
        pathSegments: readonly string[],
        data: unknown,
      ) => number;
    }
  | undefined;

function calculate(
  pathSegments: readonly string[],
  data: unknown,
): number {
  assert.equal(
    typeof sizeModule?.calculateFirestoreDocumentSize,
    "function",
    "the published-formula document-size calculator must exist",
  );
  return sizeModule.calculateFirestoreDocumentSize!(pathSegments, data);
}

function assertFits(pathSegments: readonly string[], data: unknown): number {
  assert.equal(
    typeof sizeModule?.assertFirestoreDocumentFitsApplicationCeiling,
    "function",
    "the application-ceiling preflight must exist",
  );
  return sizeModule.assertFirestoreDocumentFitsApplicationCeiling!(pathSegments, data);
}

const app = initializeApp({ projectId: "futverse-firestore-size-tests" }, "size-tests");
const db = getFirestore(app);
const documentPath = ["proClubs", "club-1", "drillSubmissions", "s1"] as const;
const reference = doc(db, "clubs/c1/teams/t1");
const emptyDocumentSize = 84;

test("countsUtf8StringBytesAndFieldNames", () => {
  assert.equal(calculate(documentPath, { title: "🙂" }), 95);
});

test("countsNestedMapsAndArrays", () => {
  assert.equal(
    calculate(documentPath, {
      block: {
        label: "é",
        values: [true, 2],
      },
    }),
    147,
  );
});

test("countsTimestampAndDocumentName", () => {
  assert.equal(
    calculate(documentPath, {
      at: Timestamp.fromMillis(0),
      reference,
    }),
    139,
  );
});

test("includesFirestoreDocumentOverhead", () => {
  assert.equal(calculate(documentPath, {}), emptyDocumentSize);
});

test("countsEveryFirestorePrimitiveAndSdkValueType", () => {
  const cases: Array<{ name: string; value: unknown; bytes: number }> = [
    { name: "null", value: null, bytes: 1 },
    { name: "boolean", value: true, bytes: 1 },
    { name: "integer", value: 42, bytes: 8 },
    { name: "double", value: 3.5, bytes: 8 },
    { name: "Date", value: new Date(0), bytes: 8 },
    { name: "Timestamp", value: Timestamp.fromMillis(123), bytes: 8 },
    { name: "string", value: "é", bytes: 3 },
    { name: "Bytes", value: Bytes.fromUint8Array(new Uint8Array([1, 2, 3])), bytes: 3 },
    { name: "Uint8Array", value: new Uint8Array([1, 2, 3]), bytes: 3 },
    { name: "Reference", value: reference, bytes: 34 },
    { name: "GeoPoint", value: new GeoPoint(1, 2), bytes: 16 },
    { name: "array", value: [null, false, 3], bytes: 10 },
    { name: "map", value: { enabled: true }, bytes: 41 },
    { name: "vector", value: vector([1, 2, 3]), bytes: 24 },
  ];

  for (const { name, value, bytes } of cases) {
    assert.equal(calculate(documentPath, { v: value }), emptyDocumentSize + 2 + bytes, name);
  }
});

test("rejectsUnsupportedValuesAndMalformedDocumentPaths", () => {
  assert.equal(
    typeof sizeModule?.calculateFirestoreDocumentSize,
    "function",
    "the published-formula document-size calculator must exist",
  );
  for (const value of [
    undefined,
    1n,
    new Map([[
      "key",
      "value",
    ]]),
    new (class UnsupportedValue {})(),
  ]) {
    assert.throws(() => calculate(documentPath, { v: value }));
  }

  assert.throws(() => calculate(["proClubs", "club-1", "odd"], {}));
  assert.throws(() => calculate(["proClubs", ""], {}));
});

test("acceptsAtApplicationCeiling", () => {
  const ceiling = sizeModule?.APPLICATION_MAX_CALCULATED_BYTES;
  assert.equal(ceiling, 1_044_480);
  const exactPayload = "x".repeat(ceiling! - emptyDocumentSize - 8 - 1);
  assert.equal(calculate(documentPath, { payload: exactPayload }), ceiling);
  assert.equal(assertFits(documentPath, { payload: exactPayload }), ceiling);
});

test("rejectsAboveApplicationCeiling", () => {
  const ceiling = sizeModule?.APPLICATION_MAX_CALCULATED_BYTES;
  assert.equal(ceiling, 1_044_480);
  const payload = "x".repeat(ceiling! - emptyDocumentSize - 8);
  assert.equal(calculate(documentPath, { payload }), ceiling! + 1);
  assert.throws(() => assertFits(documentPath, { payload }), /submitted drill is too large/i);
});

test("preflightsTheFirestoreHardLimitOverflowBeforeAnyCreate", () => {
  const payload = "x".repeat(1_048_484);
  const data = { payload };
  assert.equal(calculate(documentPath, data), 1_048_577);

  let createCalls = 0;
  assert.throws(() => {
    assertFits(documentPath, data);
    createCalls += 1;
  }, /submitted drill is too large/i);
  assert.equal(createCalls, 0);
});

test("calculatesMaximumValidReviewDocumentSizes", () => {
  const maximumId = "c".repeat(1_500);
  const maximumUid = "u".repeat(128);
  const maximumNote = "\u0800".repeat(2_000);
  const timestamp = Timestamp.fromMillis(0);
  const reviewPath = [
    "proClubs",
    maximumId,
    "drillSubmissionReviews",
    maximumId,
  ];
  const common = {
    schemaVersion: 1,
    submissionId: maximumId,
    reviewerUid: maximumUid,
    reviewerRole: "TECHNICAL_DIRECTOR",
    reviewNote: maximumNote,
    reviewStartedAt: timestamp,
    reviewStartedBy: maximumUid,
    updatedAt: timestamp,
    updatedBy: maximumUid,
  };
  const needsRevision = calculate(reviewPath, {
    ...common,
    status: "NEEDS_REVISION",
    revisionRequestedAt: timestamp,
    revisionRequestedBy: maximumUid,
    approvedAt: null,
    approvedBy: null,
  });
  const approved = calculate(reviewPath, {
    ...common,
    status: "APPROVED",
    revisionRequestedAt: null,
    revisionRequestedBy: null,
    approvedAt: timestamp,
    approvedBy: maximumUid,
  });

  assert.equal(needsRevision, 11_352);
  assert.equal(approved, 11_346);
  assert.equal(Math.max(needsRevision, approved), 11_352);
  assert.ok(Math.max(needsRevision, approved) < 16_384);
  assert.ok(Math.max(needsRevision, approved) < 1_048_576);
});
