import {
  isPlayerPositionCode,
  type PlayerPositionCode,
} from "./playerPositionSelection";

export const PLAYER_ROLE_SCHEMA_VERSION =
  1 as const;

export const PLAYER_ROLE_ASSESSMENT_TYPES = Object.freeze([
  "ORGANIZATION",
] as const);

export type PlayerRoleAssessmentType =
  (typeof PLAYER_ROLE_ASSESSMENT_TYPES)[number];

export const PLAYER_ROLE_REASONS = Object.freeze([
  "INITIAL",
  "PERIODIC_REVIEW",
  "ROLE_CHANGE",
  "CORRECTION",
] as const);

export type PlayerRoleReason =
  (typeof PLAYER_ROLE_REASONS)[number];

export const PLAYER_ROLE_CODES = Object.freeze([
  "SHOT_STOPPER",
  "SWEEPER_KEEPER",
  "BUILD_UP_KEEPER",

  "FULL_BACK",
  "INVERTED_FULL_BACK",
  "WING_BACK",

  "STOPPER",
  "COVER_DEFENDER",
  "BALL_PLAYING_DEFENDER",
  "NO_NONSENSE_DEFENDER",

  "ANCHOR",
  "BALL_WINNING_MIDFIELDER",
  "DEEP_LYING_PLAYMAKER",
  "BOX_TO_BOX_MIDFIELDER",
  "CENTRAL_PLAYMAKER",
  "ADVANCED_PLAYMAKER",
  "WIDE_MIDFIELDER",

  "TOUCHLINE_WINGER",
  "INVERTED_WINGER",
  "INSIDE_FORWARD",

  "SHADOW_STRIKER",
  "FALSE_NINE",
  "TARGET_FORWARD",
  "PRESSING_FORWARD",
  "POACHER",
  "COMPLETE_FORWARD",
] as const);

export type PlayerRoleCode =
  (typeof PLAYER_ROLE_CODES)[number];

export const PLAYER_STYLE_TRAIT_CODES = Object.freeze([
  "BUILD_UP_INVOLVEMENT",
  "PROGRESSIVE_PASSING",
  "LINE_BREAKING_PASSING",
  "SWITCHING_PLAY",
  "BALL_CARRYING",
  "TEMPO_CONTROL",
  "LINK_PLAY",
  "FINAL_THIRD_CREATION",
  "ONE_V_ONE_ATTACKING",
  "RUNNING_IN_BEHIND",
  "BOX_PRESENCE",
  "WIDTH_HOLDING",
  "INVERTED_MOVEMENT",
  "FRONT_FOOT_DEFENDING",
  "POSITIONAL_COVER",
  "INTERCEPTION_FOCUS",
  "PRESSING",
  "COUNTER_PRESSING",
  "DUEL_ENGAGEMENT",
  "AERIAL_DUEL_FOCUS",
  "BOX_DEFENDING",
  "RECOVERY_RUNNING",
  "TRANSITION_ATTACKING",
  "TRANSITION_RECOVERY",
] as const);

export type PlayerStyleTraitCode =
  (typeof PLAYER_STYLE_TRAIT_CODES)[number];

export const MAX_SECONDARY_ROLES = 2;

export const MAX_STYLE_TRAITS = 6;

export const MAX_ROLE_SUMMARY_LENGTH = 500;


const roleSet =
  new Set<string>(
    PLAYER_ROLE_CODES,
  );

const styleTraitSet =
  new Set<string>(
    PLAYER_STYLE_TRAIT_CODES,
  );

const assessmentTypeSet =
  new Set<string>(
    PLAYER_ROLE_ASSESSMENT_TYPES,
  );

const reasonSet =
  new Set<string>(
    PLAYER_ROLE_REASONS,
  );


const ROLE_POSITION_COMPATIBILITY:
  Record<
    PlayerRoleCode,
    readonly PlayerPositionCode[]
  > = {
    SHOT_STOPPER: [
      "GK",
    ],

    SWEEPER_KEEPER: [
      "GK",
    ],

    BUILD_UP_KEEPER: [
      "GK",
    ],

    FULL_BACK: [
      "LB",
      "RB",
    ],

    INVERTED_FULL_BACK: [
      "LB",
      "LWB",
      "RB",
      "RWB",
    ],

    WING_BACK: [
      "LB",
      "LWB",
      "RB",
      "RWB",
    ],

    STOPPER: [
      "CB",
    ],

    COVER_DEFENDER: [
      "CB",
    ],

    BALL_PLAYING_DEFENDER: [
      "CB",
    ],

    NO_NONSENSE_DEFENDER: [
      "CB",
    ],

    ANCHOR: [
      "DM",
    ],

    BALL_WINNING_MIDFIELDER: [
      "DM",
      "CM",
    ],

    DEEP_LYING_PLAYMAKER: [
      "DM",
      "CM",
    ],

    BOX_TO_BOX_MIDFIELDER: [
      "CM",
    ],

    CENTRAL_PLAYMAKER: [
      "CM",
      "AM",
    ],

    ADVANCED_PLAYMAKER: [
      "CM",
      "AM",
    ],

    WIDE_MIDFIELDER: [
      "LM",
      "RM",
    ],

    TOUCHLINE_WINGER: [
      "LM",
      "RM",
      "LW",
      "RW",
    ],

    INVERTED_WINGER: [
      "LM",
      "RM",
      "LW",
      "RW",
    ],

    INSIDE_FORWARD: [
      "LW",
      "RW",
    ],

    SHADOW_STRIKER: [
      "AM",
      "CF",
    ],

    FALSE_NINE: [
      "CF",
      "ST",
    ],

    TARGET_FORWARD: [
      "CF",
      "ST",
    ],

    PRESSING_FORWARD: [
      "CF",
      "ST",
    ],

    POACHER: [
      "CF",
      "ST",
    ],

    COMPLETE_FORWARD: [
      "CF",
      "ST",
    ],
  };


export function isPlayerRoleCode(
  value: unknown,
): value is PlayerRoleCode {
  return (
    typeof value === "string" &&
    roleSet.has(value)
  );
}


export function isPlayerStyleTraitCode(
  value: unknown,
): value is PlayerStyleTraitCode {
  return (
    typeof value === "string" &&
    styleTraitSet.has(value)
  );
}


function isPlayerRoleAssessmentType(
  value: unknown,
): value is PlayerRoleAssessmentType {
  return (
    typeof value === "string" &&
    assessmentTypeSet.has(value)
  );
}


function isPlayerRoleReason(
  value: unknown,
): value is PlayerRoleReason {
  return (
    typeof value === "string" &&
    reasonSet.has(value)
  );
}


export function isRoleCompatibleWithPosition(
  position: unknown,
  role: unknown,
): boolean {
  if (
    !isPlayerPositionCode(position) ||
    !isPlayerRoleCode(role)
  ) {
    return false;
  }

  return ROLE_POSITION_COMPATIBILITY[
    role
  ].includes(position);
}


function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype =
    Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}


function isStrictCalendarDate(
  value: unknown,
): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      value,
    );

  if (!match) {
    return false;
  }

  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  const day =
    Number(match[3]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1
  ) {
    return false;
  }

  const leapYear =
    year % 4 === 0 &&
    (
      year % 100 !== 0 ||
      year % 400 === 0
    );

  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return (
    day <=
    daysInMonth[month - 1]
  );
}


function isValidSummary(
  value: unknown,
): value is string {
  if (typeof value !== "string") {
    return false;
  }

  if (
    value.length >
    MAX_ROLE_SUMMARY_LENGTH
  ) {
    return false;
  }

  if (value.length === 0) {
    return true;
  }

  return (
    value.trim() === value &&
    value.trim().length > 0
  );
}


const INPUT_KEYS = [
  "assessmentType",
  "positionContext",
  "primaryRole",
  "secondaryRoles",
  "styleTraits",
  "summary",
  "effectiveDate",
  "reason",
] as const;

const inputKeySet =
  new Set<string>(
    INPUT_KEYS,
  );


export type PlayerRoleAssessmentValidationError =
  | "INPUT_NOT_OBJECT"
  | "UNKNOWN_FIELDS"
  | "ASSESSMENT_TYPE_INVALID"
  | "POSITION_CONTEXT_INVALID"
  | "PRIMARY_ROLE_REQUIRED"
  | "PRIMARY_ROLE_INVALID"
  | "PRIMARY_ROLE_POSITION_INCOMPATIBLE"
  | "SECONDARY_ROLES_NOT_ARRAY"
  | "TOO_MANY_SECONDARY_ROLES"
  | "SECONDARY_ROLE_INVALID"
  | "PRIMARY_ROLE_DUPLICATED_IN_SECONDARY"
  | "DUPLICATE_SECONDARY_ROLE"
  | "SECONDARY_ROLE_POSITION_INCOMPATIBLE"
  | "STYLE_TRAITS_NOT_ARRAY"
  | "TOO_MANY_STYLE_TRAITS"
  | "STYLE_TRAIT_INVALID"
  | "DUPLICATE_STYLE_TRAIT"
  | "SUMMARY_INVALID"
  | "EFFECTIVE_DATE_INVALID"
  | "REASON_INVALID";


export interface ValidPlayerRoleAssessment {
  schemaVersion: 1;
  assessmentType: PlayerRoleAssessmentType;
  positionContext: PlayerPositionCode;
  primaryRole: PlayerRoleCode;
  secondaryRoles: PlayerRoleCode[];
  styleTraits: PlayerStyleTraitCode[];
  summary: string;
  effectiveDate: string;
  reason: PlayerRoleReason;
}


export type PlayerRoleAssessmentValidationResult =
  | {
      ok: true;
      value: ValidPlayerRoleAssessment;
    }
  | {
      ok: false;
      errors:
        PlayerRoleAssessmentValidationError[];
    };


export function validatePlayerRoleAssessmentInput(
  input: unknown,
): PlayerRoleAssessmentValidationResult {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: [
        "INPUT_NOT_OBJECT",
      ],
    };
  }

  const errors:
    PlayerRoleAssessmentValidationError[] =
      [];

  if (
    Object.keys(input).some(
      (key) =>
        !inputKeySet.has(key),
    )
  ) {
    errors.push(
      "UNKNOWN_FIELDS",
    );
  }


  const assessmentType =
    input.assessmentType;

  if (
    !isPlayerRoleAssessmentType(
      assessmentType,
    )
  ) {
    errors.push(
      "ASSESSMENT_TYPE_INVALID",
    );
  }


  const positionContext =
    input.positionContext;

  const positionIsValid =
    isPlayerPositionCode(
      positionContext,
    );

  if (!positionIsValid) {
    errors.push(
      "POSITION_CONTEXT_INVALID",
    );
  }


  const primaryRole =
    input.primaryRole;

  const primaryRoleIsValid =
    isPlayerRoleCode(
      primaryRole,
    );

  if (primaryRole === "") {
    errors.push(
      "PRIMARY_ROLE_REQUIRED",
    );
  }
  else if (!primaryRoleIsValid) {
    errors.push(
      "PRIMARY_ROLE_INVALID",
    );
  }

  if (
    positionIsValid &&
    primaryRoleIsValid &&
    !isRoleCompatibleWithPosition(
      positionContext,
      primaryRole,
    )
  ) {
    errors.push(
      "PRIMARY_ROLE_POSITION_INCOMPATIBLE",
    );
  }


  const secondaryRoles =
    input.secondaryRoles;

  if (!Array.isArray(secondaryRoles)) {
    errors.push(
      "SECONDARY_ROLES_NOT_ARRAY",
    );
  }
  else {
    if (
      secondaryRoles.length >
      MAX_SECONDARY_ROLES
    ) {
      errors.push(
        "TOO_MANY_SECONDARY_ROLES",
      );
    }

    const canonicalSecondaryRoles =
      secondaryRoles.filter(
        isPlayerRoleCode,
      );

    if (
      canonicalSecondaryRoles.length !==
      secondaryRoles.length
    ) {
      errors.push(
        "SECONDARY_ROLE_INVALID",
      );
    }

    if (
      primaryRoleIsValid &&
      secondaryRoles.includes(
        primaryRole,
      )
    ) {
      errors.push(
        "PRIMARY_ROLE_DUPLICATED_IN_SECONDARY",
      );
    }

    if (
      new Set(
        secondaryRoles,
      ).size !==
      secondaryRoles.length
    ) {
      errors.push(
        "DUPLICATE_SECONDARY_ROLE",
      );
    }

    if (
      positionIsValid &&
      canonicalSecondaryRoles.some(
        (role) =>
          !isRoleCompatibleWithPosition(
            positionContext,
            role,
          ),
      )
    ) {
      errors.push(
        "SECONDARY_ROLE_POSITION_INCOMPATIBLE",
      );
    }
  }


  const styleTraits =
    input.styleTraits;

  if (!Array.isArray(styleTraits)) {
    errors.push(
      "STYLE_TRAITS_NOT_ARRAY",
    );
  }
  else {
    if (
      styleTraits.length >
      MAX_STYLE_TRAITS
    ) {
      errors.push(
        "TOO_MANY_STYLE_TRAITS",
      );
    }

    if (
      styleTraits.some(
        (trait) =>
          !isPlayerStyleTraitCode(
            trait,
          ),
      )
    ) {
      errors.push(
        "STYLE_TRAIT_INVALID",
      );
    }

    if (
      new Set(
        styleTraits,
      ).size !==
      styleTraits.length
    ) {
      errors.push(
        "DUPLICATE_STYLE_TRAIT",
      );
    }
  }


  const summary =
    input.summary;

  if (!isValidSummary(summary)) {
    errors.push(
      "SUMMARY_INVALID",
    );
  }


  const effectiveDate =
    input.effectiveDate;

  if (
    !isStrictCalendarDate(
      effectiveDate,
    )
  ) {
    errors.push(
      "EFFECTIVE_DATE_INVALID",
    );
  }


  const reason =
    input.reason;

  if (!isPlayerRoleReason(reason)) {
    errors.push(
      "REASON_INVALID",
    );
  }


  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }


  return {
    ok: true,

    value: {
      schemaVersion:
        PLAYER_ROLE_SCHEMA_VERSION,

      assessmentType:
        assessmentType as
          PlayerRoleAssessmentType,

      positionContext:
        positionContext as
          PlayerPositionCode,

      primaryRole:
        primaryRole as
          PlayerRoleCode,

      secondaryRoles:
        [
          ...(
            secondaryRoles as
              PlayerRoleCode[]
          ),
        ],

      styleTraits:
        [
          ...(
            styleTraits as
              PlayerStyleTraitCode[]
          ),
        ],

      summary:
        summary as string,

      effectiveDate:
        effectiveDate as string,

      reason:
        reason as
          PlayerRoleReason,
    },
  };
}