import type { SuperAdminTab } from "./dashboardModel";

export type SuperAdminPrimarySectionId =
  | "command_center"
  | "users_access"
  | "organizations"
  | "integrity_center"
  | "audit_logs"
  | "notifications"
  | "support_tools"
  | "reports";

export type SuperAdminPrimarySectionKind =
  | "tabs"
  | "shell"
  | "action";

export interface SuperAdminNavigationSection {
  readonly id: SuperAdminPrimarySectionId;
  readonly label: string;
  readonly description: string;
  readonly kind: SuperAdminPrimarySectionKind;
  readonly tabs: readonly SuperAdminTab[];
  readonly defaultTab: SuperAdminTab | null;
}

export const SUPERADMIN_PRIMARY_NAVIGATION: readonly SuperAdminNavigationSection[] = [
  {
    id: "command_center",
    label: "Command Center",
    description: "Platform overview, review queues, and operational signals.",
    kind: "tabs",
    tabs: ["dashboard"],
    defaultTab: "dashboard",
  },
  {
    id: "users_access",
    label: "Users & Access",
    description: "Account review, access relationships, and profile claims.",
    kind: "tabs",
    tabs: ["approvals", "users", "relationships", "profile_claims"],
    defaultTab: "relationships",
  },
  {
    id: "organizations",
    label: "Organizations",
    description: "Academy and organization directory and workspace entry.",
    kind: "tabs",
    tabs: ["academies"],
    defaultTab: "academies",
  },
  {
    id: "integrity_center",
    label: "Integrity Center",
    description: "Legacy preservation and integrity review tools.",
    kind: "tabs",
    tabs: ["bootstrap_legacy"],
    defaultTab: "bootstrap_legacy",
  },
  {
    id: "audit_logs",
    label: "Audit Logs",
    description: "System and administrative audit evidence.",
    kind: "tabs",
    tabs: ["system_logs"],
    defaultTab: "system_logs",
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Global notification destination owned by the application shell.",
    kind: "shell",
    tabs: [],
    defaultTab: null,
  },
  {
    id: "support_tools",
    label: "Support Tools",
    description:
      "Controlled global tools for support workflows, payments, and match-observation configuration.",
    kind: "tabs",
    tabs: ["observation_metrics", "payment_approvals"],
    defaultTab: "observation_metrics",
  },
  {
    id: "reports",
    label: "Reports",
    description: "Global reporting and export actions.",
    kind: "action",
    tabs: [],
    defaultTab: null,
  },
];

export function findSuperAdminSectionForTab(
  tab: SuperAdminTab,
): SuperAdminNavigationSection | undefined {
  return SUPERADMIN_PRIMARY_NAVIGATION.find((section) =>
    section.tabs.includes(tab),
  );
}

export function getSuperAdminPrimarySection(
  sectionId: SuperAdminPrimarySectionId,
): SuperAdminNavigationSection | undefined {
  return SUPERADMIN_PRIMARY_NAVIGATION.find(
    (section) => section.id === sectionId,
  );
}

export function isSuperAdminTabInSection(
  tab: SuperAdminTab,
  sectionId: SuperAdminPrimarySectionId,
): boolean {
  return (
    getSuperAdminPrimarySection(sectionId)?.tabs.includes(tab) === true
  );
}