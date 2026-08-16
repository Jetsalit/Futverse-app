import App from "./App";
import { useSuperAdminNonStaffSupport } from "./contexts/SuperAdminNonStaffSupportContext";
import { SuperAdminNonStaffWorkAsLauncher } from "./components/superadmin/SuperAdminNonStaffWorkAsLauncher";
import { SuperAdminNonStaffWorkAsShell } from "./components/superadmin/SuperAdminNonStaffWorkAsShell";

export default function SupportAwareRoot() {
  const nonStaffSupport = useSuperAdminNonStaffSupport();

  if (nonStaffSupport.isActive) {
    return <SuperAdminNonStaffWorkAsShell />;
  }

  return (
    <>
      <App />
      <SuperAdminNonStaffWorkAsLauncher />
    </>
  );
}
