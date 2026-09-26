import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import {
  canonicalDateOnlyFromParts,
  calendarDateInTimeZone,
  parseCanonicalDateOnly,
} from "../../lib/dateTimeFoundation";
import {
  formatThaiDateLong,
  formatThaiMonthYear,
  formatThaiWeekdayShort,
} from "../../lib/thaiDateTimePresentation";

const BANGKOK_TIME_ZONE = "Asia/Bangkok";
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const weekdayReference = new Date(Date.UTC(2023, 0, 1, 5));
const weekdayLabels = Array.from({ length: 7 }, (_, offset) =>
  formatThaiWeekdayShort(new Date(weekdayReference.getTime() + offset * DAY_MILLISECONDS)),
);

export interface FutVerseThaiDateInputProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}

interface CalendarMonth {
  year: number;
  month: number;
}

function monthFromDate(value: string): CalendarMonth | null {
  const parts = parseCanonicalDateOnly(value);
  return parts ? { year: parts.year, month: parts.month } : null;
}

function shiftMonth(value: CalendarMonth, delta: number): CalendarMonth {
  const absoluteMonth = value.year * 12 + value.month - 1 + delta;
  return {
    year: Math.floor(absoluteMonth / 12),
    month: ((absoluteMonth % 12) + 12) % 12 + 1,
  };
}

function isWithinDateBounds(value: string, min?: string, max?: string): boolean {
  if (!parseCanonicalDateOnly(value)) return false;
  const validMin = min && parseCanonicalDateOnly(min) ? min : undefined;
  const validMax = max && parseCanonicalDateOnly(max) ? max : undefined;
  return (!validMin || value >= validMin) && (!validMax || value <= validMax);
}

export function FutVerseThaiDateInput({
  id,
  name,
  value,
  onChange,
  min,
  max,
  required = false,
  disabled = false,
  className = "",
  placeholder = "เลือกวันที่",
  "aria-label": ariaLabel,
}: FutVerseThaiDateInputProps) {
  const selectedParts = parseCanonicalDateOnly(value);
  const today = calendarDateInTimeZone(new Date(), BANGKOK_TIME_ZONE) ?? "";
  const inRangeValue = selectedParts && isWithinDateBounds(value, min, max) ? value : "";
  const boundedFallback = min && parseCanonicalDateOnly(min)
    ? min
    : max && parseCanonicalDateOnly(max)
      ? max
      : today;
  const initialMonth = monthFromDate(inRangeValue || boundedFallback) ?? { year: 2026, month: 1 };
  const [month, setMonth] = useState<CalendarMonth>(initialMonth);
  const [open, setOpen] = useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const validityRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const nextMonth = monthFromDate(value);
    if (nextMonth) setMonth(nextMonth);
  }, [value]);

  const days = useMemo(() => {
    const result: string[] = [];
    for (let day = 1; day <= 31; day += 1) {
      const date = canonicalDateOnlyFromParts(month.year, month.month, day);
      if (!date) break;
      result.push(date);
    }
    return result;
  }, [month]);

  const firstDay = canonicalDateOnlyFromParts(month.year, month.month, 1);
  const weekdayOffset = firstDay
    ? new Date(Date.UTC(month.year, month.month - 1, 1, 5)).getUTCDay()
    : 0;
  const monthLabel = firstDay ? formatThaiMonthYear(firstDay) : "—";
  const invalidValue = value !== "" && !selectedParts;
  const outOfBounds = Boolean(selectedParts && !isWithinDateBounds(value, min, max));
  const missingRequired = required && !selectedParts;
  const displayValue = selectedParts ? formatThaiDateLong(value) : placeholder;

  useEffect(() => {
    validityRef.current?.setCustomValidity(
      invalidValue || outOfBounds || (required && !selectedParts)
        ? "Choose a valid date within the allowed range."
        : "",
    );
  }, [invalidValue, outOfBounds, required, selectedParts?.day, selectedParts?.month, selectedParts?.year]);

  function selectDate(date: string) {
    if (!disabled && isWithinDateBounds(date, min, max)) {
      onChange(date);
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  function selectToday() {
    if (today && isWithinDateBounds(today, min, max)) selectDate(today);
  }

  return (
    <div className="relative">
      {name && <input type="hidden" name={name} value={selectedParts ? value : ""} disabled={disabled} />}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ?? (selectedParts ? `เลือกวันที่ ${displayValue}` : placeholder)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-required={required || undefined}
        aria-invalid={invalidValue || outOfBounds || missingRequired || undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className={`flex min-h-10 w-full items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 outline-none transition hover:border-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        <CalendarDays size={16} aria-hidden="true" className="shrink-0 text-slate-500" />
        <span className={selectedParts ? "" : "text-slate-400"}>{displayValue}</span>
      </button>
      {(required || invalidValue || outOfBounds) && (
        <input
          ref={validityRef}
          type="text"
          tabIndex={-1}
          aria-hidden="true"
          required={required}
          disabled={disabled}
          value={selectedParts ? value : ""}
          onChange={() => {}}
          onInvalid={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
          className="sr-only"
        />
      )}

      {open && !disabled && (
        <div
          role="dialog"
          aria-label="เลือกวันที่"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              triggerRef.current?.focus();
            }
          }}
          className="absolute left-0 top-full z-50 mt-2 w-[min(21rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="เดือนก่อนหน้า"
              onClick={() => setMonth((current) => shiftMonth(current, -1))}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <p className="font-bold" aria-live="polite">{monthLabel}</p>
            <button
              type="button"
              aria-label="เดือนถัดไป"
              onClick={() => setMonth((current) => shiftMonth(current, 1))}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
            {weekdayLabels.map((label, index) => (
              <span key={`${index}-${label}`} className="py-1 font-semibold">{label}</span>
            ))}
            {Array.from({ length: weekdayOffset }, (_, index) => (
              <span key={`blank-${index}`} aria-hidden="true" />
            ))}
            {days.map((date) => {
              const day = parseCanonicalDateOnly(date)?.day;
              const selected = date === value;
              const disabledDate = disabled || !isWithinDateBounds(date, min, max);
              return (
                <button
                  key={date}
                  type="button"
                  data-date={date}
                  aria-label={formatThaiDateLong(date)}
                  aria-pressed={selected}
                  disabled={disabledDate}
                  onClick={() => selectDate(date)}
                  className={`aspect-square rounded-lg text-sm transition disabled:cursor-not-allowed disabled:text-slate-300 ${selected ? "bg-indigo-600 font-bold text-white" : "text-slate-700 hover:bg-indigo-50"}`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
            <span className="text-xs text-slate-500">{selectedParts ? displayValue : "ยังไม่ได้เลือกวันที่"}</span>
            <div className="flex items-center gap-2">
              {!required && selectedParts && (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className="rounded-lg px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  ล้างวันที่
                </button>
              )}
              <button
                type="button"
                disabled={!today || !isWithinDateBounds(today, min, max)}
                onClick={selectToday}
                className="rounded-lg px-2 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                วันนี้
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export interface FutVerseThaiTimeInputProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  step?: number | string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function isCanonicalTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
}

function isValidTimeForConstraints(
  value: string,
  min?: string,
  max?: string,
  step?: number | string,
): boolean {
  if (!isCanonicalTime(value)) return false;
  if (min && isCanonicalTime(min) && value < min) return false;
  if (max && isCanonicalTime(max) && value > max) return false;
  if (step !== undefined && step !== "any") {
    const stepSeconds = Number(step);
    if (Number.isFinite(stepSeconds) && stepSeconds > 0) {
      const [hour, minute] = value.split(":").map(Number);
      if (((hour * 60 + minute) * 60) % stepSeconds !== 0) return false;
    }
  }
  return true;
}

export function FutVerseThaiTimeInput({
  id,
  name,
  value,
  onChange,
  min,
  max,
  step,
  required = false,
  disabled = false,
  className = "",
  "aria-label": ariaLabel,
}: FutVerseThaiTimeInputProps) {
  const [draft, setDraft] = useState(isCanonicalTime(value) ? value : "");
  const valueRef = React.useRef<HTMLInputElement>(null);
  const invalidSource = value !== "" && !isCanonicalTime(value);
  const validDraft = !invalidSource && (draft === ""
    ? !required
    : isValidTimeForConstraints(draft, min, max, step));

  useEffect(() => {
    setDraft(isCanonicalTime(value) ? value : "");
  }, [value]);

  useEffect(() => {
    valueRef.current?.setCustomValidity(validDraft ? "" : "Enter a valid 24-hour time within the allowed range.");
  }, [validDraft]);

  function handleChange(next: string) {
    setDraft(next);
    if (next === "") {
      valueRef.current?.setCustomValidity(required ? "Enter a 24-hour time." : "");
      if (!required) onChange("");
      return;
    }
    const isValid = isValidTimeForConstraints(next, min, max, step);
    valueRef.current?.setCustomValidity(isValid ? "" : "Enter a valid 24-hour time within the allowed range.");
    if (isValid) onChange(next);
  }

  return (
    <div className="flex min-h-10 items-center gap-2">
      <input
        ref={valueRef}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={5}
        pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]"
        value={draft}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel ?? "เวลา (24 ชั่วโมง)"}
        aria-invalid={!validDraft || undefined}
        onInput={(event) => handleChange(event.currentTarget.value)}
        onBlur={() => {
          if (draft !== "" && !isValidTimeForConstraints(draft, min, max, step)) {
            setDraft(isCanonicalTime(value) ? value : "");
          }
        }}
        className={`min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      />
      <span className="shrink-0 text-sm font-semibold text-slate-500" aria-hidden="true">น.</span>
    </div>
  );
}

export interface FutVerseThaiDateTimeInputProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  dateClassName?: string;
  timeClassName?: string;
  "aria-label"?: string;
}

function splitLocalDateTime(value: string): { date: string; time: string } {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
  if (!match || !parseCanonicalDateOnly(match[1]) || !isCanonicalTime(match[2])) {
    return { date: "", time: "" };
  }
  return { date: match[1], time: match[2] };
}

export function FutVerseThaiDateTimeInput({
  id,
  name,
  value,
  onChange,
  required = false,
  disabled = false,
  className = "",
  dateClassName = "",
  timeClassName = "",
  "aria-label": ariaLabel = "วันและเวลา",
}: FutVerseThaiDateTimeInputProps) {
  const [parts, setParts] = useState(() => splitLocalDateTime(value));
  const canonicalParts = splitLocalDateTime(value);

  useEffect(() => {
    setParts(splitLocalDateTime(value));
  }, [value]);

  function updateDate(date: string) {
    const next = { ...parts, date };
    setParts(next);
    if (next.date && next.time) onChange(`${next.date}T${next.time}`);
    else if (value) onChange("");
  }

  function updateTime(time: string) {
    const next = { ...parts, time };
    setParts(next);
    if (next.date && next.time) onChange(`${next.date}T${next.time}`);
    else if (value) onChange("");
  }

  const visibleDate = canonicalParts.date || parts.date;
  const visibleTime = canonicalParts.time || parts.time;

  return (
    <div className={`grid gap-2 sm:grid-cols-2 ${className}`}>
      {name && <input type="hidden" name={name} value={canonicalParts.date && canonicalParts.time ? value : ""} disabled={disabled} />}
      <div>
        <span className="mb-1 block text-xs font-semibold text-slate-500">วันที่</span>
        <FutVerseThaiDateInput
          id={id ? `${id}-date` : undefined}
          value={visibleDate}
          onChange={updateDate}
          required={required}
          disabled={disabled}
          className={dateClassName}
          aria-label={`${ariaLabel} วันที่`}
        />
      </div>
      <div>
        <span className="mb-1 block text-xs font-semibold text-slate-500">เวลา</span>
        <FutVerseThaiTimeInput
          id={id ? `${id}-time` : undefined}
          value={visibleTime}
          onChange={updateTime}
          required={required}
          disabled={disabled}
          className={timeClassName}
          aria-label={`${ariaLabel} เวลา`}
        />
      </div>
    </div>
  );
}
