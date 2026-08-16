import App from "./App";
import { useSuperAdminSupport } from "./contexts/SuperAdminSupportContext";
import { useSuperAdminNonStaffSupport } from "./contexts/SuperAdminNonStaffSupportContext";
import { SuperAdminNonStaffWorkAsLauncher } from "./components/superadmin/SuperAdminNonStaffWorkAsLauncher";
import { SuperAdminNonStaffWorkAsShell } from "./components/superadmin/SuperAdminNonStaffWorkAsShell";
import { SuperAdminParentLinkLauncher } from "./components/superadmin/SuperAdminParentLinkLauncher";

export default function SupportAwareRoot() {
  const staffSupport = useSuperAdminSupport();
  const nonStaffSupport = useSuperAdminNonStaffSupport();

  if (nonStaffSupport.isActive) {
    return <SuperAdminNonStaffWorkAsShell />;
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
