import { isExactPlayerKey } from "../../../lib/playerIdentityFoundation";
import {
  canTransitionProClubSquadRosterStatus,
  validateProClubSquadRosterFootballInput,
  type ProClubSquadRosterFootballInput,
  type ProClubSquadRosterStatus,
} from "../../../lib/proClubSquadRoster";
import { MAX_ADDITIONAL_POSITIONS } from "../../../lib/playerPositionSelection";
import type { ProClubSquadRosterRecord } from "../../../lib/firestore/proClubSquadRosterRepository";

export interface ProClubSquadRosterEditorDraft {
  playerKey: string;
  futId: string;
  firstName: string;
  lastName: string;
  position: string;
  additionalPositions: string[];
  jerseyNumber: string;
  squadLabel: string;
  status: string;
}

export type ProClubSquadRosterEditorMode = "CREATE" | "EDIT";

export type ProClubSquadRosterEditorBuildResult =
  | {
      ok: true;
      playerKey: string;
      input: ProClubSquadRosterFootballInput;
    }
  | {
      ok: false;
      errors: string[];
    };

function emptyAdditionalPositions(): string[] {
  return Array.from({ length: MAX_ADDITIONAL_POSITIONS }, () => "");
}

export function generateProvisionalPlayerKey(uuid: string): string {
  const normalized = uuid.trim();
  if (!normalized || normalized.includes("/")) {
    throw new Error("Cannot generate provisional playerKey from an invalid UUID value.");
  }

  return `provisional-${normalized}`;
}

export function createProClubSquadRosterEditorDraft(
  playerKey: string,
): ProClubSquadRosterEditorDraft {
  return {
    playerKey,
    futId: "",
    firstName: "",
    lastName: "",
    position: "",
    additionalPositions: emptyAdditionalPositions(),
    jerseyNumber: "",
    squadLabel: "First Team",
    status: "ACTIVE",
  };
}

export function proClubSquadRosterEditorDraftFromRecord(
  record: ProClubSquadRosterRecord,
): ProClubSquadRosterEditorDraft {
  return {
    playerKey: record.playerKey,
    futId: record.futId ?? "",
    firstName: record.firstName,
    lastName: record.lastName,
    position: record.position,
    additionalPositions: [
      ...record.additionalPositions,
      ...emptyAdditionalPositions(),
    ].slice(0, MAX_ADDITIONAL_POSITIONS),
    jerseyNumber: String(record.jerseyNumber),
    squadLabel: record.squadLabel,
    status: record.status,
  };
}

export function proClubSquadRosterAllowedStatuses(
  mode: ProClubSquadRosterEditorMode,
  currentStatus?: ProClubSquadRosterStatus,
): ProClubSquadRosterStatus[] {
  if (mode === "CREATE") {
    return ["ACTIVE"];
  }

  if (!currentStatus) {
    return [];
  }

  return (["ACTIVE", "INACTIVE", "RELEASED"] as const).filter((status) =>
    canTransitionProClubSquadRosterStatus(currentStatus, status),
  );
}

export function buildProClubSquadRosterEditorSubmission(
  mode: ProClubSquadRosterEditorMode,
  draft: ProClubSquadRosterEditorDraft,
  current?: ProClubSquadRosterRecord,
): ProClubSquadRosterEditorBuildResult {
  const errors: string[] = [];
  const playerKey = draft.playerKey.trim();

  if (!isExactPlayerKey(playerKey)) {
    errors.push("A canonical playerKey is required and cannot contain '/'.");
  }

  if (mode === "EDIT") {
    if (!current) {
      errors.push("Existing roster record is required for edit mode.");
    } else if (playerKey !== current.playerKey) {
      errors.push("playerKey is immutable while editing a roster record.");
    }
  }

  const futIdText = draft.futId.trim().toUpperCase();
  const position = draft.position.trim().toUpperCase();
  const additionalPositions = draft.additionalPositions
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0);
  const status = draft.status.trim().toUpperCase();
  const jerseyText = draft.jerseyNumber.trim();
  const jerseyNumber = /^\d{1,2}$/.test(jerseyText)
    ? Number(jerseyText)
    : Number.NaN;

  const candidate = {
    futId: futIdText ? futIdText : null,
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    position,
    additionalPositions,
    jerseyNumber,
    squadLabel: draft.squadLabel.trim(),
    status,
  };

  const validation = validateProClubSquadRosterFootballInput(candidate);
  if (validation.ok === false) {
    errors.push(...validation.errors);
  }

  if (mode === "CREATE" && status !== "ACTIVE") {
    errors.push("New roster players must start ACTIVE.");
  }

  if (mode === "EDIT" && current) {
    if (
      current.futId !== null &&
      candidate.futId !== current.futId
    ) {
      errors.push("Existing non-null FUTID is immutable in Pro Club Squad V1.");
    }

    if (
      validation.ok &&
      !canTransitionProClubSquadRosterStatus(
        current.status,
        validation.value.status,
      )
    ) {
      errors.push("Selected roster status transition is not permitted.");
    }
  }

  if (errors.length > 0 || validation.ok === false) {
    return { ok: false, errors: [...new Set(errors)] };
  }

  return {
    ok: true,
    playerKey,
    input: {
      futId: validation.value.futId,
      firstName: validation.value.firstName,
      lastName: validation.value.lastName,
      position: validation.value.position,
      additionalPositions: [...validation.value.additionalPositions],
      jerseyNumber: validation.value.jerseyNumber,
      squadLabel: validation.value.squadLabel,
      status: validation.value.status,
    },
  };
}
