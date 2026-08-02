export interface Tournament {
  id: string;
  name: string;
  season: string;
  eligibleAgeGroups: string[];
  eligibleGenderRules: string[];
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  createdAt?: any;
  updatedAt?: any;
}

export interface TournamentSquad {
  id?: string;
  tournamentId: string;
  playerIds: string[];
  createdAt?: any;
  updatedAt?: any;
}
