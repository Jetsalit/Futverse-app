import {
  buildSuperAdminAccountOrganizationPresentation,
  type SuperAdminAccountOrganizationPresentation,
} from "./superAdminAccountOrganizationPresentation";

import type {
  SuperAdminUserRelationshipRow,
} from "../../lib/superAdminRelationshipReadModel";

export type SuperAdminAccountOrganizationInventoryState =
  | "READY"
  | "LOADING"
  | "UNAVAILABLE";

export type SuperAdminOrganizationAuthorityCoverage =
  | "AVAILABLE"
  | "LOADING"
  | "UNAVAILABLE"
  | "NOT_CONNECTED";

export interface SuperAdminAccountOrganizationCoverage {
  academyAuthority: SuperAdminOrganizationAuthorityCoverage;
  proClubAuthority: SuperAdminOrganizationAuthorityCoverage;
}

export interface BuildSuperAdminAccountOrganizationContextInput {
  userId: string;
  inventoryState: SuperAdminAccountOrganizationInventoryState;
  row?: SuperAdminUserRelationshipRow;
}

export type SuperAdminAccountOrganizationContext =
  | {
      state: "READY";
      coverage: SuperAdminAccountOrganizationCoverage;
      presentation: SuperAdminAccountOrganizationPresentation;
    }
  | {
      state: "OUT_OF_SYNC";
      coverage: SuperAdminAccountOrganizationCoverage;
      reason: string;
    }
  | {
      state: "LOADING";
      coverage: SuperAdminAccountOrganizationCoverage;
    }
  | {
      state: "UNAVAILABLE";
      coverage: SuperAdminAccountOrganizationCoverage;
    };

const PRO_CLUB_NOT_CONNECTED = "NOT_CONNECTED" as const;

function coverageFor(
  inventoryState: SuperAdminAccountOrganizationInventoryState,
): SuperAdminAccountOrganizationCoverage {
  if (inventoryState === "LOADING") {
    return {
      academyAuthority: "LOADING",
      proClubAuthority: PRO_CLUB_NOT_CONNECTED,
    };
  }

  if (inventoryState === "UNAVAILABLE") {
    return {
      academyAuthority: "UNAVAILABLE",
      proClubAuthority: PRO_CLUB_NOT_CONNECTED,
    };
  }

  return {
    academyAuthority: "AVAILABLE",
    proClubAuthority: PRO_CLUB_NOT_CONNECTED,
  };
}

function outOfSync(
  reason: string,
): SuperAdminAccountOrganizationContext {
  return {
    state: "OUT_OF_SYNC",
    coverage: coverageFor("READY"),
    reason,
  };
}

export function buildSuperAdminAccountOrganizationContext(
  input: BuildSuperAdminAccountOrganizationContextInput,
): SuperAdminAccountOrganizationContext {
  const coverage = coverageFor(input.inventoryState);

  if (input.inventoryState === "LOADING") {
    return {
      state: "LOADING",
      coverage,
    };
  }

  if (input.inventoryState === "UNAVAILABLE") {
    return {
      state: "UNAVAILABLE",
      coverage,
    };
  }

  if (!input.userId) {
    return outOfSync(
      "Account identity is missing; refresh the authoritative user inventory.",
    );
  }

  if (!input.row) {
    return outOfSync(
      "The live account is missing from the authoritative relationship snapshot; refresh the inventory.",
    );
  }

  if (input.row.userId !== input.userId) {
    return outOfSync(
      "The relationship snapshot does not match the requested account; refresh the inventory.",
    );
  }

  const unsupportedOrganizationEvidence = input.row.organizations.some(
    (relationship) => relationship.organizationType !== "ACADEMY",
  );

  if (unsupportedOrganizationEvidence) {
    return outOfSync(
      "The relationship snapshot contains organization evidence outside the connected V1 Academy authority coverage.",
    );
  }

  return {
    state: "READY",
    coverage,
    presentation:
      buildSuperAdminAccountOrganizationPresentation(input.row),
  };
}
