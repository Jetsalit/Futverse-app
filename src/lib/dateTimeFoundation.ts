export interface CanonicalDateOnlyParts {
  year: number;
  month: number;
  day: number;
}

const CANONICAL_DATE_ONLY_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})$/;

function isGregorianLeapYear(
  year: number,
): boolean {
  return (
    year % 4 === 0 &&
    (
      year % 100 !== 0 ||
      year % 400 === 0
    )
  );
}

function daysInGregorianMonth(
  year: number,
  month: number,
): number {
  switch (month) {
    case 2:
      return isGregorianLeapYear(year) ? 29 : 28;

    case 4:
    case 6:
    case 9:
    case 11:
      return 30;

    default:
      return 31;
  }
}

export function parseCanonicalDateOnly(
  value: string,
): CanonicalDateOnlyParts | null {
  const match =
    CANONICAL_DATE_ONLY_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  if (
    year < 1 ||
    year > 9999 ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }

  const maxDay =
    daysInGregorianMonth(
      year,
      month,
    );

  if (
    day < 1 ||
    day > maxDay
  ) {
    return null;
  }

  return {
    year,
    month,
    day,
  };
}

function compareDateOnlyParts(
  left: CanonicalDateOnlyParts,
  right: CanonicalDateOnlyParts,
): number {
  if (left.year !== right.year) {
    return left.year - right.year;
  }

  if (left.month !== right.month) {
    return left.month - right.month;
  }

  return left.day - right.day;
}

export function calculateAgeFromDateOnly(
  dateOfBirth: string,
  onDate: string,
): number | null {
  const birth =
    parseCanonicalDateOnly(dateOfBirth);

  const current =
    parseCanonicalDateOnly(onDate);

  if (
    birth === null ||
    current === null
  ) {
    return null;
  }

  if (
    compareDateOnlyParts(
      birth,
      current,
    ) > 0
  ) {
    return null;
  }

  let age =
    current.year - birth.year;

  const birthdayHasOccurred =
    current.month > birth.month ||
    (
      current.month === birth.month &&
      current.day >= birth.day
    );

  if (!birthdayHasOccurred) {
    age -= 1;
  }

  return age >= 0
    ? age
    : null;
}

function partValue(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string | null {
  return (
    parts.find(
      (part) => part.type === type,
    )?.value ?? null
  );
}

export function calendarDateInTimeZone(
  instant: Date,
  timeZone: string,
): string | null {
  if (
    !(instant instanceof Date) ||
    !Number.isFinite(instant.getTime())
  ) {
    return null;
  }

  try {
    const parts =
      new Intl.DateTimeFormat(
        "en-US-u-ca-gregory-nu-latn",
        {
          timeZone,
          calendar: "gregory",
          numberingSystem: "latn",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        },
      ).formatToParts(instant);

    const year =
      partValue(parts, "year");

    const month =
      partValue(parts, "month");

    const day =
      partValue(parts, "day");

    if (
      year === null ||
      month === null ||
      day === null
    ) {
      return null;
    }

    const canonical =
      [
        year.padStart(4, "0"),
        month.padStart(2, "0"),
        day.padStart(2, "0"),
      ].join("-");

    return parseCanonicalDateOnly(canonical)
      ? canonical
      : null;
  } catch {
    return null;
  }
}

export function isSameCalendarDateInTimeZone(
  left: Date,
  right: Date,
  timeZone: string,
): boolean {
  const leftDate =
    calendarDateInTimeZone(
      left,
      timeZone,
    );

  const rightDate =
    calendarDateInTimeZone(
      right,
      timeZone,
    );

  return (
    leftDate !== null &&
    rightDate !== null &&
    leftDate === rightDate
  );
}