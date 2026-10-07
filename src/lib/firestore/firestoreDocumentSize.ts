import {
  Bytes,
  DocumentReference,
  GeoPoint,
  Timestamp,
  VectorValue,
} from "firebase/firestore";

export const FIRESTORE_DOCUMENT_HARD_LIMIT_BYTES = 1_048_576;
export const APPLICATION_MAX_CALCULATED_BYTES =
  FIRESTORE_DOCUMENT_HARD_LIMIT_BYTES - 4_096;
export const SUBMITTED_DRILL_TOO_LARGE_MESSAGE =
  "The submitted drill is too large to send. Reduce the uploaded image/work size and try again.";

export interface FirestoreMap {
  readonly [key: string]: FirestoreValue;
}

export type FirestoreValue =
  | null
  | boolean
  | number
  | string
  | Date
  | Uint8Array
  | Bytes
  | Timestamp
  | GeoPoint
  | DocumentReference
  | VectorValue
  | readonly FirestoreValue[]
  | FirestoreMap;

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function stringSize(value: string): number {
  return utf8ByteLength(value) + 1;
}

function validateDocumentPath(pathSegments: readonly string[]): void {
  if (!Array.isArray(pathSegments) || pathSegments.length === 0 || pathSegments.length % 2 !== 0) {
    throw new TypeError("A Firestore document path must contain collection/document pairs.");
  }

  for (const segment of pathSegments) {
    if (
      typeof segment !== "string" ||
      segment.length === 0 ||
      segment.includes("/") ||
      segment === "." ||
      segment === ".."
    ) {
      throw new TypeError("A Firestore document path contains an invalid segment.");
    }
  }
}

function documentNameSize(pathSegments: readonly string[]): number {
  validateDocumentPath(pathSegments);
  return 16 + pathSegments.reduce((total, segment) => total + stringSize(segment), 0);
}

function isPlainMap(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function mapValueSize(value: Record<string, unknown>): number {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError("Firestore maps cannot contain symbol keys.");
  }

  // Firestore maps use their field names and values plus the same 32-byte
  // map/document overhead; the enclosing map field name is counted by its parent.
  return 32 + Object.entries(value).reduce(
    (total, [fieldName, fieldValue]) =>
      total + stringSize(fieldName) + fieldValueSize(fieldValue),
    0,
  );
}

function referenceValueSize(value: DocumentReference): number {
  const segments = value.path.split("/");
  return documentNameSize(segments);
}

function fieldValueSize(value: unknown): number {
  if (value === null) return 1;
  if (typeof value === "boolean") return 1;
  if (typeof value === "number") return 8;
  if (typeof value === "string") return stringSize(value);
  if (value instanceof Date || value instanceof Timestamp) return 8;
  if (value instanceof Uint8Array) return value.byteLength;
  if (value instanceof Bytes) return value.toUint8Array().byteLength;
  if (value instanceof GeoPoint) return 16;
  if (value instanceof DocumentReference) return referenceValueSize(value);
  if (value instanceof VectorValue) return value.toArray().length * 8;

  if (Array.isArray(value)) {
    return value.reduce<number>((total, item) => total + fieldValueSize(item), 0);
  }

  if (typeof value === "object" && value !== null && isPlainMap(value)) {
    return mapValueSize(value);
  }

  throw new TypeError("Unsupported Firestore value; document size cannot be calculated safely.");
}

export function calculateFirestoreDocumentSize(
  pathSegments: readonly string[],
  data: Readonly<Record<string, FirestoreValue>>,
): number {
  const nameBytes = documentNameSize(pathSegments);
  if (data === null || typeof data !== "object" || Array.isArray(data) || !isPlainMap(data)) {
    throw new TypeError("Firestore document data must be a plain map.");
  }
  if (Object.getOwnPropertySymbols(data).length > 0) {
    throw new TypeError("Firestore document data cannot contain symbol keys.");
  }

  const fieldBytes = Object.entries(data).reduce(
    (total, [fieldName, value]) => total + stringSize(fieldName) + fieldValueSize(value),
    0,
  );
  return nameBytes + fieldBytes + 32;
}

export function assertFirestoreDocumentFitsApplicationCeiling(
  pathSegments: readonly string[],
  data: Readonly<Record<string, FirestoreValue>>,
): number {
  const size = calculateFirestoreDocumentSize(pathSegments, data);
  if (size > APPLICATION_MAX_CALCULATED_BYTES) {
    throw new RangeError(SUBMITTED_DRILL_TOO_LARGE_MESSAGE);
  }
  return size;
}
