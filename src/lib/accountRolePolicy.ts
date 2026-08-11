export const REGISTRATION_INTENT_OPTIONS = [
  { value: "COACH", label: "Coach", authority: "MEMBERSHIP" },
  { value: "PLAYER", label: "Player", authority: "ACCOUNT" },
  { value: "SCOUT", label: "Scout", authority: "ACCOUNT" },
  { value: "PARENT", label: "Parent", authority: "ACCOUNT" },
] as const;

export const REGISTRATION_INTENTS = REGISTRATION_INTENT_OPTIONS.map(
  (option) => option.value,
);

export const SAFE_ACCOUNT_ROLES = ["USER", "PLAYER", "SCOUT", "PARENT"] as const;
export const TENANT_MEMBERSHIP_ROLES = ["ADMIN", "COACH"] as const;
export const PRIVILEGED_ACCOUNT_ROLES = ["SUPERADMIN", "DATA_ADMIN"] as const;

export type RegistrationIntent = (typeof REGISTRATION_INTENT_OPTIONS)[number]["value"];
export type SafeAccountRole = (typeof SAFE_ACCOUNT_ROLES)[number];
export type TenantMembershipRole = (typeof TENANT_MEMBERSHIP_ROLES)[number];
export type PrivilegedAccountRole = (typeof PRIVILEGED_ACCOUNT_ROLES)[number];

export const ACTIVE_ACCOUNT_STATUSES = ["Active", "ACTIVE"] as const;

export function isExplicitlyActiveAccountStatus(
  status: unknown,
): status is (typeof ACTIVE_ACCOUNT_STATUSES)[number] {
  return status === "Active" || status === "ACTIVE";
}

export type RequestedIntentAssessment =
  | {
      kind: "SAFE_ACCOUNT_INTENT";
      intent: Exclude<RegistrationIntent, TenantMembershipRole>;
      display: string;
    }
  | {
      kind: "TENANT_MEMBERSHIP_INTENT";
      intent: TenantMembershipRole;
      display: string;
    }
  | {
      kind: "BLOCKED";
      display: string;
      reason: string;
    };

function isOneOf<const T extends readonly string[]>(
  value: unknown,
  values: T,
): value is T[number] {
  return typeof value === "string" && values.some((candidate) => candidate === value);
}

export function isRegistrationIntent(value: unknown): value is RegistrationIntent {
  return isOneOf(value, REGISTRATION_INTENTS);
}

export function isSafeAccountRole(value: unknown): value is SafeAccountRole {
  return isOneOf(value, SAFE_ACCOUNT_ROLES);
}

export function isTenantMembershipRole(value: unknown): value is TenantMembershipRole {
  return isOneOf(value, TENANT_MEMBERSHIP_ROLES);
}

export function isPrivilegedAccountRole(value: unknown): value is PrivilegedAccountRole {
  return isOneOf(value, PRIVILEGED_ACCOUNT_ROLES);
}

function malformedIntentLabel(value: unknown): string {
  if (value === undefined) return "Missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "Array";
  if (typeof value === "object") return "Object";
  if (typeof value === "string") return value.length > 0 ? value : "Empty string";
  return `${typeof value}: ${String(value)}`;
}

export function assessRequestedIntent(value: unknown): RequestedIntentAssessment {
  if (isTenantMembershipRole(value)) {
    return {
      kind: "TENANT_MEMBERSHIP_INTENT",
      intent: value,
      display: `${value} (pending Membership intent)`,
    };
  }

  if (isRegistrationIntent(value) && isSafeAccountRole(value)) {
    return {
      kind: "SAFE_ACCOUNT_INTENT",
      intent: value,
      display: `${value} (requested account intent)`,
    };
  }

  const label = malformedIntentLabel(value);
  const reason = isPrivilegedAccountRole(value)
    ? "Privileged requestedRole metadata is forbidden in generic account approval."
    : "Missing, malformed, or unknown requestedRole metadata is blocked from generic account approval.";
  return {
    kind: "BLOCKED",
    display: `${label} (blocked requested intent)`,
    reason,
  };
}

export function genericApprovalBlockReason(value: unknown): string | null {
  const assessment = assessRequestedIntent(value);
  if (assessment.kind === "SAFE_ACCOUNT_INTENT") return null;
  if (assessment.kind === "TENANT_MEMBERSHIP_INTENT") {
    return `${assessment.intent} authority requires an exact ACTIVE Membership. Review the Academy claim/Membership flow instead.`;
  }
  return assessment.reason;
}

export function requestedIntentAuditMetadata(value: unknown): string {
  return assessRequestedIntent(value).display;
}
