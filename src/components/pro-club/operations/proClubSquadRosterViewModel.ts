import type { PlayerPositionCode } from "../../../lib/playerPositionSelection";
import type { ProClubSquadRosterStatus } from "../../../lib/proClubSquadRoster";
import type { ProClubSquadRosterRecord } from "../../../lib/firestore/proClubSquadRosterRepository";

export const PRO_CLUB_SQUAD_POSITION_GROUPS = [
  "ALL",
  "GK",
  "DEF",
  "MID",
  "FWD",
] as const;

export type ProClubSquadPositionGroup =
  (typeof PRO_CLUB_SQUAD_POSITION_GROUPS)[number];

export type ProClubSquadStatusFilter =
  | "ALL"
  | ProClubSquadRosterStatus;

export interface ProClubSquadRosterFilter {
  search: string;
  status: ProClubSquadStatusFilter;
  group: ProClubSquadPositionGroup;
}

export interface ProClubSquadRosterPartition {
  current: ProClubSquadRosterRecord[];
  released: ProClubSquadRosterRecord[];
}

export function partitionProClubSquadRoster(
  records: readonly ProClubSquadRosterRecord[],
): ProClubSquadRosterPartition {
  return {
    current: records.filter((record) => record.status !== "RELEASED"),
    released: records.filter((record) => record.status === "RELEASED"),
  };
}

const DEFENDER_POSITIONS = new Set<PlayerPositionCode>([
  "LB",
  "LWB",
  "CB",
  "RB",
  "RWB",
]);

const MIDFIELDER_POSITIONS = new Set<PlayerPositionCode>([
  "DM",
  "LM",
  "CM",
  "RM",
  "AM",
]);

const FORWARD_POSITIONS = new Set<PlayerPositionCode>([
  "LW",
  "RW",
  "CF",
  "ST",
]);

export function resolveProClubSquadPositionGroup(
  position: PlayerPositionCode | null,
): Exclude<ProClubSquadPositionGroup, "ALL"> | null {
  if (position === null) {
    return null;
  }

  if (position === "GK") {
    return "GK";
  }

  if (DEFENDER_POSITIONS.has(position)) {
    return "DEF";
  }

  if (MIDFIELDER_POSITIONS.has(position)) {
    return "MID";
  }

  if (FORWARD_POSITIONS.has(position)) {
    return "FWD";
  }

  throw new Error(`Unsupported canonical player position: ${position}`);
}

function normalizedSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function filterProClubSquadRoster(
  records: readonly ProClubSquadRosterRecord[],
  filter: ProClubSquadRosterFilter,
): ProClubSquadRosterRecord[] {
  const query = normalizedSearchValue(filter.search);

  return records
    .filter((record) => {
      if (filter.status !== "ALL" && record.status !== filter.status) {
        return false;
      }

      if (
        filter.group !== "ALL" &&
        resolveProClubSquadPositionGroup(record.position) !== filter.group
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchable = [
        record.firstName,
        record.lastName,
        `${record.firstName} ${record.lastName}`,
        record.futId ?? "",
        String(record.jerseyNumber),
        record.position ?? "",
        record.squadLabel,
      ]
        .join(" ")
        .toLocaleLowerCase();

      return searchable.includes(query);
    })
    .sort((left, right) => {
      if (left.jerseyNumber !== right.jerseyNumber) {
        return left.jerseyNumber - right.jerseyNumber;
      }

      return `${left.firstName} ${left.lastName}`.localeCompare(
        `${right.firstName} ${right.lastName}`,
      );
    });
}

export function countProClubSquadRosterByGroup(
  records: readonly ProClubSquadRosterRecord[],
): Record<Exclude<ProClubSquadPositionGroup, "ALL">, number> {
  const counts = {
    GK: 0,
    DEF: 0,
    MID: 0,
    FWD: 0,
  };

  for (const record of records) {
    const group = resolveProClubSquadPositionGroup(record.position);
    if (group !== null) {
      counts[group] += 1;
    }
  }

  return counts;
}
