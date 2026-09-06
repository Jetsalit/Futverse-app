import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import {
  isCanonicalRequesterAccountActive,
  RequesterAccountStatusReadError,
} from "../functions/src/proClubStaffCandidateResolution/requesterAccountStatus.ts";

function createFirestoreWithUser(
  data: Record<string, unknown> | null,
  options: { throwOnRead?: boolean } = {},
): Firestore {
  return {
    collection(name: string) {
      assert.equal(name, "users");
      return {
        doc(uid: string) {
          return {
            async get() {
              if (options.throwOnRead) {
                throw new Error("simulated firestore outage");
              }
              return {
                exists: data !== null,
                data: () => data ?? undefined,
                id: uid,
              };
            },
          };
        },
      };
    },
  } as unknown as Firestore;
}

test("1. canonical ACTIVE requester account is accepted", async () => {
  const firestore = createFirestoreWithUser({ status: "ACTIVE" });
  assert.equal(
    await isCanonicalRequesterAccountActive(firestore, "owner-uid"),
    true,
  );
});

test("2. legacy canonical Active requester account is accepted", async () => {
  const firestore = createFirestoreWithUser({ status: "Active" });
  assert.equal(
    await isCanonicalRequesterAccountActive(firestore, "owner-uid"),
    true,
  );
});

test("3. missing requester user document is denied", async () => {
  const firestore = createFirestoreWithUser(null);
  assert.equal(
    await isCanonicalRequesterAccountActive(firestore, "owner-uid"),
    false,
  );
});

test("4. REJECTED and INACTIVE requester accounts are denied", async () => {
  for (const status of ["REJECTED", "INACTIVE", "PENDING", "SUSPENDED", ""]) {
    const firestore = createFirestoreWithUser({ status });
    assert.equal(
      await isCanonicalRequesterAccountActive(firestore, "owner-uid"),
      false,
      `status ${status || "<empty>"} must be denied`,
    );
  }
});

test("5. invalid requester UID is denied before Firestore read", async () => {
  let reads = 0;
  const firestore = {
    collection() {
      reads += 1;
      throw new Error("must not be reached");
    },
  } as unknown as Firestore;

  for (const uid of ["", " owner", "owner ", "owner/uid"]) {
    assert.equal(await isCanonicalRequesterAccountActive(firestore, uid), false);
  }
  assert.equal(reads, 0);
});

test("6. requester account read failure fails closed with typed error", async () => {
  const firestore = createFirestoreWithUser(
    { status: "ACTIVE" },
    { throwOnRead: true },
  );

  await assert.rejects(
    isCanonicalRequesterAccountActive(firestore, "owner-uid"),
    (error: unknown) => error instanceof RequesterAccountStatusReadError,
  );
});

test("7. production callable checks requester account status before resolver dispatch", () => {
  const indexSource = readFileSync("functions/src/index.ts", "utf8");
  const resolverStart = indexSource.indexOf(
    "export const resolveProClubStaffCandidateV1",
  );
  assert.ok(resolverStart >= 0, "resolver export not found");

  const resolverSource = indexSource.slice(resolverStart);
  const accountStatusGate = resolverSource.indexOf(
    "await isCanonicalRequesterAccountActive(",
  );
  const resolverDispatch = resolverSource.indexOf(
    "return await executeResolveProClubStaffCandidateCallable(",
  );

  assert.ok(accountStatusGate >= 0, "requester account-status gate not found");
  assert.ok(resolverDispatch >= 0, "resolver dispatch not found");
  assert.ok(
    accountStatusGate < resolverDispatch,
    "requester account-status gate must run before resolver dispatch",
  );
});
