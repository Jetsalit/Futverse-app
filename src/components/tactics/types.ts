export interface TeamTactics {
  inPossession: {
    buildUp: string;
    attackingWidth: string;
    tempo: string;
  };
  transition: {
    whenPossessionLost: string;
    whenPossessionWon: string;
  };
  outOfPossession: {
    defensiveLine: string;
    pressingIntensity: string;
  };
  notes: { id: string; text: string }[];
}

export interface PlayerInstruction {
  role: string;
  duty: "Defend" | "Support" | "Attack";
  instructions: string[];
}

export const DEFAULT_TEAM_TACTICS: TeamTactics = {
  inPossession: {
    buildUp: "Standard",
    attackingWidth: "Standard",
    tempo: "Standard",
  },
  transition: {
    whenPossessionLost: "Counter-Press",
    whenPossessionWon: "Counter",
  },
  outOfPossession: {
    defensiveLine: "Standard",
    pressingIntensity: "Standard",
  },
  notes: [],
};
