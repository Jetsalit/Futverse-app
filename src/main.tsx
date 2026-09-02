import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SupportAwareRoot from "./SupportAwareRoot.tsx";
import "./index.css";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider } from "./contexts/AuthContext";
import { OrganizationRuntimeProvider } from "./contexts/OrganizationRuntimeContext";
import { SuperAdminSupportProvider } from "./contexts/SuperAdminSupportContext";
import { SuperAdminNonStaffSupportProvider } from "./contexts/SuperAdminNonStaffSupportContext";
import { SupportPresentedUserBridge } from "./contexts/SupportPresentedUserBridge";
import { AcademyProvider } from "./contexts/AcademyContext";
import { ErrorBoundary } from "./ErrorBoundary.tsx";

window.addEventListener("error", (event) => {
  console.error(
    "Global error caught:",
    event.message,
    event.filename,
    event.lineno,
    event.colno,
    event.error,
  );
  // event.preventDefault(); // Don't prevent default, just log
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <OrganizationRuntimeProvider>
          <SuperAdminSupportProvider>
            <SuperAdminNonStaffSupportProvider>
              <SupportPresentedUserBridge>
                <AcademyProvider>
                  <LanguageProvider>
                    <SupportAwareRoot />
                  </LanguageProvider>
                </AcademyProvider>
              </SupportPresentedUserBridge>
            </SuperAdminNonStaffSupportProvider>
          </SuperAdminSupportProvider>
        </OrganizationRuntimeProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);

// Force rebuild for Firebase Deploy
