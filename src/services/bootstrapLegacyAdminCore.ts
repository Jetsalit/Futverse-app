export type BootstrapPlanAction =
  | { type: "SET_MEMBER", path: string, data: any }
  | { type: "MERGE_USER", path: string, data: any }
  | { type: "SET_INVITE", path: string, data: any };

export type BootstrapResult =
  | { status: "REJECTED"; reason: string }
  | { status: "ALREADY_BOOTSTRAPPED"; reason: string; plan: never[] }
  | { status: "SUCCESS"; plan: BootstrapPlanAction[] };

export interface DocumentSnapshot<T = any> {
  exists: boolean;
  id: string;
  data?: T;
}

export interface BootstrapActor {
  uid: string;
  role: string;
  confirmation: string;
}

export function evaluateBootstrapPlan(
  actor: BootstrapActor,
  academySnap: DocumentSnapshot,
  userSnap: DocumentSnapshot,
  memberSnap: DocumentSnapshot,
  inviteSnap: DocumentSnapshot,
  serverTimestampFn: () => any
): BootstrapResult {
  const TARGET_ACADEMY_ID = "BaBH6XFlcSgpYTbDLhmbBshp2rm1";
  const TARGET_UID = "BaBH6XFlcSgpYTbDLhmbBshp2rm1";
  const INVITE_CODE = "FUT-TDIZ";
  const CONFIRM_TEXT = "BOOTSTRAP_TALUMBALL_MAX_ADMIN";

  // 1. Pure Authorization Input
  if (!actor.uid) {
    return { status: "REJECTED", reason: "Actor UID is missing." };
  }
  if (actor.role !== "SUPERADMIN") {
    return { status: "REJECTED", reason: "UNAUTHORIZED: SUPERADMIN role required." };
  }
  if (actor.confirmation !== CONFIRM_TEXT) {
    return { status: "REJECTED", reason: "Confirmation code mismatch." };
  }

  // 2. Exact Snapshot ID Validation
  if (academySnap.id !== TARGET_ACADEMY_ID) {
    return { status: "REJECTED", reason: "Academy document ID mismatch." };
  }
  if (userSnap.id !== TARGET_UID) {
    return { status: "REJECTED", reason: "User document ID mismatch." };
  }

  // 3. Academy Validation
  if (!academySnap.exists || !academySnap.data) {
    return { status: "REJECTED", reason: `Academy ${TARGET_ACADEMY_ID} does not exist.` };
  }
  if (academySnap.data.name !== "Talumball Academy") {
    return { status: "REJECTED", reason: "Academy name mismatch." };
  }
  if (!academySnap.data.inviteCode) {
    return { status: "REJECTED", reason: "Academy inviteCode missing." };
  }
  if (academySnap.data.inviteCode !== INVITE_CODE) {
    return { status: "REJECTED", reason: "Academy inviteCode mismatch." };
  }

  // 4. Legacy Admin User Validation
  if (!userSnap.exists || !userSnap.data) {
    return { status: "REJECTED", reason: `User ${TARGET_UID} does not exist.` };
  }
  if (!userSnap.data.uid) {
    return { status: "REJECTED", reason: "User data.uid missing." };
  }
  if (userSnap.data.uid !== TARGET_UID) {
    return { status: "REJECTED", reason: "User data.uid mismatch." };
  }
  if (userSnap.data.role !== "ADMIN") {
    return { status: "REJECTED", reason: `User role mismatch. Expected ADMIN, got ${userSnap.data.role}.` };
  }
  if (userSnap.data.status !== "Active") {
    return { status: "REJECTED", reason: `User status mismatch. Expected 'Active', got ${userSnap.data.status}.` };
  }

  // 5. Evaluate Member
  let memberNeedsWrite = true;
  if (memberSnap.exists && memberSnap.data) {
    const m = memberSnap.data;
    const expectedMemberKeys = [
      "userId",
      "academyId",
      "role",
      "status",
      "source",
      "joinedAt",
      "joinedBy",
      "updatedAt",
    ];
    const memberKeys = Object.keys(m);
    if (
      memberKeys.length !== expectedMemberKeys.length ||
      !expectedMemberKeys.every((key) => Object.prototype.hasOwnProperty.call(m, key))
    ) {
      return { status: "REJECTED", reason: "Membership schema conflict." };
    }
    if (
      m.userId === TARGET_UID &&
      m.academyId === TARGET_ACADEMY_ID &&
      m.role === "ADMIN" &&
      m.source === "LEGACY_MIGRATION" &&
      m.status === "ACTIVE" &&
      m.approvalClaimId === undefined &&
      m.joinedAt != null &&
      m.joinedBy != null &&
      m.updatedAt != null
    ) {
      memberNeedsWrite = false;
    } else {
      if (m.userId !== TARGET_UID) return { status: "REJECTED", reason: "Membership userId conflict." };
      if (m.academyId !== TARGET_ACADEMY_ID) return { status: "REJECTED", reason: "Membership academyId conflict." };
      if (m.role !== "ADMIN") return { status: "REJECTED", reason: "Membership role conflict." };
      if (m.source !== "LEGACY_MIGRATION") return { status: "REJECTED", reason: "Membership source conflict." };
      if (m.status !== "ACTIVE") return { status: "REJECTED", reason: "Membership status conflict." };
      if (m.approvalClaimId !== undefined) return { status: "REJECTED", reason: "Membership unexpected approvalClaimId." };
      if (m.joinedAt == null) return { status: "REJECTED", reason: "Membership joinedAt missing." };
      if (m.joinedBy == null) return { status: "REJECTED", reason: "Membership joinedBy missing." };
      if (m.updatedAt == null) return { status: "REJECTED", reason: "Membership updatedAt missing." };
    }
  }

  // 6. Evaluate User
  let userNeedsWrite = true;
  const u = userSnap.data;

  if (
    u.activeAcademyId != null &&
    u.activeAcademyId !== "" &&
    u.activeAcademyId !== TARGET_ACADEMY_ID
  ) {
    return { status: "REJECTED", reason: "User activeAcademyId conflict." };
  }

  if (
    u.academyId != null &&
    u.academyId !== "" &&
    u.academyId !== TARGET_ACADEMY_ID
  ) {
    return { status: "REJECTED", reason: "User academyId conflict." };
  }

  if (
    u.tenantRole != null &&
    u.tenantRole !== "" &&
    u.tenantRole !== "ADMIN"
  ) {
    return { status: "REJECTED", reason: "User tenantRole conflict." };
  }
  if (
    u.activeAcademyId === TARGET_ACADEMY_ID &&
    u.academyId === TARGET_ACADEMY_ID &&
    u.tenantRole === "ADMIN" &&
    u.role === "ADMIN" &&
    u.status === "Active"
  ) {
    userNeedsWrite = false;
  }

  // 7. Evaluate Invite
  let inviteNeedsWrite = true;
  if (inviteSnap.exists && inviteSnap.data) {
    const i = inviteSnap.data;
    const expectedInviteKeys = [
      "inviteCode",
      "academyId",
      "status",
      "createdAt",
      "createdBy",
      "updatedAt",
      "updatedBy",
    ];
    const inviteKeys = Object.keys(i);
    if (
      inviteKeys.length !== expectedInviteKeys.length ||
      !expectedInviteKeys.every((key) => Object.prototype.hasOwnProperty.call(i, key))
    ) {
      return { status: "REJECTED", reason: "Invite schema conflict." };
    }

    if (i.academyId !== TARGET_ACADEMY_ID) {
      return { status: "REJECTED", reason: "Invite is bound to another Academy." };
    }
    if (i.inviteCode !== INVITE_CODE) {
      return { status: "REJECTED", reason: "Invite code conflict." };
    }
    if (i.status !== "ACTIVE") {
      return { status: "REJECTED", reason: "Invite status conflict." };
    }
    if (i.createdAt == null) {
      return { status: "REJECTED", reason: "Invite createdAt missing." };
    }
    if (i.createdBy == null) {
      return { status: "REJECTED", reason: "Invite createdBy missing." };
    }
    if (i.updatedAt == null) {
      return { status: "REJECTED", reason: "Invite updatedAt missing." };
    }
    if (i.updatedBy == null) {
      return { status: "REJECTED", reason: "Invite updatedBy missing." };
    }
    inviteNeedsWrite = false;
  }

  // Finalize Plan
  if (!memberNeedsWrite && !userNeedsWrite && !inviteNeedsWrite) {
    return {
      status: "ALREADY_BOOTSTRAPPED",
      reason: "All target data is already exact.",
      plan: []
    };
  }

  const plan: BootstrapPlanAction[] = [];

  if (memberNeedsWrite) {
    const memberData: any = {
      userId: TARGET_UID,
      academyId: TARGET_ACADEMY_ID,
      role: "ADMIN",
      status: "ACTIVE",
      source: "LEGACY_MIGRATION",
      joinedAt: serverTimestampFn(),
      joinedBy: actor.uid,
      updatedAt: serverTimestampFn()
    };
    plan.push({ type: "SET_MEMBER", path: `academies/${TARGET_ACADEMY_ID}/members/${TARGET_UID}`, data: memberData });
  }

  if (userNeedsWrite) {
    plan.push({
      type: "MERGE_USER",
      path: `users/${TARGET_UID}`,
      data: {
        activeAcademyId: TARGET_ACADEMY_ID,
        academyId: TARGET_ACADEMY_ID,
        tenantRole: "ADMIN",
        role: "ADMIN",
        status: "Active",
        updatedAt: serverTimestampFn()
      }
    });
  }

  if (inviteNeedsWrite) {
    const inviteData: any = {
      inviteCode: INVITE_CODE,
      academyId: TARGET_ACADEMY_ID,
      status: "ACTIVE",
      createdAt: serverTimestampFn(),
      createdBy: actor.uid,
      updatedAt: serverTimestampFn(),
      updatedBy: actor.uid
    };
    plan.push({ type: "SET_INVITE", path: `academy_invites/${INVITE_CODE}`, data: inviteData });
  }

  return { status: "SUCCESS", plan };
}
