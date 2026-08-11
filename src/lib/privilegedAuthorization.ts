export type PrivilegedRole = "SUPERADMIN" | "DATA_ADMIN";

export interface PrivilegedActor {
  id?: unknown;
  role?: unknown;
  status?: unknown;
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
    isExplicitlyActivePrivilegedStatus(authoritativeActor?.status) &&
    authoritativeActor?.role === presentedUser.role &&
    isExplicitlyActivePrivilegedStatus(presentedUser.status) &&
    typeof presentedUser.role === "string" &&
    allowedRoles.includes(presentedUser.role)
  );
}
