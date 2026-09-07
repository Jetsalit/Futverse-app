import assert from "node:assert/strict";
import test from "node:test";

import {
  AppCheckVerificationError,
  createServerAppCheckTokenVerifier,
  isKnownInvalidAppCheckTokenError,
} from "../functions/src/lib/serverAppCheckTokenVerifier.ts";

const expectedAppId = "1:123:web:expected";

function createVerifier(verifyToken: (token: string) => Promise<{ appId: string }>) {
  return createServerAppCheckTokenVerifier({ verifyToken }, [expectedAppId]);
}

test("server App Check verifier accepts a verified token from the expected app", async () => {
  const verifier = createVerifier(async (token) => {
    assert.equal(token, "valid-app-check-token");
    return { appId: expectedAppId };
  });

  assert.equal(
    await verifier.verifyHeader("valid-app-check-token"),
    expectedAppId,
  );
});

test("server App Check verifier rejects missing, blank, and padded headers", async () => {
  const verifier = createVerifier(async () => ({ appId: expectedAppId }));

  for (const value of [undefined, null, "", " token "]) {
    await assert.rejects(
      () => verifier.verifyHeader(value),
      (error: unknown) => error instanceof AppCheckVerificationError,
    );
  }
});

test("known invalid App Check token errors map to privacy-safe unauthorized domain error", async () => {
  const invalidErrors = [
    {
      code: "app-check/app-check-token-expired",
      message: "The provided App Check token has expired.",
    },
    {
      code: "app-check/invalid-argument",
      message: "Decoding App Check token failed. Make sure you passed the entire string JWT.",
    },
    {
      code: "app-check/invalid-argument",
      message: "The provided App Check token has invalid signature.",
    },
  ];

  for (const invalidError of invalidErrors) {
    assert.equal(isKnownInvalidAppCheckTokenError(invalidError), true);
    const verifier = createVerifier(async () => {
      throw invalidError;
    });

    await assert.rejects(
      () => verifier.verifyHeader("bad-token"),
      (error: unknown) =>
        error instanceof AppCheckVerificationError &&
        !error.message.includes(invalidError.message),
    );
  }
});

test("operational App Check verifier failures propagate to the internal-error gate", async () => {
  const operationalErrors = [
    {
      code: "app-check/invalid-credential",
      message: "Must initialize app with a cert credential or set project ID.",
    },
    {
      code: "app-check/invalid-argument",
      message: "Error fetching public keys for Google certs: network unavailable",
    },
  ];

  for (const operationalError of operationalErrors) {
    assert.equal(isKnownInvalidAppCheckTokenError(operationalError), false);
    const verifier = createVerifier(async () => {
      throw operationalError;
    });

    await assert.rejects(
      () => verifier.verifyHeader("valid-looking-token"),
      (error: unknown) => error === operationalError,
    );
  }
});

test("server App Check verifier rejects a decoded token without canonical appId", async () => {
  const verifier = createVerifier(async () => ({ appId: "   " }));

  await assert.rejects(
    () => verifier.verifyHeader("valid-looking-token"),
    (error: unknown) => error instanceof AppCheckVerificationError,
  );
});

test("server App Check verifier rejects a valid token minted for a sibling Firebase app", async () => {
  const verifier = createVerifier(async () => ({ appId: "1:123:web:sibling" }));

  await assert.rejects(
    () => verifier.verifyHeader("valid-sibling-app-token"),
    (error: unknown) =>
      error instanceof AppCheckVerificationError &&
      /unauthorized app/i.test(error.message),
  );
});

test("server App Check verifier requires a non-empty canonical expected app allowlist", () => {
  assert.throws(
    () => createServerAppCheckTokenVerifier({ async verifyToken() { return { appId: expectedAppId }; } }, []),
    /requires canonical expected app IDs/,
  );
  assert.throws(
    () => createServerAppCheckTokenVerifier({ async verifyToken() { return { appId: expectedAppId }; } }, [" bad-app-id "]),
    /requires canonical expected app IDs/,
  );
});
