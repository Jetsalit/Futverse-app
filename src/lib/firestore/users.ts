import { collection, onSnapshot } from "firebase/firestore";
import type { DocumentData, Unsubscribe } from "firebase/firestore";
import type { User } from "../../contexts/AuthContext";
import { db } from "../firebase";
import { mapCanonicalSnapshot } from "./canonicalDocument";

export interface UserSnapshot {
  docs: ReadonlyArray<{
    id: string;
    data: () => DocumentData;
  }>;
}

export type UserSnapshotSource = (
  onNext: (snapshot: UserSnapshot) => void,
  onError: (error: Error) => void,
) => Unsubscribe;

export const mapUserSnapshot = (snapshot: UserSnapshot): User[] =>
  snapshot.docs.map((userDoc) => {
    const { uid: _storedUid, ...canonicalUser } = mapCanonicalSnapshot<User>(userDoc);
    return canonicalUser as User;
  });

export const subscribeToUserSnapshots = (
  source: UserSnapshotSource,
  callback: (users: User[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe => {
  return source(
    (snapshot) => callback(mapUserSnapshot(snapshot)),
    (error) => onError?.(error),
  );
};

export const subscribeToUsers = (
  callback: (users: User[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe => {
  return subscribeToUserSnapshots(
    (handleSnapshot, handleError) =>
      onSnapshot(collection(db, "users"), handleSnapshot, handleError),
    callback,
    onError,
  );
};
