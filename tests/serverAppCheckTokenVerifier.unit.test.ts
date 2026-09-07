import assert from "node:assert/strict";
import test from "node:test";

import {
  AppCheckVerificationError,
  createServerAppCheckTokenVerifier,
} from "../functions/src/lib/serverAppCheckTokenVerifier.ts";

test("server App Check verifier accepts a verified token and returns appId", async () => {
  const verifier = createServerAppCheckTokenVerifier({
    async verifyToken(token) {
      assert.equal(token, "valid-app-check-token");
      return { appId: "1:123:web:abc" };
    },
  });

  assert.equal(
    await verifier.verifyHeader("valid-app-check-token"),
    "1:123:web:abc",
  );
});

test("server App Check verifier rejects missing, blank, and padded headers", async () => {
  const verifier = createServerAppCheckTokenVerifier({
    async verifyToken() {
      return { appId: "should-not-run" };
    },
  });

  for (const value of [undefined, null, "", " token "]) {
    await assert.rejects(
      () => verifier.verifyHeader(value),
      (error: unknown) => error instanceof AppCheckVerificationError,
    );
  }
});

test("server App Check verifier maps token verification failure to safe domain error", async () => {
  const verifier = createServerAppCheckTokenVerifier({
    async verifyToken() {
      throw new Error("private verifier detail");
    },
  });

  await assert.rejects(
    () => verifier.verifyHeader("bad-token"),
    (error: unknown) =>
      error instanceof AppCheckVerificationError &&
      !error.message.includes("private verifier detail"),
  );
});

test("server App Check verifier rejects a decoded token without canonical appId", async () => {
  const verifier = createServerAppCheckTokenVerifier({
    async verifyToken() {
      return { appId: "   " };
    },
  });

  await assert.rejects(
    () => verifier.verifyHeader("valid-looking-token"),
    (error: unknown) => error instanceof AppCheckVerificationError,
  );
});
