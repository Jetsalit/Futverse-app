export const GAME_MODEL_PHASES = [
  "IN_POSSESSION",
  "OUT_OF_POSSESSION",
  "TRANSITION_TO_ATTACK",
  "TRANSITION_TO_DEFEND",
] as const;

export type GameModelPhase = (typeof GAME_MODEL_PHASES)[number];

export const GAME_MODEL_PHASE_LABELS: Readonly<Record<GameModelPhase, string>> = {
  IN_POSSESSION: "In Possession",
  OUT_OF_POSSESSION: "Out of Possession",
  TRANSITION_TO_ATTACK: "Attacking Transition",
  TRANSITION_TO_DEFEND: "Defensive Transition",
};

export const GAME_MODEL_PHASE_TEXT_LIMIT = 4000;

export interface GameModelTextSnapshot {
  readonly IN_POSSESSION: string;
  readonly OUT_OF_POSSESSION: string;
  readonly TRANSITION_TO_ATTACK: string;
  readonly TRANSITION_TO_DEFEND: string;
}

export function createEmptyGameModelTextSnapshot(): GameModelTextSnapshot {
  return {
    IN_POSSESSION: "",
    OUT_OF_POSSESSION: "",
    TRANSITION_TO_ATTACK: "",
    TRANSITION_TO_DEFEND: "",
  };
}

export function cloneGameModelTextSnapshot(
  value: GameModelTextSnapshot,
): GameModelTextSnapshot {
  return {
    IN_POSSESSION: value.IN_POSSESSION,
    OUT_OF_POSSESSION: value.OUT_OF_POSSESSION,
    TRANSITION_TO_ATTACK: value.TRANSITION_TO_ATTACK,
    TRANSITION_TO_DEFEND: value.TRANSITION_TO_DEFEND,
  };
}

export function validateGameModelTextSnapshot(value: unknown): {
  readonly ok: boolean;
  readonly errors: readonly string[];
} {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["Game Model phases must be an object."] };
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [...GAME_MODEL_PHASES].sort();
  if (keys.length !== expected.length || keys.join(",") !== expected.join(",")) {
    errors.push("Game Model must contain exactly the four canonical phases.");
  }

  for (const phase of GAME_MODEL_PHASES) {
    const text = record[phase];
    if (typeof text !== "string" || text.length > GAME_MODEL_PHASE_TEXT_LIMIT) {
      errors.push(`${GAME_MODEL_PHASE_LABELS[phase]} must be text up to ${GAME_MODEL_PHASE_TEXT_LIMIT} characters.`);
    }
  }

  return { ok: errors.length === 0, errors };
}
