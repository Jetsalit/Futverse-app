import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RESOLUTION_ERROR_CODES,
  normalizeAndValidateEmail,
  validateAndNormalizeCandidateRequest,
} from "../functions/src/proClubStaffCandidateResolution/core.ts";

describe("Candidate Resolution Core Validators", () => {
  it("normalizes and validates clean email", () => {
    assert.equal(
      normalizeAndValidateEmail("  Coach.Test@Example.COM  "),
      "coach.test@example.com",
    );
  });

  it("rejects non-string email", () => {
    assert.throws(
      () => normalizeAndValidateEmail(12345),
      (err: any) => err.code === RESOLUTION_ERROR_CODES.INVALID_REQUEST,
    );
  });

  it("rejects partial email or wildcards", () => {
    for (const invalid of [
      "coach*@example.com",
      "*@example.com",
      "coach?@example.com",
      "coach@example,com",
      "coach@example;com",
      "coach @example.com",
      "notanemail",
      "@example.com",
      "coach@",
    ]) {
      assert.throws(
        () => normalizeAndValidateEmail(invalid),
        (err: any) => err.code === RESOLUTION_ERROR_CODES.INVALID_REQUEST,
        `Should reject: ${invalid}`,
      );
    }
  });

  it("validates strict body keys (no extra unexpected keys)", () => {
    assert.throws(
      () =>
        validateAndNormalizeCandidateRequest({
          clubId: "club-1",
          email: "test@example.com",
          requesterUid: "spoofed-uid", // Extra key forbidden
        }),
      (err: any) => err.code === RESOLUTION_ERROR_CODES.INVALID_REQUEST,
    );
  });

  it("validates clubId format", () => {
    assert.throws(
      () =>
        validateAndNormalizeCandidateRequest({
          clubId: "invalid/club/path",
          email: "test@example.com",
        }),
      (err: any) => err.code === RESOLUTION_ERROR_CODES.INVALID_REQUEST,
    );
  });
});
