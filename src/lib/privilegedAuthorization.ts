export type PrivilegedRole = "SUPERADMIN" | "DATA_ADMIN";

export interface PrivilegedActor {
  id?: unknown;
  role?: unknown;
  status?: unknown;
  assignedClients?: unknown;
}

export const ACTIVE_PRIVILEGED_STATUSES = ["Active", "ACTIVE"] as const;

export function isExplicitlyActivePrivilegedStatus(
  status: unknown,
): status is (typeof ACTIVE_PRIVILEGED_STATUSES)[number] {
  return status === "Active" || status === "ACTIVE";
}

export function isActivePrivilegedActor(
  actor: PrivilegedActor | null | undefined,
  eligibleRoles: readonly PrivilegedRole[],
): boolean {
  return Boolean(
    actor &&
      isExplicitlyActivePrivilegedStatus(actor.status) &&
      eligibleRoles.some((role) => actor.role === role),
  );
}

export function hasClientPermission(
  authoritativeActor: PrivilegedActor | null | undefined,
  presentedUser: PrivilegedActor | null | undefined,
  allowedRoles: readonly string[],
): boolean {
  if (!presentedUser) return false;
  if (presentedUser.role === "SUPERADMIN") {
    return isActivePrivilegedActor(authoritativeActor, ["SUPERADMIN"]);
  }
  if (presentedUser.role === "DATA_ADMIN") {
    return (
      allowedRoles.includes("DATA_ADMIN") &&
      isActivePrivilegedActor(authoritativeActor, ["DATA_ADMIN"])
    );
  }
  return (
    typeof presentedUser.role === "string" &&
    allowedRoles.includes(presentedUser.role)
  );
}

export function canImpersonateUser(
  authoritativeActor: PrivilegedActor | null | undefined,
  targetUser: PrivilegedActor | null | undefined,
): boolean {
  if (!targetUser || typeof targetUser.id !== "string" || !targetUser.id) {
    return false;
  }
  if (isActivePrivilegedActor(authoritativeActor, ["SUPERADMIN"])) {
    return true;
  }
  return (
    isActivePrivilegedActor(authoritativeActor, ["DATA_ADMIN"]) &&
    Array.isArray(authoritativeActor?.assignedClients) &&
    authoritativeActor.assignedClients.includes(targetUser.id)
  );
}
