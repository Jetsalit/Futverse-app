import type { FitnessTestDefinition } from "../fitnessTestFoundation";
import { parseCanonicalDateOnly } from "../dateTimeFoundation";
import {
  selectProClubFitnessWeeklyTrainingReadV1,
  type ProClubFitnessWeeklyTrainingReadV1Selection,
} from "../proClubFitnessWeeklyTrainingRead";
import {
  listProClubFitnessResultsForWeeklyTrainingRead,
  type ProClubFitnessResultsWeeklyTrainingReadRecord,
} from "./proClubFitnessResultRepository";
import {
  listProClubSquadRoster,
  type ProClubSquadRosterRecord,
} from "./proClubSquadRosterRepository";

export interface ProClubFitnessWeeklyTrainingReadAdapterServices {
  listRoster(clubId: string): Promise<readonly ProClubSquadRosterRecord[]>;
  listFitnessResults(
    clubId: string,
  ): Promise<readonly ProClubFitnessResultsWeeklyTrainingReadRecord[]>;
}

const DEFAULT_SERVICES: ProClubFitnessWeeklyTrainingReadAdapterServices = {
  listRoster: listProClubSquadRoster,
  async listFitnessResults(clubId) {
    return listProClubFitnessResultsForWeeklyTrainingRead({ clubId });
  },
};

/** Reads authoritative current roster and persisted result records, then applies the frozen pure selector. */
export async function loadProClubFitnessWeeklyTrainingRead(
  input: {
    clubId: string;
    referenceDate: string;
    definitions: readonly FitnessTestDefinition[];
  },
  services: ProClubFitnessWeeklyTrainingReadAdapterServices = DEFAULT_SERVICES,
): Promise<ProClubFitnessWeeklyTrainingReadV1Selection> {
  if (parseCanonicalDateOnly(input.referenceDate) === null) {
    throw new Error("referenceDate must be a valid calendar date in YYYY-MM-DD format.");
  }

  const [roster, records] = await Promise.all([
    services.listRoster(input.clubId),
    services.listFitnessResults(input.clubId),
  ]);

  return selectProClubFitnessWeeklyTrainingReadV1({
    organization: {
      organizationType: "PRO_CLUB",
      organizationId: input.clubId,
    },
    referenceDate: input.referenceDate,
    players: roster.map((player) => ({
      playerKey: player.playerKey,
      displayLabel: [player.firstName.trim(), player.lastName.trim()]
        .filter(Boolean)
        .join(" "),
      status: player.status,
    })),
    definitions: input.definitions,
    records: records.map((record) => ({
      id: record.id,
      organization: record.organization,
      data: record.data,
    })),
  });
}
