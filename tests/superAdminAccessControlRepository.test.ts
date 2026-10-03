import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSuperAdminAccessControlClient,
  type AccessControlMutationInput,
  type SuperAdminAccessControlCallableRequest,
} from "../src/lib/firestore/superAdminAccessControlRepository";

function proInput(overrides: Record<string, unknown> = {}): AccessControlMutationInput {
  return {
    actorUid: "superadmin",
    organizationType: "PRO_CLUB",
    organizationId: "club-a",
    targetUid: "coach-a",
    presentationModeActive: false,
    desiredStaffRole: "HEAD_COACH",
    expectedActionType: "ACCESS_ASSIGNED",
    confirmedActionType: "ACCESS_ASSIGNED",
    expectedState: { membership: null, staff: null, pointerExists: false },
    ...overrides,
  } as AccessControlMutationInput;
}

function createClient(authenticatedUid: string | null = "superadmin") {
  const calls: SuperAdminAccessControlCallableRequest[] = [];
  const client = createSuperAdminAccessControlClient({
    getAuthenticatedUid: () => authenticatedUid,
    async call(request) {
      calls.push(request);
      return { actionId: "server-audit-id", actionType: "ACCESS_ASSIGNED", decisionState: "ASSIGN", previousState: {}, newState: {} };
    },
  });
  return { client, calls };
}

describe("SuperAdmin access callable client", () => {
  it("requires the signed-in actor to match and blocks Support or Work As mode", async () => {
    const mismatched = createClient("someone-else");
    await assert.rejects(mismatched.client.mutate(proInput()));
    assert.equal(mismatched.calls.length, 0);

    const presentation = createClient();
    await assert.rejects(presentation.client.mutate(proInput({ presentationModeActive: true })));
    assert.equal(presentation.calls.length, 0);
  });

  it("sends the Pro Club decision preview to the callable without a client-supplied actor", async () => {
    const { client, calls } = createClient();
    const result = await client.mutate(proInput());
    assert.deepEqual(calls, [{
      operation: "MANAGE_ACCESS",
      organizationType: "PRO_CLUB",
      organizationId: "club-a",
      targetUid: "coach-a",
      presentationModeActive: false,
      desiredStaffRole: "HEAD_COACH",
      expectedActionType: "ACCESS_ASSIGNED",
      confirmedActionType: "ACCESS_ASSIGNED",
      expectedState: { membership: null, staff: null, pointerExists: false },
    }]);
    assert.equal("actorUid" in calls[0], false);
    assert.equal(result.actionId, "server-audit-id");
  });

  it("sends the Academy shape without Pro Club fields", async () => {
    const { client, calls } = createClient();
    await client.mutate(proInput({
      organizationType: "ACADEMY",
      organizationId: "academy-a",
      desiredStaffRole: undefined,
      desiredAcademyRole: "COACH",
      desiredFitnessCoach: true,
      expectedActionType: "ACADEMY_MEMBERSHIP_ASSIGNED",
      confirmedActionType: "ACADEMY_MEMBERSHIP_ASSIGNED",
      expectedState: { membership: null, specialty: null },
    }));
    assert.deepEqual(calls[0], {
      operation: "MANAGE_ACCESS",
      organizationType: "ACADEMY",
      organizationId: "academy-a",
      targetUid: "coach-a",
      presentationModeActive: false,
      desiredAcademyRole: "COACH",
      desiredFitnessCoach: true,
      expectedActionType: "ACADEMY_MEMBERSHIP_ASSIGNED",
      confirmedActionType: "ACADEMY_MEMBERSHIP_ASSIGNED",
      expectedState: { membership: null, specialty: null },
    });
    assert.equal("desiredStaffRole" in calls[0], false);
  });

  it("routes SuperAdmin specialty changes through the callable", async () => {
    const { client, calls } = createClient();
    await client.setAcademySpecialtyStatus("superadmin", "academy-a", "coach-a", "INACTIVE");
    assert.deepEqual(calls, [{
      operation: "SET_ACADEMY_SPECIALTY_STATUS",
      organizationId: "academy-a",
      targetUid: "coach-a",
      nextStatus: "INACTIVE",
    }]);
  });
});
