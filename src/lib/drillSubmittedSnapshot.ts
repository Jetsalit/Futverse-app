export type DrillSubmittedVisualType =
  | "TACTIC_BOARD"
  | "UPLOADED_IMAGE"
  | "BOTH";

export interface DrillSubmittedDetails {
  title: string;
  category: string;
  duration?: string;
  ageGroup?: string;
  phase?: string;
  trainingMethod?: string;
  coachingPoints?: string;
  description?: string;
  date?: string;
}

export interface DrillSubmittedSnapshot {
  details: DrillSubmittedDetails;
  visualType: DrillSubmittedVisualType;
  canvasData?: Readonly<Record<string, unknown>>;
  previewImage?: string;
}

const DRILL_DETAIL_KEYS = [
  "duration",
  "ageGroup",
  "phase",
  "trainingMethod",
  "coachingPoints",
  "description",
  "date",
] as const satisfies readonly (keyof Omit<DrillSubmittedDetails, "title" | "category">)[];

function isPlainMap(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneSnapshotValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneSnapshotValue);
  }

  if (value instanceof Uint8Array) {
    return value.slice();
  }

  if (!isPlainMap(value)) {
    // Firestore SDK scalar classes (Timestamp, GeoPoint, Bytes, references,
    // and vectors) are immutable values and can safely be retained as atoms.
    return value;
  }

  const clone: Record<string, unknown> = Object.create(Object.getPrototypeOf(value));
  for (const [key, nestedValue] of Object.entries(value)) {
    clone[key] = cloneSnapshotValue(nestedValue);
  }
  return clone;
}

function requiredDetail(
  source: Readonly<Record<string, unknown>>,
  key: "title" | "category",
): string {
  const value = source[key];
  if (typeof value !== "string") {
    throw new TypeError(`Submitted drill ${key} must be a string.`);
  }
  return value;
}

export function buildDrillSubmittedSnapshot(
  source: Readonly<Record<string, unknown>>,
): DrillSubmittedSnapshot {
  const details: DrillSubmittedDetails = {
    title: requiredDetail(source, "title"),
    category: requiredDetail(source, "category"),
  };

  for (const key of DRILL_DETAIL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const value = source[key];
    if (value === undefined) continue;
    if (typeof value !== "string") {
      throw new TypeError(`Submitted drill ${key} must be a string.`);
    }
    details[key] = value;
  }

  let canvasData: Readonly<Record<string, unknown>> | undefined;
  if (source.canvas_data !== undefined && source.canvas_data !== null) {
    if (!isPlainMap(source.canvas_data)) {
      throw new TypeError("Submitted drill canvas_data must be a map or null.");
    }
    canvasData = cloneSnapshotValue(source.canvas_data) as Readonly<
      Record<string, unknown>
    >;
  }

  let previewImage: string | undefined;
  if (source.previewImage !== undefined && source.previewImage !== null) {
    if (typeof source.previewImage !== "string") {
      throw new TypeError("Submitted drill previewImage must be a string or null.");
    }
    if (source.previewImage.length > 0) {
      previewImage = source.previewImage;
    }
  }

  const hasCanvas = canvasData !== undefined;
  const hasImage = previewImage !== undefined;
  if (!hasCanvas && !hasImage) {
    throw new TypeError("Submitted drill must contain a board, an image, or both.");
  }

  return {
    details,
    visualType: hasCanvas && hasImage
      ? "BOTH"
      : hasCanvas
        ? "TACTIC_BOARD"
        : "UPLOADED_IMAGE",
    ...(hasCanvas ? { canvasData } : {}),
    ...(hasImage ? { previewImage } : {}),
  };
}
