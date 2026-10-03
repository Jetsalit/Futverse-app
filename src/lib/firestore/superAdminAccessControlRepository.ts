import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../firebase";
import type { TenantRole } from "../../types/Membership";
import type { ProClubStaffRole } from "../../types/ProClub";

export type SuperAdminAccessOrganizationType = "ACADEMY" | "PRO_CLUB";

export interface ProClubExpectedState {
  membership: { authorizationRole: string; status: string } | null;
  staff: { staffRole: string; status: string } | null;
  pointerExists: boolean;
}

export interface AcademyExpectedState {
  membership: {
    role: string;
    status: string;
    source: string;
    joinedBy: string;
    approvalClaimId?: string;
  } | null;
  specialty: { specialty: string; status: string } | null;
}

interface BaseAccessControlMutationInput {
  actorUid: string;
  targetUid: string;
  organizationId: string;
  organizationType: SuperAdminAccessOrganizationType;
  presentationModeActive: boolean;
}

export type AccessControlMutationInput =
  | (BaseAccessControlMutationInput & {
      organizationType: "PRO_CLUB";
      desiredStaffRole: ProClubStaffRole;
      expectedActionType: string | null;
      confirmedActionType?: string | null;
      expectedState: ProClubExpectedState;
    })
  | (BaseAccessControlMutationInput & {
      organizationType: "ACADEMY";
      desiredAcademyRole: TenantRole;
      desiredFitnessCoach: boolean;
      expectedActionType: string | null;
      confirmedActionType?: string | null;
      expectedState: AcademyExpectedState;
    });

export interface AccessControlMutationResult {
  actionId: string | null;
  actionType: string | null;
  decisionState: string;
  previousState: ProClubExpectedState | AcademyExpectedState | unknown;
  newState: ProClubExpectedState | AcademyExpectedState | unknown;
}

export type SuperAdminAccessControlCallableRequest =
  | ({ operation: "MANAGE_ACCESS"; targetUid: string; organizationId: string; presentationModeActive: false;
      expectedActionType: string | null; confirmedActionType: string | null; expectedState: unknown } & (
      { organizationType: "PRO_CLUB"; desiredStaffRole: ProClubStaffRole }
      | { organizationType: "ACADEMY"; desiredAcademyRole: TenantRole; desiredFitnessCoach: boolean }
    ))
  | { operation: "SET_ACADEMY_SPECIALTY_STATUS"; organizationId: string; targetUid: string; nextStatus: "ACTIVE" | "INACTIVE" };

export type AccessControlCallable = (
  request: SuperAdminAccessControlCallableRequest,
) => Promise<AccessControlMutationResult>;

export function createSuperAdminAccessControlClient(dependencies: {
  getAuthenticatedUid: () => string | null;
  call: AccessControlCallable;
}) {
  return {
    async mutate(input: AccessControlMutationInput): Promise<AccessControlMutationResult> {
      if (input.presentationModeActive !== false) {
        throw new Error("Direct access management is unavailable while Support or Work As is active.");
      }
      if (!input.actorUid || dependencies.getAuthenticatedUid() !== input.actorUid) {
        throw new Error("Authenticated Firebase actor does not match the requested SuperAdmin actor.");
      }
      const request: SuperAdminAccessControlCallableRequest = input.organizationType === "PRO_CLUB"
        ? {
          operation: "MANAGE_ACCESS",
          organizationType: "PRO_CLUB",
          organizationId: input.organizationId,
          targetUid: input.targetUid,
          presentationModeActive: false,
          desiredStaffRole: input.desiredStaffRole,
          expectedActionType: input.expectedActionType,
          confirmedActionType: input.confirmedActionType ?? null,
          expectedState: input.expectedState,
        }
        : {
          operation: "MANAGE_ACCESS",
          organizationType: "ACADEMY",
          organizationId: input.organizationId,
          targetUid: input.targetUid,
          presentationModeActive: false,
          desiredAcademyRole: input.desiredAcademyRole,
          desiredFitnessCoach: input.desiredFitnessCoach,
          expectedActionType: input.expectedActionType,
          confirmedActionType: input.confirmedActionType ?? null,
          expectedState: input.expectedState,
        };
      return dependencies.call(request);
    },
    async setAcademySpecialtyStatus(
      actorUid: string,
      academyId: string,
      targetUid: string,
      nextStatus: "ACTIVE" | "INACTIVE",
    ): Promise<void> {
      if (!actorUid || dependencies.getAuthenticatedUid() !== actorUid) {
        throw new Error("Authenticated Firebase actor does not match the requested SuperAdmin actor.");
      }
      await dependencies.call({
        operation: "SET_ACADEMY_SPECIALTY_STATUS",
        organizationId: academyId,
        targetUid,
        nextStatus,
      });
    },
  };
}

const callable = httpsCallable<SuperAdminAccessControlCallableRequest, AccessControlMutationResult>(
  functions,
  "manageSuperAdminAccessControlV1",
);

const client = createSuperAdminAccessControlClient({
  getAuthenticatedUid: () => auth.currentUser?.uid ?? null,
  async call(request) {
    const response = await callable(request);
    return response.data;
  },
});

export async function mutateSuperAdminAccessAtomically(
  input: AccessControlMutationInput,
): Promise<AccessControlMutationResult> {
  return client.mutate(input);
}

export async function setSuperAdminAcademyFitnessCoachStatus(
  actorUid: string,
  academyId: string,
  targetUid: string,
  nextStatus: "ACTIVE" | "INACTIVE",
): Promise<void> {
  return client.setAcademySpecialtyStatus(actorUid, academyId, targetUid, nextStatus);
}
