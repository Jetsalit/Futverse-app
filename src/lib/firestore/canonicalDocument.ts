import type { DocumentData } from "firebase/firestore";

export interface FirestoreSnapshotLike {
  readonly id: string;
  data(): DocumentData | undefined;
}

export type CanonicalDocument<T extends object> = Omit<T, "id"> & {
  id: string;
};

/**
 * Maps stored document data while keeping the Firestore snapshot path as the
 * only source of document identity. The returned object is a new value and the
 * snapshot data is never mutated.
 */
export function mapCanonicalSnapshot<T extends object = DocumentData>(
  snapshot: FirestoreSnapshotLike,
): CanonicalDocument<T> {
  const data = snapshot.data();
  if (!data) {
    throw new Error("Cannot map a Firestore snapshot without document data.");
  }

  return {
    ...(data as T),
    id: snapshot.id,
  } as CanonicalDocument<T>;
}

/** Removes the UI-only canonical document ID before data is sent to Firestore. */
export function withoutCanonicalDocumentId<T extends object>(
  value: T,
): Omit<T, "id"> {
  const { id: _canonicalDocumentId, ...data } = value as T & { id?: unknown };
  return data;
}
