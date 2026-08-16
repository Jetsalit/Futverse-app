import App from "./App";
import { useSuperAdminSupport } from "./contexts/SuperAdminSupportContext";
import { useSuperAdminNonStaffSupport } from "./contexts/SuperAdminNonStaffSupportContext";
import { SuperAdminNonStaffWorkAsLauncher } from "./components/superadmin/SuperAdminNonStaffWorkAsLauncher";
import { SuperAdminNonStaffWorkAsShell } from "./components/superadmin/SuperAdminNonStaffWorkAsShell";

export default function SupportAwareRoot() {
  const staffSupport = useSuperAdminSupport();
  const nonStaffSupport = useSuperAdminNonStaffSupport();

  if (nonStaffSupport.isActive) {
    return <SuperAdminNonStaffWorkAsShell />;
  }

  return (
    <>
      <App />
      {!staffSupport.isSupportActive && <SuperAdminNonStaffWorkAsLauncher />}
    </>
  );
}
