import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  mapUserSnapshot,
  subscribeToUserSnapshots,
} from "../src/lib/firestore/users.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const userServiceSource = readFileSync(
  path.join(repoRoot, "src/lib/firestore/users.ts"),
  "utf8",
);
const portalSource = readFileSync(
  path.join(repoRoot, "src/components/SuperadminPortal.tsx"),
  "utf8",
);

describe("Access A6-H3 SuperAdmin user control plane", () => {
  it("contains no mock user inventory or hardcoded SUPERADMIN identity in the user service", () => {
    assert.doesNotMatch(userServiceSource, /Mock data|mock unsubscribe/i);
    assert.doesNotMatch(userServiceSource, /Super Admin|Coach John/);
    assert.doesNotMatch(userServiceSource, /role\s*:\s*["']SUPERADMIN["']/);
    assert.doesNotMatch(userServiceSource, /callback\s*\(\s*\[/);
  });

  it("subscribes to the authoritative Firestore users collection", () => {
    assert.match(
      userServiceSource,
      /onSnapshot\s*\(\s*collection\s*\(\s*db\s*,\s*["']users["']\s*\)/,
    );
  });

  it("publishes an empty user list for an empty snapshot", () => {
    let publishedUsers: unknown;

    subscribeToUserSnapshots(
      (onNext) => {
        onNext({ docs: [] });
        return () => undefined;
      },
      (users) => {
        publishedUsers = users;
      },
    );

    assert.deepEqual(publishedUsers, []);
  });

  it("reports a read error without publishing fallback user data", () => {
    const readError = new Error("permission denied");
    let publishCount = 0;
    let receivedError: Error | undefined;

    subscribeToUserSnapshots(
      (_onNext, onError) => {
        onError(readError);
        return () => undefined;
      },
      () => {
        publishCount += 1;
      },
      (error) => {
        receivedError = error;
      },
    );

    assert.equal(publishCount, 0);
    assert.equal(receivedError, readError);
  });

  it("keeps the Firestore document ID canonical without fabricating incomplete fields", () => {
    const users = mapUserSnapshot({
      docs: [
        {
          id: "authoritative-doc-id",
          data: () => ({
            id: "field-controlled-id",
            email: "sparse@example.com",
          }),
        },
      ],
    });

    assert.deepEqual(users, [
      {
        id: "authoritative-doc-id",
        email: "sparse@example.com",
      },
    ]);
    assert.equal(Object.hasOwn(users[0]!, "role"), false);
    assert.equal(Object.hasOwn(users[0]!, "status"), false);
  });

  it("returns and preserves the source unsubscribe function", () => {
    let unsubscribeCount = 0;
    const sourceUnsubscribe = () => {
      unsubscribeCount += 1;
    };

    const unsubscribe = subscribeToUserSnapshots(
      () => sourceUnsubscribe,
      () => undefined,
    );

    assert.equal(unsubscribe, sourceUnsubscribe);
    unsubscribe();
    assert.equal(unsubscribeCount, 1);
  });

  it("keeps SuperadminPortal free of imported or constructed mock users", () => {
    assert.doesNotMatch(portalSource, /Super Admin|Coach John|mockUsers/i);
    assert.match(portalSource, /useState\s*<\s*User\[\]\s*>\s*\(\s*\[\s*\]\s*\)/);
    assert.doesNotMatch(
      portalSource,
      /useState\s*<\s*User\[\]\s*>\s*\(\s*\[\s*\{/,
    );
    assert.match(
      portalSource,
      /subscribeToUsers\s*\([\s\S]*?setUsers\s*\(\s*firestoreUsers/,
    );
  });
});
