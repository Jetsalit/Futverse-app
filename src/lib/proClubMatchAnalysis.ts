import {
  PRO_CLUB_STARTING_XI_FIXED_FORMATIONS,
  PRO_CLUB_STARTING_XI_FIXED_SLOTS,
  validateProClubCustomFormationSlots,
  type ProClubCustomFormationSlot,
  type ProClubStartingXIFormation,
} from "./proClubStartingXI11v11";
import {
  isPlayerPositionCode,
  type PlayerPositionCode,
} from "./playerPositionSelection";

export const PRO_CLUB_MATCH_ANALYSIS_SCHEMA_VERSION = 1 as const;

export const PRO_CLUB_ANALYSIS_SECTIONS = [
  { id: "FORMATION_LINEUP", label: "Formation / Lineup" },
  { id: "IN_POSSESSION_ATT", label: "In Possession ATT" },
  { id: "OUT_DEF", label: "Out DEF" },
  { id: "KEY_MAN", label: "Key Man" },
  { id: "ANALYSIS", label: "Analysis" },
  { id: "SET_PIECES", label: "Set Pieces" },
  { id: "ATTACKING_PATTERNS", label: "การเข้าทำ" },
] as const;

export type ProClubAnalysisSectionId =
  (typeof PRO_CLUB_ANALYSIS_SECTIONS)[number]["id"];

export const PRO_CLUB_ANALYSIS_TOPIC_SECTIONS = [
  "IN_POSSESSION_ATT",
  "OUT_DEF",
] as const;

export type ProClubAnalysisTopicSection =
  (typeof PRO_CLUB_ANALYSIS_TOPIC_SECTIONS)[number];

export const PRO_CLUB_ANALYSIS_INPUT_TYPES = [
  "CHECKBOX",
  "RATING",
  "SINGLE_CHOICE",
  "NOTES",
] as const;

export type ProClubAnalysisInputType =
  (typeof PRO_CLUB_ANALYSIS_INPUT_TYPES)[number];

export type ProClubAnalysisTopicValue = boolean | number | string | null;

export const PRO_CLUB_ANALYSIS_TOPIC_NAME_LIMIT = 80;
export const PRO_CLUB_ANALYSIS_TOPIC_HELPER_LIMIT = 240;
export const PRO_CLUB_ANALYSIS_TOPIC_CHOICE_LIMIT = 8;
export const PRO_CLUB_ANALYSIS_TOPIC_NOTES_LIMIT = 1200;
export const PRO_CLUB_ANALYSIS_TEXT_LIMIT = 2000;
export const PRO_CLUB_ANALYSIS_PLAYER_NAME_LIMIT = 100;
export const PRO_CLUB_ANALYSIS_SLOT_NOTES_LIMIT = 400;
export const PRO_CLUB_ANALYSIS_MAX_KEY_MEN = 12;

export interface ProClubAnalysisTopic {
  readonly id: string;
  readonly name: string;
  readonly displayLabel: string | null;
  readonly section: ProClubAnalysisTopicSection;
  readonly inputType: ProClubAnalysisInputType;
  readonly choices: readonly string[];
  readonly displayOrder: number;
  readonly enabled: boolean;
  readonly archived: boolean;
  readonly includeInAnalysis: boolean;
  readonly includeInSummary: boolean;
  readonly helperText: string | null;
}

export type ProClubAnalysisTopicSnapshot = Omit<
  ProClubAnalysisTopic,
  "enabled" | "archived"
>;

export type ProClubAnalysisTopicInput = Pick<
  ProClubAnalysisTopic,
  "id" | "name" | "section" | "inputType" | "displayOrder"
> &
  Partial<
    Pick<
      ProClubAnalysisTopic,
      | "displayLabel"
      | "choices"
      | "enabled"
      | "archived"
      | "includeInAnalysis"
      | "includeInSummary"
      | "helperText"
    >
  >;

export type ProClubAnalysisTopicPatch = Partial<
  Omit<ProClubAnalysisTopic, "id" | "displayOrder">
>;

export interface ProClubAnalysisValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

const DEFAULT_TOPIC_INPUTS: readonly Omit<ProClubAnalysisTopicInput, "displayOrder">[] = [
  {
    id: "build-up",
    name: "Build Up",
    section: "IN_POSSESSION_ATT",
    inputType: "SINGLE_CHOICE",
    choices: ["Short", "Mixed", "Direct"],
  },
  {
    id: "progression",
    name: "Progression",
    section: "IN_POSSESSION_ATT",
    inputType: "RATING",
  },
  {
    id: "width",
    name: "Width",
    section: "IN_POSSESSION_ATT",
    inputType: "RATING",
  },
  {
    id: "tempo",
    name: "Tempo",
    section: "IN_POSSESSION_ATT",
    inputType: "RATING",
  },
  {
    id: "directness",
    name: "Directness",
    section: "IN_POSSESSION_ATT",
    inputType: "RATING",
  },
  {
    id: "final-third",
    name: "Final Third",
    section: "IN_POSSESSION_ATT",
    inputType: "NOTES",
  },
  {
    id: "attacking-transition",
    name: "Attacking Transition",
    section: "IN_POSSESSION_ATT",
    inputType: "CHECKBOX",
  },
  {
    id: "pressing",
    name: "Pressing",
    section: "OUT_DEF",
    inputType: "SINGLE_CHOICE",
    choices: ["High", "Mid", "Low"],
  },
  {
    id: "defensive-block",
    name: "Defensive Block",
    section: "OUT_DEF",
    inputType: "SINGLE_CHOICE",
    choices: ["High", "Mid", "Low"],
  },
  {
    id: "defensive-line",
    name: "Defensive Line",
    section: "OUT_DEF",
    inputType: "SINGLE_CHOICE",
    choices: ["High", "Mid", "Low"],
  },
  {
    id: "compactness",
    name: "Compactness",
    section: "OUT_DEF",
    inputType: "RATING",
  },
  {
    id: "pressing-intensity",
    name: "Pressing Intensity",
    section: "OUT_DEF",
    inputType: "RATING",
  },
  {
    id: "defensive-transition",
    name: "Defensive Transition",
    section: "OUT_DEF",
    inputType: "CHECKBOX",
  },
  {
    id: "force-wide-protect-centre",
    name: "Force Wide / Protect Centre",
    section: "OUT_DEF",
    inputType: "SINGLE_CHOICE",
    choices: ["Force wide", "Protect centre", "Balanced"],
  },
];

export function createDefaultProClubAnalysisTopics(): ProClubAnalysisTopic[] {
  return DEFAULT_TOPIC_INPUTS.map((input, displayOrder) =>
    createProClubAnalysisTopic({ ...input, displayOrder }),
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length && actual.join(",") === canonical.join(",");
}

function isExactSegment(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value &&
    !value.includes("/")
  );
}

function isBoundedText(
  value: unknown,
  max: number,
  allowEmpty = true,
): value is string {
  return (
    typeof value === "string" &&
    value.length <= max &&
    (allowEmpty || value.length > 0) &&
    value.trim() === value
  );
}

function cloneTopic(topic: ProClubAnalysisTopic): ProClubAnalysisTopic {
  return { ...topic, choices: [...topic.choices] };
}

export function validateProClubAnalysisTopic(
  value: unknown,
): ProClubAnalysisValidationResult {
  const errors: string[] = [];
  if (!isPlainRecord(value)) {
    return { ok: false, errors: ["Analysis topic must be an object."] };
  }

  const expectedKeys = [
    "id",
    "name",
    "displayLabel",
    "section",
    "inputType",
    "choices",
    "displayOrder",
    "enabled",
    "archived",
    "includeInAnalysis",
    "includeInSummary",
    "helperText",
  ];
  if (!hasOnlyKeys(value, expectedKeys)) {
    errors.push("Analysis topic contains missing or unsupported fields.");
  }
  if (!isExactSegment(value.id)) errors.push("Analysis topic id is invalid.");
  if (!isBoundedText(value.name, PRO_CLUB_ANALYSIS_TOPIC_NAME_LIMIT, false)) {
    errors.push("Analysis topic name is invalid.");
  }
  if (
    value.displayLabel !== null &&
    !isBoundedText(value.displayLabel, PRO_CLUB_ANALYSIS_TOPIC_NAME_LIMIT, false)
  ) {
    errors.push("Analysis topic display label is invalid.");
  }
  if (
    !(PRO_CLUB_ANALYSIS_TOPIC_SECTIONS as readonly unknown[]).includes(
      value.section,
    )
  ) {
    errors.push("Analysis topic section is invalid.");
  }
  if (
    !(PRO_CLUB_ANALYSIS_INPUT_TYPES as readonly unknown[]).includes(
      value.inputType,
    )
  ) {
    errors.push("Analysis topic input type is invalid.");
  }
  if (!Array.isArray(value.choices)) {
    errors.push("Analysis topic choices must be a list.");
  } else if (
    value.inputType === "SINGLE_CHOICE"
      ? value.choices.length < 2 ||
        value.choices.length > PRO_CLUB_ANALYSIS_TOPIC_CHOICE_LIMIT
      : value.choices.length !== 0
  ) {
    errors.push("Analysis topic choices do not match its input type.");
  } else if (
    value.choices.some(
      (choice) =>
        !isBoundedText(choice, PRO_CLUB_ANALYSIS_TOPIC_NAME_LIMIT, false),
    ) ||
    new Set(value.choices).size !== value.choices.length
  ) {
    errors.push("Analysis topic choices must be unique short labels.");
  }
  if (
    typeof value.displayOrder !== "number" ||
    !Number.isInteger(value.displayOrder) ||
    value.displayOrder < 0 ||
    value.displayOrder > 200
  ) {
    errors.push("Analysis topic display order is invalid.");
  }
  for (const field of [
    "enabled",
    "archived",
    "includeInAnalysis",
    "includeInSummary",
  ] as const) {
    if (typeof value[field] !== "boolean") {
      errors.push("Analysis topic " + field + " must be boolean.");
    }
  }
  if (
    value.helperText !== null &&
    !isBoundedText(value.helperText, PRO_CLUB_ANALYSIS_TOPIC_HELPER_LIMIT)
  ) {
    errors.push("Analysis topic helper text is invalid.");
  }
  if (value.archived === true && value.enabled === true) {
    errors.push("Archived analysis topics cannot be enabled.");
  }

  return { ok: errors.length === 0, errors };
}

export function createProClubAnalysisTopic(
  input: ProClubAnalysisTopicInput,
): ProClubAnalysisTopic {
  const topic: ProClubAnalysisTopic = {
    id: input.id,
    name: input.name,
    displayLabel: input.displayLabel ?? null,
    section: input.section,
    inputType: input.inputType,
    choices: [...(input.choices ?? [])],
    displayOrder: input.displayOrder,
    enabled: input.enabled ?? true,
    archived: input.archived ?? false,
    includeInAnalysis: input.includeInAnalysis ?? true,
    includeInSummary: input.includeInSummary ?? true,
    helperText: input.helperText ?? null,
  };
  const validation = validateProClubAnalysisTopic(topic);
  if (!validation.ok) {
    throw new Error("Invalid Analysis topic: " + validation.errors.join(" "));
  }
  return topic;
}

export function addProClubAnalysisTopic(
  topics: readonly ProClubAnalysisTopic[],
  topic: ProClubAnalysisTopic,
): ProClubAnalysisTopic[] {
  if (topics.some((current) => current.id === topic.id)) {
    throw new Error("Analysis topic id already exists.");
  }
  const activeTopics = topics
    .filter((current) => !current.archived)
    .sort((left, right) => left.displayOrder - right.displayOrder);
  const archivedTopics = topics
    .filter((current) => current.archived)
    .sort((left, right) => left.displayOrder - right.displayOrder);
  const next = {
    ...cloneTopic(topic),
    enabled: topic.archived ? false : topic.enabled,
    displayOrder: activeTopics.length,
  };
  return [...activeTopics, next, ...archivedTopics].map((current, index) =>
    current.archived
      ? cloneTopic(current)
      : { ...cloneTopic(current), displayOrder: index },
  );
}

export function updateProClubAnalysisTopic(
  topics: readonly ProClubAnalysisTopic[],
  topicId: string,
  patch: ProClubAnalysisTopicPatch,
): ProClubAnalysisTopic[] {
  let found = false;
  const next = topics.map((topic) => {
    if (topic.id !== topicId) return cloneTopic(topic);
    found = true;
    if (topic.archived) {
      throw new Error("Archived Analysis topics cannot be edited.");
    }
    const updated: ProClubAnalysisTopic = {
      ...topic,
      ...patch,
      id: topic.id,
      displayOrder: topic.displayOrder,
      choices: [...(patch.choices ?? (patch.inputType !== undefined && patch.inputType !== topic.inputType ? [] : topic.choices))],
    };
    const validation = validateProClubAnalysisTopic(updated);
    if (!validation.ok) {
      throw new Error("Invalid Analysis topic: " + validation.errors.join(" "));
    }
    return updated;
  });
  if (!found) throw new Error("Analysis topic does not exist.");
  return next.sort((left, right) => left.displayOrder - right.displayOrder);
}

export function reorderProClubAnalysisTopics(
  topics: readonly ProClubAnalysisTopic[],
  orderedTopicIds: readonly string[],
): ProClubAnalysisTopic[] {
  const active = topics.filter((topic) => !topic.archived);
  const archived = topics.filter((topic) => topic.archived);
  const expectedIds = new Set(active.map((topic) => topic.id));
  if (
    orderedTopicIds.length !== expectedIds.size ||
    new Set(orderedTopicIds).size !== expectedIds.size ||
    orderedTopicIds.some((id) => !expectedIds.has(id))
  ) {
    throw new Error("Reorder must include every non-archived topic exactly once.");
  }
  const byId = new Map(active.map((topic) => [topic.id, topic]));
  return [
    ...orderedTopicIds.map((id, displayOrder) => ({
      ...cloneTopic(byId.get(id)!),
      displayOrder,
    })),
    ...archived.map(cloneTopic),
  ];
}

export function setProClubAnalysisTopicEnabled(
  topics: readonly ProClubAnalysisTopic[],
  topicId: string,
  enabled: boolean,
): ProClubAnalysisTopic[] {
  return updateProClubAnalysisTopic(topics, topicId, { enabled });
}

export function archiveProClubAnalysisTopic(
  topics: readonly ProClubAnalysisTopic[],
  topicId: string,
): ProClubAnalysisTopic[] {
  return updateProClubAnalysisTopic(topics, topicId, {
    enabled: false,
    archived: true,
  });
}

export function createProClubAnalysisTopicSnapshot(
  topics: readonly ProClubAnalysisTopic[],
): ProClubAnalysisTopicSnapshot[] {
  return topics
    .filter((topic) => topic.enabled && !topic.archived)
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map(({ enabled: _enabled, archived: _archived, choices, ...topic }) => ({
      ...topic,
      choices: [...choices],
    }));
}

export function validateProClubAnalysisTopicValue(
  topic: Pick<ProClubAnalysisTopicSnapshot, "inputType" | "choices">,
  value: unknown,
): boolean {
  if (value === null) return true;
  switch (topic.inputType) {
    case "CHECKBOX":
      return typeof value === "boolean";
    case "RATING":
      return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= 5
      );
    case "SINGLE_CHOICE":
      return typeof value === "string" && topic.choices.includes(value);
    case "NOTES":
      return (
        typeof value === "string" &&
        value.length <= PRO_CLUB_ANALYSIS_TOPIC_NOTES_LIMIT
      );
  }
}



export interface ProClubAnalysisMatchSnapshot {
  readonly competitionName: string;
  readonly opponentName: string;
  readonly kickoffAt: string | null;
}

export interface ProClubAnalysisTeamSnapshot {
  readonly name: string;
  readonly logoUrl: string | null;
}

export interface ProClubAnalysisOpponentSnapshot {
  readonly teamId: string | null;
  readonly name: string;
  readonly logoUrl: string | null;
}

export interface ProClubOpponentLineupSlot {
  readonly slotIndex: number;
  readonly position: PlayerPositionCode;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly playerName: string;
  readonly jerseyNumber: number | null;
  readonly notes: string;
}

export interface ProClubAnalysisFormationLineup {
  readonly formation: ProClubStartingXIFormation;
  readonly customFormationSlots: readonly ProClubCustomFormationSlot[] | null;
  readonly slots: readonly ProClubOpponentLineupSlot[];
  readonly notes: string;
}

export type ProClubAnalysisPlayerRating = 1 | 2 | 3 | 4 | 5;
export type ProClubPreferredFoot = "LEFT" | "RIGHT" | "BOTH";

export interface ProClubAnalysisKeyMan {
  readonly id: string;
  readonly name: string;
  readonly position: string;
  readonly jerseyNumber: number | null;
  readonly preferredFoot: ProClubPreferredFoot | null;
  readonly dangerLevel: ProClubAnalysisPlayerRating | null;
  readonly pace: ProClubAnalysisPlayerRating | null;
  readonly aerialThreat: ProClubAnalysisPlayerRating | null;
  readonly oneVsOne: ProClubAnalysisPlayerRating | null;
  readonly workRate: ProClubAnalysisPlayerRating | null;
  readonly strengths: string;
  readonly weaknesses: string;
  readonly notes: string;
}

export interface ProClubAnalysisSummary {
  readonly strengths: string;
  readonly weaknesses: string;
  readonly keyObservations: string;
  readonly keyThreats: string;
  readonly areasToExploit: string;
  readonly tacticalNotes: string;
}

export interface ProClubAnalysisSetPieces {
  readonly attackingCorners: string;
  readonly defendingCorners: string;
  readonly freeKicks: string;
  readonly throwIns: string;
  readonly penalties: string;
}

export const PRO_CLUB_ANALYSIS_ATTACKING_PATTERNS = [
  { id: "wide-attack", label: "Wide Attack" },
  { id: "through-ball", label: "Through Ball" },
  { id: "cut-inside", label: "Cut Inside" },
  { id: "overlap", label: "Overlap" },
  { id: "underlap", label: "Underlap" },
  { id: "cross-to-box", label: "Cross to Box" },
  { id: "central-combination", label: "Central Combination" },
  { id: "counter-attack", label: "Counter Attack" },
] as const;

export interface ProClubAnalysisSections {
  readonly FORMATION_LINEUP: ProClubAnalysisFormationLineup;
  readonly IN_POSSESSION_ATT: {
    readonly topicValues: Readonly<Record<string, ProClubAnalysisTopicValue>>;
    readonly notes: string;
  };
  readonly OUT_DEF: {
    readonly topicValues: Readonly<Record<string, ProClubAnalysisTopicValue>>;
    readonly notes: string;
  };
  readonly KEY_MAN: {
    readonly players: readonly ProClubAnalysisKeyMan[];
  };
  readonly ANALYSIS: ProClubAnalysisSummary;
  readonly SET_PIECES: ProClubAnalysisSetPieces;
  readonly ATTACKING_PATTERNS: {
    readonly selected: readonly string[];
    readonly notes: string;
  };
}

export interface ProClubMatchAnalysis {
  readonly schemaVersion: typeof PRO_CLUB_MATCH_ANALYSIS_SCHEMA_VERSION;
  readonly matchId: string;
  readonly status: "DRAFT" | "COMPLETED";
  readonly revision: number;
  readonly teamSnapshot: ProClubAnalysisTeamSnapshot;
  readonly matchSnapshot: ProClubAnalysisMatchSnapshot;
  readonly opponentSnapshot: ProClubAnalysisOpponentSnapshot;
  readonly topicSnapshot: readonly ProClubAnalysisTopicSnapshot[];
  readonly sections: ProClubAnalysisSections;
  readonly createdAt: unknown;
  readonly createdBy: string | null;
  readonly updatedAt: unknown;
  readonly updatedBy: string | null;
}

export interface CreateEmptyProClubMatchAnalysisInput {
  readonly matchId: string;
  readonly clubName: string;
  readonly clubLogoUrl: string | null;
  readonly competitionName: string;
  readonly opponentName: string;
  readonly kickoffAt: string | null;
  readonly topicSnapshot: readonly ProClubAnalysisTopicSnapshot[];
}

function createEmptyLineupSlots(
  formation: Exclude<ProClubStartingXIFormation, "CUSTOM">,
): ProClubOpponentLineupSlot[] {
  return PRO_CLUB_STARTING_XI_FIXED_SLOTS[formation].map((slot) => ({
    ...slot,
    label: slot.position,
    playerName: "",
    jerseyNumber: null,
    notes: "",
  }));
}

function defaultTopicValue(
  topic: ProClubAnalysisTopicSnapshot,
): ProClubAnalysisTopicValue {
  switch (topic.inputType) {
    case "CHECKBOX":
      return false;
    case "NOTES":
      return "";
    case "RATING":
    case "SINGLE_CHOICE":
      return null;
  }
}

function cloneTopicSnapshot(
  topic: ProClubAnalysisTopicSnapshot,
): ProClubAnalysisTopicSnapshot {
  return { ...topic, choices: [...topic.choices] };
}

function cloneMatchAnalysis(
  analysis: ProClubMatchAnalysis,
): ProClubMatchAnalysis {
  return {
    ...analysis,
    teamSnapshot: { ...analysis.teamSnapshot },
    matchSnapshot: { ...analysis.matchSnapshot },
    opponentSnapshot: { ...analysis.opponentSnapshot },
    topicSnapshot: analysis.topicSnapshot.map(cloneTopicSnapshot),
    sections: {
      FORMATION_LINEUP: {
        ...analysis.sections.FORMATION_LINEUP,
        customFormationSlots:
          analysis.sections.FORMATION_LINEUP.customFormationSlots?.map(
            (slot) => ({ ...slot }),
          ) ?? null,
        slots: analysis.sections.FORMATION_LINEUP.slots.map((slot) => ({
          ...slot,
        })),
      },
      IN_POSSESSION_ATT: {
        ...analysis.sections.IN_POSSESSION_ATT,
        topicValues: { ...analysis.sections.IN_POSSESSION_ATT.topicValues },
      },
      OUT_DEF: {
        ...analysis.sections.OUT_DEF,
        topicValues: { ...analysis.sections.OUT_DEF.topicValues },
      },
      KEY_MAN: {
        players: analysis.sections.KEY_MAN.players.map((player) => ({
          ...player,
        })),
      },
      ANALYSIS: { ...analysis.sections.ANALYSIS },
      SET_PIECES: { ...analysis.sections.SET_PIECES },
      ATTACKING_PATTERNS: {
        ...analysis.sections.ATTACKING_PATTERNS,
        selected: [...analysis.sections.ATTACKING_PATTERNS.selected],
      },
    },
  };
}

export function createEmptyProClubMatchAnalysis(
  input: CreateEmptyProClubMatchAnalysisInput,
): ProClubMatchAnalysis {
  const topicSnapshot = input.topicSnapshot.map(cloneTopicSnapshot);
  const inPossessionTopics = topicSnapshot.filter(
    (topic) => topic.section === "IN_POSSESSION_ATT",
  );
  const outDefTopics = topicSnapshot.filter(
    (topic) => topic.section === "OUT_DEF",
  );
  const topicValues = (topics: readonly ProClubAnalysisTopicSnapshot[]) =>
    Object.fromEntries(
      topics.map((topic) => [topic.id, defaultTopicValue(topic)]),
    );

  return {
    schemaVersion: PRO_CLUB_MATCH_ANALYSIS_SCHEMA_VERSION,
    matchId: input.matchId,
    status: "DRAFT",
    revision: 0,
    teamSnapshot: {
      name: input.clubName,
      logoUrl: input.clubLogoUrl,
    },
    matchSnapshot: {
      competitionName: input.competitionName,
      opponentName: input.opponentName,
      kickoffAt: input.kickoffAt,
    },
    opponentSnapshot: {
      teamId: null,
      name: input.opponentName,
      logoUrl: null,
    },
    topicSnapshot,
    sections: {
      FORMATION_LINEUP: {
        formation: "4-3-3",
        customFormationSlots: null,
        slots: createEmptyLineupSlots("4-3-3"),
        notes: "",
      },
      IN_POSSESSION_ATT: {
        topicValues: topicValues(inPossessionTopics),
        notes: "",
      },
      OUT_DEF: {
        topicValues: topicValues(outDefTopics),
        notes: "",
      },
      KEY_MAN: { players: [] },
      ANALYSIS: {
        strengths: "",
        weaknesses: "",
        keyObservations: "",
        keyThreats: "",
        areasToExploit: "",
        tacticalNotes: "",
      },
      SET_PIECES: {
        attackingCorners: "",
        defendingCorners: "",
        freeKicks: "",
        throwIns: "",
        penalties: "",
      },
      ATTACKING_PATTERNS: {
        selected: [],
        notes: "",
      },
    },
    createdAt: null,
    createdBy: null,
    updatedAt: null,
    updatedBy: null,
  };
}



function validateTopicSnapshot(value: unknown): ProClubAnalysisValidationResult {
  if (!Array.isArray(value)) {
    return { ok: false, errors: ["Analysis topic snapshot must be a list."] };
  }
  if (value.length > 40) {
    return { ok: false, errors: ["Analysis topic snapshot exceeds the V1 limit."] };
  }
  const errors: string[] = [];
  const ids = new Set<string>();
  value.forEach((snapshot, index) => {
    if (!isPlainRecord(snapshot)) {
      errors.push("Analysis topic snapshot " + (index + 1) + " must be an object.");
      return;
    }
    const result = validateProClubAnalysisTopic({
      ...snapshot,
      enabled: true,
      archived: false,
    });
    errors.push(...result.errors);
    if (typeof snapshot.id === "string") {
      if (ids.has(snapshot.id)) {
        errors.push("Analysis topic snapshot IDs must be unique.");
      }
      ids.add(snapshot.id);
    }
  });
  return { ok: errors.length === 0, errors };
}

function validateRating(value: unknown): boolean {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 1 &&
      value <= 5)
  );
}

function validateAnalysisKeyMan(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  return (
    isExactSegment(value.id) &&
    isBoundedText(value.name, PRO_CLUB_ANALYSIS_PLAYER_NAME_LIMIT, false) &&
    isBoundedText(value.position, 32) &&
    (value.jerseyNumber === null ||
      (Number.isInteger(value.jerseyNumber) &&
        (value.jerseyNumber as number) >= 0 &&
        (value.jerseyNumber as number) <= 99)) &&
    (value.preferredFoot === null ||
      value.preferredFoot === "LEFT" ||
      value.preferredFoot === "RIGHT" ||
      value.preferredFoot === "BOTH") &&
    validateRating(value.dangerLevel) &&
    validateRating(value.pace) &&
    validateRating(value.aerialThreat) &&
    validateRating(value.oneVsOne) &&
    validateRating(value.workRate) &&
    isBoundedText(value.strengths, PRO_CLUB_ANALYSIS_TEXT_LIMIT) &&
    isBoundedText(value.weaknesses, PRO_CLUB_ANALYSIS_TEXT_LIMIT) &&
    isBoundedText(value.notes, PRO_CLUB_ANALYSIS_TEXT_LIMIT)
  );
}

function validateLineup(value: unknown): ProClubAnalysisValidationResult {
  const errors: string[] = [];
  if (!isPlainRecord(value)) {
    return {
      ok: false,
      errors: ["Formation / Lineup section must be an object."],
    };
  }

  const formation = value.formation;
  const fixedFormations =
    PRO_CLUB_STARTING_XI_FIXED_FORMATIONS as readonly string[];
  if (formation !== "CUSTOM" && !fixedFormations.includes(String(formation))) {
    errors.push("Opponent formation is invalid.");
  }
  if (formation === "CUSTOM") {
    const custom = validateProClubCustomFormationSlots(
      value.customFormationSlots as readonly ProClubCustomFormationSlot[] | null,
    );
    errors.push(...custom.errors);
  } else if (value.customFormationSlots !== null) {
    errors.push("Fixed formations cannot include custom formation slots.");
  }

  if (!Array.isArray(value.slots) || value.slots.length !== 11) {
    errors.push("Opponent lineup must contain exactly 11 slots.");
  } else {
    const expectedSlots =
      formation === "CUSTOM" &&
      Array.isArray(value.customFormationSlots)
        ? value.customFormationSlots
        : typeof formation === "string" &&
            fixedFormations.includes(formation)
          ? PRO_CLUB_STARTING_XI_FIXED_SLOTS[
              formation as keyof typeof PRO_CLUB_STARTING_XI_FIXED_SLOTS
            ]
          : [];
    value.slots.forEach((slot, index) => {
      if (!isPlainRecord(slot)) {
        errors.push("Opponent lineup slot " + (index + 1) + " is invalid.");
        return;
      }
      const expected = expectedSlots[index];
      if (
        slot.slotIndex !== index ||
        !isPlayerPositionCode(slot.position) ||
        !expected ||
        slot.position !== expected.position ||
        slot.x !== expected.x ||
        slot.y !== expected.y
      ) {
        errors.push("Opponent lineup slot " + (index + 1) + " identity is invalid.");
      }
      if (
        !Number.isInteger(slot.x) ||
        (slot.x as number) < 6 ||
        (slot.x as number) > 94 ||
        !Number.isInteger(slot.y) ||
        (slot.y as number) < 6 ||
        (slot.y as number) > 94
      ) {
        errors.push("Opponent lineup slot " + (index + 1) + " coordinates are invalid.");
      }
      if (
        !isBoundedText(slot.label, 24, false) ||
        !isBoundedText(slot.playerName, PRO_CLUB_ANALYSIS_PLAYER_NAME_LIMIT)
      ) {
        errors.push("Opponent lineup slot " + (index + 1) + " text is invalid.");
      }
      if (
        slot.jerseyNumber !== null &&
        (!Number.isInteger(slot.jerseyNumber) ||
          (slot.jerseyNumber as number) < 0 ||
          (slot.jerseyNumber as number) > 99)
      ) {
        errors.push("Opponent lineup slot " + (index + 1) + " shirt number is invalid.");
      }
      if (!isBoundedText(slot.notes, PRO_CLUB_ANALYSIS_SLOT_NOTES_LIMIT)) {
        errors.push("Opponent lineup slot " + (index + 1) + " notes are invalid.");
      }
    });
  }
  if (!isBoundedText(value.notes, PRO_CLUB_ANALYSIS_TEXT_LIMIT)) {
    errors.push("Opponent lineup notes are invalid.");
  }
  return { ok: errors.length === 0, errors };
}

function isLogoSource(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value.length <= 90_000 &&
      (value.startsWith("data:image/webp;base64,") ||
        value.startsWith("https://")))
  );
}

function validateTopicValues(
  values: unknown,
  snapshot: readonly ProClubAnalysisTopicSnapshot[],
  section: ProClubAnalysisTopicSection,
): ProClubAnalysisValidationResult {
  if (!isPlainRecord(values)) {
    return { ok: false, errors: ["Analysis topic values must be an object."] };
  }
  const errors: string[] = [];
  const sectionTopics = snapshot.filter((topic) => topic.section === section);
  const topicById = new Map(sectionTopics.map((topic) => [topic.id, topic]));
  if (Object.keys(values).length !== sectionTopics.length) {
    errors.push("Analysis topic values must match the saved topic snapshot.");
  }
  for (const [topicId, value] of Object.entries(values)) {
    const topic = topicById.get(topicId);
    if (!topic || !validateProClubAnalysisTopicValue(topic, value)) {
      errors.push("Analysis value for topic " + topicId + " is invalid.");
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateProClubMatchAnalysis(
  value: unknown,
): ProClubAnalysisValidationResult {
  const errors: string[] = [];
  if (!isPlainRecord(value)) {
    return { ok: false, errors: ["Match Analysis must be an object."] };
  }

  const expectedRootKeys = [
    "schemaVersion",
    "matchId",
    "status",
    "revision",
    "teamSnapshot",
    "matchSnapshot",
    "opponentSnapshot",
    "topicSnapshot",
    "sections",
    "createdAt",
    "createdBy",
    "updatedAt",
    "updatedBy",
  ];
  if (!hasOnlyKeys(value, expectedRootKeys)) {
    errors.push("Match Analysis contains missing or unsupported fields.");
  }
  if (value.schemaVersion !== PRO_CLUB_MATCH_ANALYSIS_SCHEMA_VERSION) {
    errors.push("Unsupported Match Analysis schemaVersion.");
  }
  if (!isExactSegment(value.matchId)) {
    errors.push("Match Analysis matchId is invalid.");
  }
  if (value.status !== "DRAFT" && value.status !== "COMPLETED") {
    errors.push("Match Analysis status is invalid.");
  }
  if (
    typeof value.revision !== "number" ||
    !Number.isInteger(value.revision) ||
    value.revision < 0
  ) {
    errors.push("Match Analysis revision is invalid.");
  }
  if (!isPlainRecord(value.teamSnapshot)) {
    errors.push("Match Analysis team snapshot is invalid.");
  } else {
    if (!isBoundedText(value.teamSnapshot.name, 120, false)) {
      errors.push("Match Analysis team name is invalid.");
    }
    if (!isLogoSource(value.teamSnapshot.logoUrl)) {
      errors.push("Match Analysis team logo is invalid.");
    }
  }
  if (!isPlainRecord(value.matchSnapshot)) {
    errors.push("Match Analysis match snapshot is invalid.");
  } else {
    if (!isBoundedText(value.matchSnapshot.competitionName, 120, false)) {
      errors.push("Match Analysis competition is invalid.");
    }
    if (!isBoundedText(value.matchSnapshot.opponentName, 120, false)) {
      errors.push("Match Analysis opponent name is invalid.");
    }
    if (
      value.matchSnapshot.kickoffAt !== null &&
      (typeof value.matchSnapshot.kickoffAt !== "string" ||
        !Number.isFinite(Date.parse(value.matchSnapshot.kickoffAt)))
    ) {
      errors.push("Match Analysis kickoff timestamp is invalid.");
    }
  }
  if (!isPlainRecord(value.opponentSnapshot)) {
    errors.push("Match Analysis opponent snapshot is invalid.");
  } else {
    if (
      value.opponentSnapshot.teamId !== null &&
      !isExactSegment(value.opponentSnapshot.teamId)
    ) {
      errors.push("Match Analysis opponent team ID is invalid.");
    }
    if (!isBoundedText(value.opponentSnapshot.name, 120, false)) {
      errors.push("Match Analysis opponent name is invalid.");
    }
    if (!isLogoSource(value.opponentSnapshot.logoUrl)) {
      errors.push("Match Analysis opponent logo is invalid.");
    }
  }

  const topicValidation = validateTopicSnapshot(value.topicSnapshot);
  errors.push(...topicValidation.errors);
  const topicSnapshot = Array.isArray(value.topicSnapshot)
    ? (value.topicSnapshot as ProClubAnalysisTopicSnapshot[])
    : [];

  if (!isPlainRecord(value.sections)) {
    errors.push("Match Analysis sections are invalid.");
  } else {
    const expectedSectionIds = PRO_CLUB_ANALYSIS_SECTIONS.map(({ id }) => id);
    if (!hasOnlyKeys(value.sections, expectedSectionIds)) {
      errors.push("Match Analysis must contain exactly the seven required sections.");
    }
    errors.push(...validateLineup(value.sections.FORMATION_LINEUP).errors);

    for (const sectionId of ["IN_POSSESSION_ATT", "OUT_DEF"] as const) {
      const section = value.sections[sectionId];
      const topicSection: ProClubAnalysisTopicSection = sectionId;
      if (!isPlainRecord(section)) {
        errors.push(sectionId + " section is invalid.");
        continue;
      }
      errors.push(
        ...validateTopicValues(section.topicValues, topicSnapshot, topicSection)
          .errors,
      );
      if (!isBoundedText(section.notes, PRO_CLUB_ANALYSIS_TEXT_LIMIT)) {
        errors.push(sectionId + " notes are invalid.");
      }
    }

    const keyMen = value.sections.KEY_MAN;
    if (!isPlainRecord(keyMen) || !Array.isArray(keyMen.players)) {
      errors.push("Key Man section is invalid.");
    } else {
      if (keyMen.players.length > PRO_CLUB_ANALYSIS_MAX_KEY_MEN) {
        errors.push("Key Man section contains too many players.");
      }
      const playerIds = keyMen.players
        .filter(isPlainRecord)
        .map((player) => player.id);
      if (
        playerIds.some((id) => !isExactSegment(id)) ||
        new Set(playerIds).size !== playerIds.length ||
        keyMen.players.some((player) => !validateAnalysisKeyMan(player))
      ) {
        errors.push("Key Man player data is invalid.");
      }
    }

    const summary = value.sections.ANALYSIS;
    if (!isPlainRecord(summary)) {
      errors.push("Analysis summary section is invalid.");
    } else {
      for (const field of [
        "strengths",
        "weaknesses",
        "keyObservations",
        "keyThreats",
        "areasToExploit",
        "tacticalNotes",
      ] as const) {
        if (!isBoundedText(summary[field], PRO_CLUB_ANALYSIS_TEXT_LIMIT)) {
          errors.push("Analysis summary " + field + " is invalid.");
        }
      }
    }

    const setPieces = value.sections.SET_PIECES;
    if (!isPlainRecord(setPieces)) {
      errors.push("Set Pieces section is invalid.");
    } else {
      for (const field of [
        "attackingCorners",
        "defendingCorners",
        "freeKicks",
        "throwIns",
        "penalties",
      ] as const) {
        if (!isBoundedText(setPieces[field], PRO_CLUB_ANALYSIS_TEXT_LIMIT)) {
          errors.push("Set Pieces " + field + " is invalid.");
        }
      }
    }

    const patterns = value.sections.ATTACKING_PATTERNS;
    if (
      !isPlainRecord(patterns) ||
      !Array.isArray(patterns.selected) ||
      patterns.selected.some(
        (id) =>
          typeof id !== "string" ||
          !PRO_CLUB_ANALYSIS_ATTACKING_PATTERNS.some(
            (pattern) => pattern.id === id,
          ),
      ) ||
      new Set(patterns.selected).size !== patterns.selected.length ||
      !isBoundedText(patterns.notes, PRO_CLUB_ANALYSIS_TEXT_LIMIT)
    ) {
      errors.push("Attacking Patterns section is invalid.");
    }
  }

  if (
    (value.createdBy !== null && !isExactSegment(value.createdBy)) ||
    (value.updatedBy !== null && !isExactSegment(value.updatedBy))
  ) {
    errors.push("Match Analysis audit identity is invalid.");
  }
  if (value.createdAt === undefined || value.updatedAt === undefined) {
    errors.push("Match Analysis audit timestamps are missing.");
  }

  return { ok: errors.length === 0, errors };
}

export function completeProClubMatchAnalysis(
  analysis: ProClubMatchAnalysis,
): ProClubMatchAnalysis {
  const validation = validateProClubMatchAnalysis(analysis);
  if (!validation.ok) {
    throw new Error(
      "Cannot complete Match Analysis: " + validation.errors.join(" "),
    );
  }
  return {
    ...cloneMatchAnalysis(analysis),
    status: "COMPLETED",
  };
}
