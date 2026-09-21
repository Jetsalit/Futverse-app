import type { ProClubSquadRosterRecord } from "../../../lib/firestore/proClubSquadRosterRepository";
import {
  PRO_CLUB_STARTING_XI_FIXED_SLOTS,
  deriveProClubStartingXIEligiblePlayers,
  type ProClubCustomFormationSlot,
  type ProClubStartingXIEligiblePlayer,
  type ProClubStartingXIFormation,
  type ProClubStartingXISlotDefinition,
} from "../../../lib/proClubStartingXI11v11";

export interface ProClubStartingXIPlayerView {
  playerKey: string;
  fullName: string;
  shortName: string;
  jerseyNumber: number;
  positionLabel: string;
  futIdLabel: string;
}

export interface ProClubStartingXISlotView
  extends ProClubStartingXISlotDefinition {
  label?: string;
  player: ProClubStartingXIPlayerView | null;
}

function comparePlayers(
  left: ProClubStartingXIEligiblePlayer,
  right: ProClubStartingXIEligiblePlayer,
): number {
  if (left.jerseyNumber !== right.jerseyNumber) {
    return left.jerseyNumber - right.jerseyNumber;
  }

  const leftName = `${left.firstName} ${left.lastName}`.trim();
  const rightName = `${right.firstName} ${right.lastName}`.trim();

  return leftName.localeCompare(rightName, "th");
}

export function toProClubStartingXIPlayerView(
  player: ProClubStartingXIEligiblePlayer,
): ProClubStartingXIPlayerView {
  const fullName = `${player.firstName} ${player.lastName}`.trim();
  const shortName = player.lastName
    ? `${player.firstName} ${player.lastName.charAt(0)}.`.trim()
    : player.firstName;

  return {
    playerKey: player.playerKey,
    fullName,
    shortName,
    jerseyNumber: player.jerseyNumber,
    positionLabel: player.position ?? "Position not set",
    futIdLabel: player.futId ?? "Not bound",
  };
}

export function buildProClubStartingXIPlayerViews(
  roster: readonly ProClubSquadRosterRecord[],
): ProClubStartingXIPlayerView[] {
  return deriveProClubStartingXIEligiblePlayers(roster)
    .slice()
    .sort(comparePlayers)
    .map(toProClubStartingXIPlayerView);
}

export function filterProClubStartingXIPlayerViews(
  players: readonly ProClubStartingXIPlayerView[],
  query: string,
): ProClubStartingXIPlayerView[] {
  const normalized = query.trim().toLocaleLowerCase("th");
  if (!normalized) return [...players];

  return players.filter((player) =>
    [
      player.fullName,
      player.shortName,
      String(player.jerseyNumber),
      player.positionLabel,
      player.futIdLabel,
    ].some((value) => value.toLocaleLowerCase("th").includes(normalized)),
  );
}

export function buildProClubStartingXISlotViews(
  formation: ProClubStartingXIFormation,
  slotPlayerKeys: readonly (string | null)[],
  players: readonly ProClubStartingXIPlayerView[],
  customFormationSlots: readonly ProClubCustomFormationSlot[] | null = null,
): ProClubStartingXISlotView[] {
  const byKey = new Map(players.map((player) => [player.playerKey, player] as const));
  const slots =
    formation === "CUSTOM"
      ? customFormationSlots ?? []
      : PRO_CLUB_STARTING_XI_FIXED_SLOTS[formation];

  return slots.map((slot) => {
    const playerKey = slotPlayerKeys[slot.slotIndex] ?? null;
    return {
      ...slot,
      player: playerKey ? byKey.get(playerKey) ?? null : null,
    };
  });
}

export function availableProClubStartingXIPlayers(
  players: readonly ProClubStartingXIPlayerView[],
  starterPlayerKeys: readonly (string | null)[],
  substitutePlayerKeys: readonly string[],
): ProClubStartingXIPlayerView[] {
  const unavailable = new Set([
    ...starterPlayerKeys.filter((value): value is string => value !== null),
    ...substitutePlayerKeys,
  ]);

  return players.filter((player) => !unavailable.has(player.playerKey));
}
