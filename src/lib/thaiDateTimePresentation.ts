import { parseCanonicalDateOnly } from "./dateTimeFoundation";

const THAI_LOCALE = "th-TH-u-ca-buddhist";
const BANGKOK_TIME_ZONE = "Asia/Bangkok";

export type ThaiDateTimeInput =
  | Date
  | string
  | null
  | undefined;

const longDateFormatter = new Intl.DateTimeFormat(THAI_LOCALE, {
  timeZone: BANGKOK_TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat(THAI_LOCALE, {
  timeZone: BANGKOK_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const weekdayDateFormatter = new Intl.DateTimeFormat(THAI_LOCALE, {
  timeZone: BANGKOK_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat(THAI_LOCALE, {
  timeZone: BANGKOK_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function canonicalDateAsBangkokInstant(value: string): Date | null {
  const parts = parseCanonicalDateOnly(value);
  if (!parts) return null;

  const instant = new Date(0);
  instant.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  instant.setUTCHours(5, 0, 0, 0);
  return Number.isFinite(instant.getTime()) ? instant : null;
}

function dateInstant(value: ThaiDateTimeInput): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return canonicalDateAsBangkokInstant(value);
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatDate(
  value: ThaiDateTimeInput,
  formatter: Intl.DateTimeFormat,
): string {
  const instant = dateInstant(value);
  return instant ? formatter.format(instant) : "—";
}

export function formatThaiDateLong(value: ThaiDateTimeInput): string {
  return formatDate(value, longDateFormatter);
}

export function formatThaiDateShort(value: ThaiDateTimeInput): string {
  return formatDate(value, shortDateFormatter);
}

export function formatThaiDateWithWeekday(
  value: ThaiDateTimeInput,
): string {
  return formatDate(value, weekdayDateFormatter);
}

export function formatThaiTime(value: ThaiDateTimeInput): string {
  if (typeof value === "string") {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (match) {
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      if (hour > 23 || minute > 59) return "—";

      const instant = new Date(
        Date.UTC(2000, 0, 1, hour - 7, minute),
      );
      return `${timeFormatter.format(instant)} น.`;
    }

    if (/^\d{1,2}:\d{2}$/.test(value)) return "—";
  }

  const instant = dateInstant(value);
  return instant ? `${timeFormatter.format(instant)} น.` : "—";
}
