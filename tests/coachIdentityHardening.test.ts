import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  assertExactUidCoachMutationTarget,
  resolveExactUidCoachProfile,
} from "../src/services/coachIdentity.js";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const membershipServiceCode = readFileSync(
  path.resolve(testDirectory, "../src/services/membershipService.ts"),
  "utf8",
);

describe("Access A6-H4 exact UID-bound Coach identity", () => {
  it("does not reuse, modify, or link a same-email profile bound to a different UID", () => {
    const legacyProfile = {
      id: "legacy-profile",
      userId: "different-uid",
      email: "shared@example.com",
    };
    const before = structuredClone(legacyProfile);

    assert.deepEqual(resolveExactUidCoachProfile("claim-uid", []), {
      profileId: "claim-uid",
      matchedExistingProfile: false,
    });
    assert.throws(
      () => assertExactUidCoachMutationTarget("claim-uid", legacyProfile),
      /different UID or is not UID-bound/,
    );
    assert.deepEqual(legacyProfile, before);
  });

  it("reuses the single exact UID match even when its email differs", () => {
    assert.deepEqual(resolveExactUidCoachProfile("claim-uid", [{
      id: "existing-profile",
      userId: "claim-uid",
    }]), {
      profileId: "existing-profile",
      matchedExistingProfile: true,
    });
    assert.doesNotThrow(() => assertExactUidCoachMutationTarget(
      "claim-uid",
      { userId: "claim-uid", email: "old@example.com" },
    ));
  });

  it("fails missing, blank, padded, and path-like claim.userId values", () => {
    for (const userId of ["", "   ", " padded", "path/uid"]) {
      assert.throws(
        () => resolveExactUidCoachProfile(userId, []),
        /claim\.userId must be an exact Firestore document ID/,
      );
    }

    const validationIndex = membershipServiceCode.indexOf(
      'requireExactDocumentId(claim.userId, "claim.userId")',
    );
    const firstReadIndex = membershipServiceCode.indexOf(
      'getDoc(doc(db, "profile_claims", claim.id))',
    );
    assert.ok(validationIndex >= 0 && validationIndex < firstReadIndex);
  });

  it("fails closed when more than one Coach profile has the exact UID", () => {
    assert.throws(() => resolveExactUidCoachProfile("claim-uid", [
      { id: "coach-one", userId: "claim-uid" },
      { id: "coach-two", userId: "claim-uid" },
    ]), /Multiple Coach profiles are bound to the same Firebase UID/);
    assert.match(membershipServiceCode, /limit\(2\)/);
  });

  it("creates through exactly one deterministic UID-bound Coach target when no match exists", () => {
    const resolution = resolveExactUidCoachProfile("claim-uid", []);
    assert.equal(resolution.profileId, "claim-uid");
    assert.equal(resolution.matchedExistingProfile, false);
    assert.equal(
      membershipServiceCode.match(/transaction\.set\(\s*coachRef/g)?.length,
      1,
    );
    assert.match(
      membershipServiceCode,
      /coachSnapshot\?\.exists\(\)[\s\S]*?\{\s*userId:\s*storedClaim\.userId\s*\}/,
    );
  });

  it("keeps repeated approval idempotent at the same Coach profile", () => {
    const first = resolveExactUidCoachProfile("claim-uid", []);
    const repeated = resolveExactUidCoachProfile("claim-uid", [{
      id: first.profileId,
      userId: "claim-uid",
    }]);

    assert.equal(first.profileId, repeated.profileId);
    assert.doesNotThrow(() => assertExactUidCoachMutationTarget(
      "claim-uid",
      { userId: "claim-uid" },
    ));
  });

  it("does not resolve or write a Coach profile for ADMIN approval", () => {
    assert.match(
      membershipServiceCode,
      /requestedRole === "COACH"\s*\? await resolveCoachProfileIdentity[\s\S]*?: null/,
    );
    assert.match(
      membershipServiceCode,
      /if \(requestedRole === "COACH" && coachRef\)/,
    );
  });

  it("scopes Coach resolution and mutation to the exact requested Academy", () => {
    assert.match(
      membershipServiceCode,
      /collection\(db, "academies", academyId, "coaches"\)/,
    );
    assert.match(
      membershipServiceCode,
      /doc\(db, "academies", academyId, "coaches", coachProfileId\)/,
    );
    assert.doesNotMatch(membershipServiceCode, /collectionGroup/);
  });

  it("leaves legacy email-only profiles unchanged and refuses to claim their target slot", () => {
    const legacyProfile = { email: "claim@example.com", firstName: "Legacy" };
    const before = structuredClone(legacyProfile);

    assert.throws(
      () => assertExactUidCoachMutationTarget("claim-uid", legacyProfile),
      /not UID-bound/,
    );
    assert.deepEqual(legacyProfile, before);
  });

  it("contains no production email-based Coach identity fallback", () => {
    assert.doesNotMatch(
      membershipServiceCode,
      /where\(\s*["']email["']\s*,\s*["']==["']/,
    );
    assert.doesNotMatch(membershipServiceCode, /byEmail|findCoachProfileId/);
    assert.match(
      membershipServiceCode,
      /where\(\s*"userId"\s*,\s*"=="\s*,\s*claim\.userId\s*\)/,
    );
  });

  it("revalidates the exact UID target inside the atomic approval transaction", () => {
    const transactionIndex = membershipServiceCode.indexOf("return runTransaction");
    const identityAssertionIndex = membershipServiceCode.indexOf(
      "assertExactUidCoachMutationTarget(",
      transactionIndex,
    );
    const coachWriteIndex = membershipServiceCode.indexOf(
      "transaction.set(",
      identityAssertionIndex,
    );
    const firstApprovalWriteIndex = membershipServiceCode.indexOf(
      "transaction.set(",
      transactionIndex,
    );

    assert.ok(transactionIndex >= 0);
    assert.ok(identityAssertionIndex > transactionIndex);
    assert.ok(identityAssertionIndex < firstApprovalWriteIndex);
    assert.ok(coachWriteIndex > identityAssertionIndex);
    assert.doesNotMatch(membershipServiceCode, /\b(?:setDoc|addDoc|updateDoc)\s*\(/);
    assert.throws(
      () => assertExactUidCoachMutationTarget("claim-uid", { userId: "raced-uid" }),
      /different UID/,
    );
  });
});
