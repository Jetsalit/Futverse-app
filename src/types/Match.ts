export interface PlayerMatchRecord {
  playerId: string;
  isGuest: boolean;
  originalAgeGroup?: string;
  starter: boolean;
  position: string;
  availability: "AVAILABLE" | "BENCH" | "INJURED" | "SICK" | "SUSPENDED" | "NOT_SELECTED" | "LATE" | "LEFT_EARLY";
  
  // Auto-calculated fields from Events
  minutesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  
  // Manual/Advanced Stats
  shots: number;
  shotsOnTarget: number;
  passes: number;
  passAccuracy: number;
  dribbles: number;
  crosses: number;
  tackles: number;
  interceptions: number;
  clearances: number;
  blocks: number;

  // Goalkeeper Specific
  goalsConceded: number;
  cleanSheet: boolean;
  savePercentage: number;
  penaltySaves: number;
  distributionAccuracy: number;
  longPassAccuracy: number;
  crossClaims: number;
  oneOnOneSaves: number;
  sweeperActions: number;
  
  // Evaluation & Notes
  rating: number;
  privateCoachNote: string;
  playerVisibleNote: string;
  parentVisibleNote: string;
  trainingRecommendation: string;
  evaluationCompleted: boolean;

  // AI Ready Structure
  aiSummary: string;
  aiStrength: string;
  aiWeakness: string;
  aiRecommendation: string;
}

export interface MatchEvent {
  eventId: string;
  matchId: string;
  minute: number;
  extraTimeMinute: number;
  half: 1 | 2 | 3 | 4;
  eventType: "GOAL" | "ASSIST" | "SHOT" | "SHOT_ON_TARGET" | "KEY_PASS" | "CORNER" | "FREE_KICK" | "PENALTY" | "OWN_GOAL" | "SAVE" | "TACKLE" | "INTERCEPTION" | "CLEARANCE" | "BLOCK" | "DRIBBLE" | "CROSS" | "FOUL" | "YELLOW_CARD" | "RED_CARD" | "OFFSIDE" | "SUBSTITUTION" | "INJURY" | "MEDICAL_TREATMENT" | "COACH_INSTRUCTION" | "OTHER";
  playerId: string;
  secondaryPlayerId?: string;
  team: "OURS" | "OPPONENT";
  position: string;
  location?: { x: number, y: number };
  videoTimestamp?: string;
  videoClipUrl?: string;
  notes: string;
  createdAt: any;
  createdBy: string;
}

export interface Match {
  id: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  ageGroup: string;
  gender: string;
  season: string;
  matchDate: string;
  kickoff: string;
  venue: string;
  location: "HOME" | "AWAY" | "NEUTRAL";
  coachId: string;
  formation: string;
  weather: string;

  // Competition Structure
  competition: string;
  competitionType: "LEAGUE" | "CUP" | "FRIENDLY" | "TOURNAMENT" | "FESTIVAL" | "TRAINING_MATCH" | "TRIAL";
  tournament: string;
  tournamentId?: string;
  opponent: string;
  round: string;
  stage: string;
  group: string;

  // Match Officials
  officials: {
    referee: string;
    assistantReferee1: string;
    assistantReferee2: string;
    fourthOfficial: string;
    matchCommissioner: string;
  };

  // Results, Team Stats & Awards
  ourScore: number;
  opponentScore: number;
  teamStats: {
    possession: number;
    totalShots: number;
    corners: number;
    fouls: number;
  };
  awards: {
    playerOfTheMatch: string;
    bestGoalkeeper: string;
    bestDefender: string;
    bestMidfielder: string;
    bestForward: string;
    bestAttitude: string;
    mostImproved: string;
  };

  // Squad Management & Indexing
  playerIds: string[]; 
  guestPlayerIds: string[];
  
  matchSquad: {
    startingPlayers: string[];
    benchPlayers: string[];
    guestPlayers: string[];
    unavailablePlayers: string[];
  };

  // Player Match Records
  playersData: {
    [playerId: string]: PlayerMatchRecord;
  };

  // Audit & Export Ready
  exportReady: boolean;
  createdAt: any;
  updatedAt: any;
  lastUpdatedBy: string;
}
