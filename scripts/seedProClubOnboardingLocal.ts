import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, Timestamp } from "firebase/firestore";

// Deliberately limited to the loopback demo project. Never uses an Admin SDK or service account.
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
const projectId = "demo-futverse-onboarding";
const password = "LocalClub123!";
const accounts = ["owner", "admin", "coach", "assistant"];
const uids: Record<string, string> = {};
for (const name of accounts) {
  const email = `${name}@proclub.test`;
  const call = async (action: string) => fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:${action}?key=demo-onboarding-key`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  }).then((response) => response.json());
  let result = await call("signUp");
  if (result.error?.message === "EMAIL_EXISTS") result = await call("signInWithPassword");
  assert.ok(typeof result.localId === "string", `Could not create local ${name} account`);
  uids[name] = result.localId;
}
const environment = await initializeTestEnvironment({
  projectId, firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") },
});
const clubId = "demo-pro-club";
const codes = { coach: `FUT-PC-${"A".repeat(24)}`, assistant: `FUT-PC-${"B".repeat(24)}` };
try {
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, "proClubs", clubId), { name: "FutVerse United", shortName: "FVU", level: "T3", status: "ACTIVE" });
    for (const name of accounts) {
      await setDoc(doc(firestore, "users", uids[name]), {
        name: `Local ${name}`, role: "USER", status: name === "owner" || name === "admin" ? "Active" : "Inactive",
        requestedRole: "COACH",
      });
    }
    for (const name of ["owner", "admin"]) {
      await setDoc(doc(firestore, "proClubs", clubId, "members", uids[name]), { authorizationRole: name.toUpperCase(), status: "ACTIVE" });
    }
    for (const name of ["coach", "assistant"] as const) {
      const at = Timestamp.now();
      await setDoc(doc(firestore, "proClubInvites", codes[name]), {
        schemaVersion: 1, inviteCode: codes[name], clubId, targetUid: uids[name],
        membershipAuthorizationRole: "MEMBER", staffRole: name === "coach" ? "HEAD_COACH" : "ASSISTANT_COACH",
        status: "ACTIVE", createdAt: at, createdBy: uids.owner, updatedAt: at, updatedBy: uids.owner,
        expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000),
      });
    }
  });
  console.log(JSON.stringify({ projectId, clubReference: clubId, accounts: accounts.map((name) => ({ email: `${name}@proclub.test`, password })), invitationCodes: codes }, null, 2));
} finally { await environment.cleanup(); }
