import { useAuth, type User } from "../contexts/AuthContext";
import { useSuperAdminSupport } from "../contexts/SuperAdminSupportContext";
import { useSuperAdminNonStaffSupport } from "../contexts/SuperAdminNonStaffSupportContext";

export interface EffectiveIdentity {
  actualUser: User | null;
  presentedUser: User | null;
  role: string;
  isWorkAsActive: boolean;
  mode: "NORMAL" | "ACADEMY_WORKSPACE" | "WORK_AS_STAFF" | "WORK_AS_NONSTAFF";
}

export function useEffectiveIdentity(): EffectiveIdentity {
  const { actualUser, currentUser } = useAuth();
  const staffSupport = useSuperAdminSupport();
  const nonStaffSupport = useSuperAdminNonStaffSupport();

  if (nonStaffSupport.isActive && nonStaffSupport.effectiveUser) {
    return {
      actualUser,
      presentedUser: nonStaffSupport.effectiveUser,
      role: nonStaffSupport.presentationRole,
      isWorkAsActive: true,
      mode: "WORK_AS_NONSTAFF",
    };
  }

  if (staffSupport.isSupportActive) {
    return {
      actualUser,
      presentedUser: currentUser,
      role: staffSupport.presentationRole,
      isWorkAsActive: staffSupport.isStaffWorkMode,
      mode: staffSupport.isStaffWorkMode ? "WORK_AS_STAFF" : "ACADEMY_WORKSPACE",
    };
  }

  return {
    actualUser,
    presentedUser: currentUser,
    role: currentUser?.role || "USER",
    isWorkAsActive: false,
    mode: "NORMAL",
  };
}
