import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import {
  executeSubmitProPlayerOnboardingClaimCallableV1,
} from "../functions/src/proPlayerOnboardingClaimSubmission/callableHandler.ts";
import {
  ProPlayerClaimSubmissionServiceError,
  PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES,
} from "../functions/src/proPlayerOnboardingClaimSubmission/service.ts";

function service(resultOrError: unknown) {
  return {
    submitClaim: async () => {
      if (resultOrError instanceof Error) throw resultOrError;
      return resultOrError as any;
    },
  };
}

async function expectHttps(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => error instanceof HttpsError && error.code === code);
}

test("App Check and Firebase auth are mandatory before service invocation", async () => {
  await expectHttps(
    executeSubmitProPlayerOnboardingClaimCallableV1(
      { auth: { uid: "player-1" }, data: {} },
      { service: service({ status: "PENDING", created: true, idempotent: false }) },
    ),
    "failed-precondition",
  );
  await expectHttps(
    executeSubmitProPlayerOnboardingClaimCallableV1(
      { app: { appId: "staging-app" }, data: {} },
      { service: service({ status: "PENDING", created: true, idempotent: false }) },
    ),
    "unauthenticated",
  );
});

test("success response is privacy-minimal and contains no profile or salary", async () => {
  const response = await executeSubmitProPlayerOnboardingClaimCallableV1(
    { auth: { uid: "player-1", token: { role: "ADMIN" } }, app: { appId: "staging-app" }, data: { profile: {} } },
    { service: service({ status: "PENDING", created: true, idempotent: false }) },
  );
  assert.deepEqual(response, { ok: true, status: "PENDING", created: true, idempotent: false });
  const serialized = JSON.stringify(response);
  for (const forbidden of ["profile", "expectedSalary", "monthlyAmount", "futId", "playerKey"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("domain failures map to safe callable error codes", async () => {
  const cases = [
    [PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.INVALID_REQUEST, "invalid-argument"],
    [PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.FORBIDDEN, "permission-denied"],
    [PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.CONFLICT, "already-exists"],
    [PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.RATE_LIMIT_EXCEEDED, "resource-exhausted"],
    [PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.INVALID_DATA, "internal"],
  ] as const;
  for (const [domainCode, httpsCode] of cases) {
    await expectHttps(
      executeSubmitProPlayerOnboardingClaimCallableV1(
        { auth: { uid: "player-1" }, app: { appId: "staging-app" }, data: {} },
        { service: service(new ProPlayerClaimSubmissionServiceError(domainCode, "sensitive detail")) },
      ),
      httpsCode,
    );
  }
});
