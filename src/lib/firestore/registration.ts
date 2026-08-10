import type { User } from "firebase/auth";
import {
  doc,
  serverTimestamp,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../firebase";

export const REGISTRATION_LOG_ID_PREFIX = "user_registered_";

export function registrationLogId(uid: string): string {
  return `${REGISTRATION_LOG_ID_PREFIX}${uid}`;
}

export async function createUserWithRegistrationLog(
  user: Pick<User, "uid" | "email">,
  userData: Omit<DocumentData, "uid" | "email"> & { requestedRole: string },
): Promise<void> {
  if (!user.email) {
    throw new Error("A verified Firebase email is required to register.");
  }

  const canonicalUserData = {
    ...userData,
    uid: user.uid,
    email: user.email,
  };
  const batch = writeBatch(db);

  batch.set(doc(db, "users", user.uid), canonicalUserData);
  batch.set(doc(db, "logs", registrationLogId(user.uid)), {
    action: "USER_REGISTERED",
    userId: user.uid,
    email: user.email,
    requestedRole: canonicalUserData.requestedRole,
    timestamp: serverTimestamp(),
  });

  await batch.commit();
}
