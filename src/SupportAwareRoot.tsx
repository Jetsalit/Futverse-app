import App from "./App";
import { useAuth } from "./contexts/AuthContext";
import { useSuperAdminSupport } from "./contexts/SuperAdminSupportContext";
import { useSuperAdminNonStaffSupport } from "./contexts/SuperAdminNonStaffSupportContext";
import { SuperAdminNonStaffSupportBar } from "./components/superadmin/SuperAdminNonStaffSupportBar";
import { SuperAdminNonStaffPresentationGate } from "./components/superadmin/SuperAdminNonStaffPresentationGate";
import { SuperAdminStaffPresentationGate } from "./components/superadmin/SuperAdminStaffPresentationGate";
import { SuperAdminStaffAuthorityGate } from "./components/superadmin/SuperAdminStaffAuthorityGate";

export default function SupportAwareRoot() {
  const { currentUser } = useAuth();
  const staffSupport = useSuperAdminSupport();
  const nonStaffSupport = useSuperAdminNonStaffSupport();

  if (nonStaffSupport.isActive && nonStaffSupport.session) {
    const presentedUid = currentUser?.uid || currentUser?.id || null;
    const expectedUid = nonStaffSupport.session.subject.uid;
    const expectedRole = nonStaffSupport.session.subject.role;
    const hasExactPresentedIdentity = Boolean(
      currentUser?.supportPresentation === true &&
        presentedUid === expectedUid &&
        currentUser.role === expectedRole &&
        (currentUser.status === "ACTIVE" || currentUser.status === "Active"),
    );

    if (!hasExactPresentedIdentity) {
      return <SuperAdminNonStaffPresentationGate />;
    }
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

  const appKey = nonStaffSupport.isActive && nonStaffSupport.session
    ? `nonstaff:${nonStaffSupport.session.academyId}:${nonStaffSupport.session.subject.uid}:${nonStaffSupport.session.startedAt}`
    : staffSupport.isSupportActive && staffSupport.session
      ? `staff:${staffSupport.session.academyId}:${staffSupport.session.mode}:${staffSupport.session.subject?.uid || "workspace"}:${staffSupport.session.startedAt}`
      : "normal";

  return (
    <>
      {nonStaffSupport.isActive && <SuperAdminNonStaffSupportBar />}
      <App key={appKey} />
      {staffSupport.isStaffWorkMode &&
        staffSupport.isStaffAuthorityRevalidating && (
          <SuperAdminStaffAuthorityGate />
        )}
    </>
  );
}
