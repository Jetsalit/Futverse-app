import { isValidDocumentIdentifier } from "./proClubModel";

/** Cloud Firestore document IDs are limited to 1,500 UTF-8 bytes. */
export const PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES = 1_500;

const utf8Encoder = new TextEncoder();

export function isWellFormedProClubTrainingUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const low = value.charCodeAt(index + 1);
      if (low < 0xdc00 || low > 0xdfff) return false;
      index += 1;
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) return false;
  }
  return true;
}

export function proClubTrainingUtf8ByteLength(value: string): number {
  return utf8Encoder.encode(value).byteLength;
}

/**
 * Drill references are persisted as Firestore document identifiers. Keep this
 * validation separate from generic UI character limits because UTF-8 byte
 * length, not JavaScript string length, is the storage boundary.
 */
export function isStorageSafeProClubTrainingDrillReference(
  value: unknown,
): value is string {
  if (!isValidDocumentIdentifier(value)) return false;
  if (!isWellFormedProClubTrainingUnicode(value)) return false;
  if (value === "." || value === "..") return false;
  if (/^__.*__$/.test(value)) return false;
  return (
    proClubTrainingUtf8ByteLength(value) <=
    PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES
  );
}
