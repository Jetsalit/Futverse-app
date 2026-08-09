import { useEffect, useState } from "react";
import { Building2, Search, ShieldCheck, UserRound, X } from "lucide-react";
import type { DashboardSearchResult } from "./dashboardModel";

interface SuperAdminSearchProps {
  results: readonly DashboardSearchResult[];
  onQueryChange: (query: string) => void;
  onSelect: (result: DashboardSearchResult) => void;
}

export default function SuperAdminSearch({
  results,
  onQueryChange,
  onSelect,
}: SuperAdminSearchProps) {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => onQueryChange(value), 400);
    return () => window.clearTimeout(timer);
  }, [onQueryChange, value]);

  const showResults = isFocused && value.trim().length >= 2;

  return (
    <div className="relative w-full max-w-xl">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => window.setTimeout(() => setIsFocused(false), 120)}
        placeholder="Search users, email, FUTID, academy..."
        aria-label="Search users, academies, and loaded profile claims"
        className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-11 text-sm text-slate-800 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={16} />
        </button>
      )}

      {showResults && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {results.length === 0 ? (
            <div className="px-4 py-5 text-center text-sm text-slate-500">
              No results in currently loaded data.
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto p-2">
              {results.map((result) => {
                const Icon = result.type === "academy"
                  ? Building2
                  : result.type === "claim"
                    ? ShieldCheck
                    : UserRound;
                return (
                  <button
                    key={result.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onSelect(result);
                      setIsFocused(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                      <Icon size={17} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-slate-800">{result.title}</span>
                      <span className="block truncate text-xs text-slate-500">{result.subtitle}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
            Searches loaded users, academies, and profile claims only.
          </div>
        </div>
      )}
    </div>
  );
}
