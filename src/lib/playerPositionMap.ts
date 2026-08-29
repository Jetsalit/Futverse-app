export type PlayerPositionMapSource =
  | "ACADEMY"
  | "PRO";

export type PlayerPositionCanonicalKey =
  | "GK"

  | "LB"
  | "LWB"
  | "CB"
  | "RB"
  | "RWB"

  | "DM"
  | "LM"
  | "CM"
  | "RM"
  | "AM"

  | "LW"
  | "WINGER"
  | "RW"

  | "CF"
  | "ST"

  | "UNKNOWN";

export type PlayerPositionMarkerKind =
  | "PRIMARY"
  | "SECONDARY";

export type PlayerPositionPlacement =
  | "POINT"
  | "EITHER_FLANK"
  | "FALLBACK";

export interface PlayerPositionLocation {
  xPercent: number;
  yPercent: number;
}

export interface PlayerPositionMapPoint {
  canonicalKey: PlayerPositionCanonicalKey;

  /**
   * Trimmed presentation text.
   * This is not written back to storage.
   */
  displayText: string;

  /**
   * Exact source value.
   */
  originalText: string;

  matched: boolean;

  placement: PlayerPositionPlacement;

  locations: PlayerPositionLocation[];
}

export interface PlayerPositionMapMarker
  extends PlayerPositionMapPoint {
  kind: PlayerPositionMarkerKind;
}

export interface PlayerPositionMapModel {
  source: PlayerPositionMapSource;
  markers: PlayerPositionMapMarker[];
}

export interface BuildPlayerPositionMapInput {
  source: PlayerPositionMapSource;
  position?: string | null;
  secondaryPosition?: string | null;
}


/**
 * Presentation-only fallback.
 *
 * An unknown position is never converted into a more
 * specific football role.
 */
const FALLBACK_LOCATIONS:
  readonly PlayerPositionLocation[] = [
    {
      xPercent: 50,
      yPercent: 50,
    },
  ];


/**
 * Presentation coordinates only.
 *
 * 0% Y   = attacking goal
 * 100% Y = own goal
 *
 * These coordinates are not tactical authority and are
 * never persisted.
 *
 * Generic WINGER deliberately has two possible flank
 * locations because the source value does not identify
 * left or right.
 */
const POSITION_LOCATIONS: Record<
  Exclude<
    PlayerPositionCanonicalKey,
    "UNKNOWN"
  >,
  readonly PlayerPositionLocation[]
> = {

  GK: [
    {
      xPercent: 50,
      yPercent: 90,
    },
  ],


  LB: [
    {
      xPercent: 18,
      yPercent: 72,
    },
  ],

  LWB: [
    {
      xPercent: 12,
      yPercent: 58,
    },
  ],

  CB: [
    {
      xPercent: 50,
      yPercent: 74,
    },
  ],

  RB: [
    {
      xPercent: 82,
      yPercent: 72,
    },
  ],

  RWB: [
    {
      xPercent: 88,
      yPercent: 58,
    },
  ],


  DM: [
    {
      xPercent: 50,
      yPercent: 61,
    },
  ],

  LM: [
    {
      xPercent: 18,
      yPercent: 49,
    },
  ],

  CM: [
    {
      xPercent: 50,
      yPercent: 50,
    },
  ],

  RM: [
    {
      xPercent: 82,
      yPercent: 49,
    },
  ],

  AM: [
    {
      xPercent: 50,
      yPercent: 38,
    },
  ],


  LW: [
    {
      xPercent: 18,
      yPercent: 27,
    },
  ],

  WINGER: [
    {
      xPercent: 18,
      yPercent: 27,
    },
    {
      xPercent: 82,
      yPercent: 27,
    },
  ],

  RW: [
    {
      xPercent: 82,
      yPercent: 27,
    },
  ],


  CF: [
    {
      xPercent: 50,
      yPercent: 21,
    },
  ],

  ST: [
    {
      xPercent: 50,
      yPercent: 13,
    },
  ],
};


/**
 * Only aliases with sufficiently clear football meaning
 * are normalized for presentation.
 *
 * Generic terms such as Defender, Midfielder, Forward,
 * Fullback or Wing Back are deliberately not guessed.
 */
const POSITION_ALIASES: Readonly<
  Record<
    string,
    Exclude<
      PlayerPositionCanonicalKey,
      "UNKNOWN"
    >
  >
> = {

  GK: "GK",
  GOALKEEPER: "GK",
  GOALIE: "GK",
  KEEPER: "GK",


  LB: "LB",
  "LEFT BACK": "LB",
  "LEFT-BACK": "LB",
  "LEFT FULLBACK": "LB",
  "LEFT FULL BACK": "LB",


  LWB: "LWB",
  "LEFT WING BACK": "LWB",
  "LEFT WING-BACK": "LWB",


  CB: "CB",
  "CENTRE BACK": "CB",
  "CENTER BACK": "CB",
  "CENTRE-BACK": "CB",
  "CENTER-BACK": "CB",
  "CENTRAL DEFENDER": "CB",


  RB: "RB",
  "RIGHT BACK": "RB",
  "RIGHT-BACK": "RB",
  "RIGHT FULLBACK": "RB",
  "RIGHT FULL BACK": "RB",


  RWB: "RWB",
  "RIGHT WING BACK": "RWB",
  "RIGHT WING-BACK": "RWB",


  DM: "DM",
  CDM: "DM",
  "DEFENSIVE MIDFIELDER": "DM",
  "DEFENSIVE MIDFIELD": "DM",
  "HOLDING MIDFIELDER": "DM",


  LM: "LM",
  "LEFT MID": "LM",
  "LEFT MIDFIELD": "LM",
  "LEFT MIDFIELDER": "LM",


  CM: "CM",
  "CENTRAL MIDFIELD": "CM",
  "CENTRE MIDFIELD": "CM",
  "CENTRAL MIDFIELDER": "CM",
  "CENTRE MIDFIELDER": "CM",


  RM: "RM",
  "RIGHT MID": "RM",
  "RIGHT MIDFIELD": "RM",
  "RIGHT MIDFIELDER": "RM",


  AM: "AM",
  CAM: "AM",
  "ATTACKING MIDFIELD": "AM",
  "ATTACKING MIDFIELDER": "AM",


  LW: "LW",
  "LEFT WING": "LW",
  "LEFT WINGER": "LW",


  WINGER: "WINGER",


  RW: "RW",
  "RIGHT WING": "RW",
  "RIGHT WINGER": "RW",


  CF: "CF",
  "CENTRE FORWARD": "CF",
  "CENTER FORWARD": "CF",
  "CENTRE-FORWARD": "CF",
  "CENTER-FORWARD": "CF",


  ST: "ST",
  STRIKER: "ST",
};


function displayPositionText(
  value: string,
): string {
  return value
    .trim()
    .replace(/\s+/g, " ");
}


function normalizedAliasKey(
  value: string,
): string {
  return displayPositionText(
    value,
  ).toUpperCase();
}


/**
 * Defensive copy prevents a consumer from mutating the
 * canonical presentation coordinates.
 */
function copyLocations(
  locations:
    readonly PlayerPositionLocation[],
): PlayerPositionLocation[] {
  return locations.map(
    (location) => ({
      xPercent:
        location.xPercent,
      yPercent:
        location.yPercent,
    }),
  );
}


/**
 * Resolve an existing stored position string into a
 * read-only presentation model.
 *
 * No normalized value is persisted.
 * Unknown or generic values preserve their source tex
 * instead of being guessed into a more specific role.
 */
export function resolvePlayerPositionMapPoint(
  position: string,
): PlayerPositionMapPoint {

  const displayText =
    displayPositionText(
      position,
    );

  const canonicalKey =
    POSITION_ALIASES[
      normalizedAliasKey(
        position,
      )
    ] ?? "UNKNOWN";


  if (canonicalKey === "UNKNOWN") {
    return {
      canonicalKey,
      displayText,
      originalText:
        position,
      matched: false,
      placement:
        "FALLBACK",
      locations:
        copyLocations(
          FALLBACK_LOCATIONS,
        ),
    };
  }


  return {
    canonicalKey,
    displayText,
    originalText:
      position,
    matched: true,

    placement:
      canonicalKey === "WINGER"
        ? "EITHER_FLANK"
        : "POINT",

    locations:
      copyLocations(
        POSITION_LOCATIONS[
          canonicalKey
        ],
      ),
  };
}


function markerFromPosition(
  position:
    string | null | undefined,
  kind:
    PlayerPositionMarkerKind,
): PlayerPositionMapMarker | null {

  if (
    typeof position !== "string" ||
    displayPositionText(
      position,
    ).length === 0
  ) {
    return null;
  }


  return {
    ...resolvePlayerPositionMapPoint(
      position,
    ),
    kind,
  };
}


/**
 * Build the complete presentation-only map.
 *
 * Academy currently contributes only its existing
 * primary-position field.
 *
 * Pro may additionally contribute the already-existing
 * optional secondary position.
 *
 * Supplying secondaryPosition to an Academy model does
 * not create a marker.
 */
export function buildPlayerPositionMap(
  input:
    BuildPlayerPositionMapInput,
): PlayerPositionMapModel {

  const markers:
    PlayerPositionMapMarker[] = [];


  const primary =
    markerFromPosition(
      input.position,
      "PRIMARY",
    );


  if (primary) {
    markers.push(
      primary,
    );
  }


  if (input.source === "PRO") {

    const secondary =
      markerFromPosition(
        input.secondaryPosition,
        "SECONDARY",
      );


    if (secondary) {
      markers.push(
        secondary,
      );
    }
  }


  return {
    source:
      input.source,
    markers,
  };
}