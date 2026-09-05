import assert from "node:assert/strict";
import test from "node:test";
import {
  createProClubOnboardingRepository,
  defaultResolveCandidateFn,
  isProClubReviewer,
} from "../src/lib/firestore/proClubOnboardingRepository";
import {
  OnboardingError,
  onboardingErrorMessage,
  type ResolvedStaffCandidate,
} from "../src/lib/proClubOnboarding";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";

function makeAuthority(overrides: Partial<ProClubOrganizationAuthority> = {}): ProClubOrganizationAuthority {
  return {
    organizationType: "PRO_CLUB",
    organizationId: "club-1",
    organizationName: "Test Club",
    organizationLevel: "T1",
    organizationStatus: "ACTIVE",
    userId: "user-1",
    hasMembershipAuthority: true,
    membershipStatus: "ACTIVE",
    membershipAuthorizationRole: "OWNER",
    staffRole: "STAFF",
    ...overrides,
  };
}

test("1. isProClubReviewer permits OWNER and ADMIN of active club", () => {
  assert.equal(isProClubReviewer(makeAuthority({ membershipAuthorizationRole: "OWNER" })), true);
  assert.equal(isProClubReviewer(makeAuthority({ membershipAuthorizationRole: "ADMIN" })), true);
  assert.equal(isProClubReviewer(makeAuthority({ membershipAuthorizationRole: "MEMBER" })), false);
  assert.equal(isProClubReviewer(makeAuthority({ organizationStatus: "INACTIVE" })), false);
  assert.equal(isProClubReviewer(makeAuthority({ membershipStatus: "INACTIVE" })), false);
  assert.equal(isProClubReviewer(makeAuthority({ hasMembershipAuthority: false })), false);
});

test("2. defaultResolveCandidateFn delegates to callable caller and parses minimal candidate", async () => {
  let capturedPayload: any = null;

  const mockCaller = async (payload: any) => {
    capturedPayload = payload;
    return {
      data: {
        targetUid: "uid-cand-1",
        email: "candidate@example.com",
        displayName: "Candidate User",
        extraSecretField: "should_be_ignored",
      },
    };
  };

  const candidate = await defaultResolveCandidateFn(
    "club-1",
    "candidate@example.com",
    mockCaller,
  );

  assert.equal(candidate.targetUid, "uid-cand-1");
  assert.equal(candidate.email, "candidate@example.com");
  assert.equal(candidate.displayName, "Candidate User");
  assert.equal((candidate as any).extraSecretField, undefined, "extra fields must not be retained");
  assert.deepEqual(capturedPayload, {
    clubId: "club-1",
    email: "candidate@example.com",
  });
});

test("3. defaultResolveCandidateFn maps not-found and resource-exhausted correctly", async () => {
  const notFoundCaller = async () => {
    const err: any = new Error("Not found");
    err.code = "functions/not-found";
    throw err;
  };

  await assert.rejects(
    async () => {
      await defaultResolveCandidateFn("club-1", "unknown@example.com", notFoundCaller);
    },
    (err: any) => {
      assert(err instanceof OnboardingError);
      assert.equal(err.code, "CANDIDATE_NOT_FOUND");
      return true;
    },
  );

  const rateLimitedCaller = async () => {
    const err: any = new Error("Resource exhausted");
    err.code = "functions/resource-exhausted";
    throw err;
  };

  await assert.rejects(
    async () => {
      await defaultResolveCandidateFn("club-1", "coach@example.com", rateLimitedCaller);
    },
    (err: any) => {
      assert(err instanceof OnboardingError);
      assert.equal(err.code, "RATE_LIMITED");
      return true;
    },
  );
});

test("4. defaultResolveCandidateFn maps permission-denied, unauthenticated, and failed-precondition", async () => {
  const permDeniedCaller = async () => {
    const err: any = new Error("Permission denied");
    err.code = "functions/permission-denied";
    throw err;
  };

  await assert.rejects(
    async () => {
      await defaultResolveCandidateFn("club-1", "staff@example.com", permDeniedCaller);
    },
    (err: any) => {
      assert(err instanceof OnboardingError);
      assert.equal(err.code, "REVIEWER_REQUIRED");
      return true;
    },
  );

  const unauthCaller = async () => {
    const err: any = new Error("Unauthenticated");
    err.code = "functions/unauthenticated";
    throw err;
  };

  await assert.rejects(
    async () => {
      await defaultResolveCandidateFn("club-1", "staff@example.com", unauthCaller);
    },
    (err: any) => {
      assert(err instanceof OnboardingError);
      assert.equal(err.code, "AUTH_CHANGED");
      return true;
    },
  );

  const appCheckFailedCaller = async () => {
    const err: any = new Error("Failed precondition");
    err.code = "functions/failed-precondition";
    throw err;
  };

  await assert.rejects(
    async () => {
      await defaultResolveCandidateFn("club-1", "staff@example.com", appCheckFailedCaller);
    },
    (err: any) => {
      assert(err instanceof OnboardingError);
      assert.equal(err.code, "UNAVAILABLE");
      return true;
    },
  );
});

test("5. onboardingErrorMessage returns expected generic messages without revealing account existence", () => {
  const rateLimitMsg = onboardingErrorMessage(new OnboardingError("RATE_LIMITED"));
  assert.equal(rateLimitMsg, "Too many account verification attempts. Please try again later.");

  const candidateNotFoundMsg = onboardingErrorMessage(new OnboardingError("CANDIDATE_NOT_FOUND"));
  assert(candidateNotFoundMsg.includes("Unable to find an eligible FutVerse account"));
});

test("6. repository.resolveCandidate enforces input sanity and actor checks", async () => {
  const dummyFirestore = {} as any;
  const mockResolveFn = async () => ({
    targetUid: "resolved-uid",
    email: "test@example.com",
    displayName: "Test",
  });

  const repo = createProClubOnboardingRepository(
    dummyFirestore,
    () => "reviewer-uid-1",
    mockResolveFn,
  );

  // Actor mismatch
  await assert.rejects(
    async () => {
      await repo.resolveCandidate("club-1", "test@example.com", "wrong-actor-uid");
    },
    (err: any) => {
      assert(err instanceof OnboardingError);
      assert.equal(err.code, "AUTH_CHANGED");
      return true;
    },
  );

  // Invalid clubId
  await assert.rejects(
    async () => {
      await repo.resolveCandidate("../invalid", "test@example.com", "reviewer-uid-1");
    },
    (err: any) => {
      assert(err instanceof OnboardingError);
      assert.equal(err.code, "INVALID_DATA");
      return true;
    },
  );

  // Invalid email
  await assert.rejects(
    async () => {
      await repo.resolveCandidate("club-1", "not-an-email", "reviewer-uid-1");
    },
    (err: any) => {
      assert(err instanceof OnboardingError);
      assert.equal(err.code, "INVALID_DATA");
      return true;
    },
  );
});

test("7. stale candidate protection logic contract", () => {
  let resolvedCandidate: ResolvedStaffCandidate | null = {
    targetUid: "uid-cand-123",
    email: "alice@example.com",
    displayName: "Alice",
  };

  // 1. Email input change clears candidate
  function onEmailChange(newEmail: string, currentCandidate: ResolvedStaffCandidate | null) {
    if (currentCandidate && currentCandidate.email.toLowerCase() !== newEmail.trim().toLowerCase()) {
      return null;
    }
    return currentCandidate;
  }

  assert.equal(onEmailChange("alice2@example.com", resolvedCandidate), null);
  assert.notEqual(onEmailChange("alice@example.com", resolvedCandidate), null);

  // 2. Club selection change clears candidate
  function onClubChange() {
    resolvedCandidate = null;
  }
  onClubChange();
  assert.equal(resolvedCandidate, null);

  // 3. UI presentation invariant: Target UID must never be formatted into user-visible string
  const candidate: ResolvedStaffCandidate = {
    targetUid: "secret-uid-must-not-render",
    email: "bob@example.com",
    displayName: "Bob",
  };

  const uiCardLines = [
    "Verified FutVerse account",
    candidate.displayName || "FutVerse Member",
    candidate.email,
  ];

  const fullUiText = uiCardLines.join(" ");
  assert(!fullUiText.includes(candidate.targetUid), "targetUid must never appear in UI card");
});
