import type { Firestore } from "firebase-admin/firestore";
import { isValidDocumentIdentifier } from "./core.ts";

export class RequesterAccountStatusReadError extends Error {
  constructor() {
    super("Requester account status could not be verified");
    this.name = "RequesterAccountStatusReadError";
  }
}

export async function isCanonicalRequesterAccountActive(
  firestore: Firestore,
  requesterUid: string,
): Promise<boolean> {
  if (!isValidDocumentIdentifier(requesterUid)) {
    return false;
  }

  let snapshot;
  try {
    snapshot = await firestore.collection("users").doc(requesterUid).get();
  } catch {
    throw new RequesterAccountStatusReadError();
  }

  if (!snapshot.exists) {
    return false;
  }

  const status = snapshot.data()?.status;
  return status === "ACTIVE" || status === "Active";
}
