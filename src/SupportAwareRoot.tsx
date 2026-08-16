import App from "./App";
import { useAuth } from "./contexts/AuthContext";
import { useSuperAdminSupport } from "./contexts/SuperAdminSupportContext";
import { useSuperAdminNonStaffSupport } from "./contexts/SuperAdminNonStaffSupportContext";
import { SuperAdminNonStaffWorkAsLauncher } from "./components/superadmin/SuperAdminNonStaffWorkAsLauncher";
import { SuperAdminNonStaffWorkAsShell } from "./components/superadmin/SuperAdminNonStaffWorkAsShell";
import { SuperAdminParentLinkLauncher } from "./components/superadmin/SuperAdminParentLinkLauncher";
import { SuperAdminStaffPresentationGate } from "./components/superadmin/SuperAdminStaffPresentationGate";

export default function SupportAwareRoot() {
  const { currentUser } = useAuth();
  const staffSupport = useSuperAdminSupport();
  const nonStaffSupport = useSuperAdminNonStaffSupport();

  if (nonStaffSupport.isActive) {
    return <SuperAdminNonStaffWorkAsShell />;
  }

  if (staffSupport.isStaffWorkMode && staffSupport.supportSubject) {
    const presentedUid = currentUser?.uid || currentUser?.id || null;
    const expectedUid = staffSupport.supportSubject.uid;
    const expectedRole = staffSupport.supportSubject.tenantRole;
    const hasExactPresentedIdentity = Boolean(
      currentUser?.supportPresentation === true &&
        presentedUid === expectedUid &&
        currentUser.role === expectedRole &&
        (currentUser.status === "ACTIVE" || currentUser.status === "Active"),
    );

    if (!hasExactPresentedIdentity) {
      return <SuperAdminStaffPresentationGate />;
    }
  }

  const supportToolsAvailable = !staffSupport.isSupportActive;

  return (
    <>
      <App />
      {supportToolsAvailable && (
        <>
          <SuperAdminNonStaffWorkAsLauncher />
          <SuperAdminParentLinkLauncher />
        </>
      )}
    </>
  );
}
