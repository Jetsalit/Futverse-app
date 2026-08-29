import {
  buildPlayerPositionMap,
} from "../../lib/playerPositionMap";

import type {
  PlayerPositionMapMarker,
  PlayerPositionMapSource,
} from "../../lib/playerPositionMap";


interface PlayerPositionMapProps {
  source: PlayerPositionMapSource;
  position?: string | null;
  secondaryPosition?: string | null;
}


function markerAriaLabel(
  marker: PlayerPositionMapMarker,
): string {
  const role =
    marker.kind === "PRIMARY"
      ? "Primary"
      : "Secondary";

  if (marker.placement === "FALLBACK") {
    return `${role} position ${marker.displayText}, exact pitch role not mapped`;
  }

  if (marker.placement === "EITHER_FLANK") {
    return `${role} position ${marker.displayText}, side not specified`;
  }

  return `${role} position ${marker.displayText}`;
}


function markerCircleClass(
  marker: PlayerPositionMapMarker,
): string {
  if (marker.placement === "FALLBACK") {
    return [
      "flex h-10 w-10 items-center justify-center",
      "rounded-full border-2 border-dashed",
      "border-slate-300 bg-slate-900/85",
      "text-xs font-black text-white",
      "shadow-lg backdrop-blur-sm",
    ].join(" ");
  }

  if (marker.placement === "EITHER_FLANK") {
    return [
      "flex h-10 w-10 items-center justify-center",
      "rounded-full border-2 border-dashed",
      "border-white/90 bg-indigo-500/90",
      "text-[10px] font-black text-white",
      "shadow-lg shadow-indigo-950/30",
      "backdrop-blur-sm",
    ].join(" ");
  }

  if (marker.kind === "SECONDARY") {
    return [
      "flex h-9 w-9 items-center justify-center",
      "rounded-full border-2 border-indigo-300",
      "bg-white text-[10px] font-black",
      "text-indigo-700 shadow-lg",
      "shadow-slate-950/20",
    ].join(" ");
  }

  return [
    "flex h-10 w-10 items-center justify-center",
    "rounded-full border-2 border-white",
    "bg-indigo-600 text-[10px] font-black",
    "text-white shadow-lg",
    "shadow-indigo-950/35",
    "ring-4 ring-indigo-400/20",
  ].join(" ");
}


function markerText(
  marker: PlayerPositionMapMarker,
): string {
  if (marker.placement === "FALLBACK") {
    return "?";
  }

  return marker.canonicalKey;
}


export default function PlayerPositionMap({
  source,
  position,
  secondaryPosition,
}: PlayerPositionMapProps) {

  const map =
    buildPlayerPositionMap({
      source,
      position,
      secondaryPosition,
    });


  const hasSecondary =
    map.markers.some(
      (marker) =>
        marker.kind === "SECONDARY",
    );


  const ambiguousMarkers =
    map.markers.filter(
      (marker) =>
        marker.placement === "EITHER_FLANK",
    );


  const fallbackMarkers =
    map.markers.filter(
      (marker) =>
        marker.placement === "FALLBACK",
    );


  return (
    <section
      aria-label="Player position map"
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-500">
              Position Map
            </p>

            <h3 className="mt-1 text-lg font-black tracking-tight text-slate-900">
              Playing Position
            </h3>

            <p className="mt-1 text-xs leading-5 text-slate-500">
              Approximate playing area · presentation only
            </p>
          </div>

          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
            {source === "PRO"
              ? "Pro Player"
              : "Academy Player"}
          </span>
        </div>
      </div>


      <div className="p-5 sm:p-6">
        <div
          className={[
            "relative mx-auto",
            "aspect-[68/105]",
            "w-full max-w-[360px]",
            "overflow-hidden rounded-[28px]",
            "border border-emerald-300/30",
            "bg-emerald-950",
            "shadow-inner",
          ].join(" ")}
        >
          {/* Grass depth */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-emerald-800 via-emerald-900 to-emerald-950"
          />

          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.16]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to bottom, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.18) 10%, transparent 10%, transparent 20%)",
            }}
          />


          {/* Pitch markings */}
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 68 105"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full text-white/45"
          >
            <rect
              x="1"
              y="1"
              width="66"
              height="103"
              rx="1"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.65"
            />

            <line
              x1="1"
              y1="52.5"
              x2="67"
              y2="52.5"
              stroke="currentColor"
              strokeWidth="0.55"
            />

            <circle
              cx="34"
              cy="52.5"
              r="9.15"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.55"
            />

            <circle
              cx="34"
              cy="52.5"
              r="0.75"
              fill="currentColor"
            />


            {/* Attacking penalty area */}
            <rect
              x="13.84"
              y="1"
              width="40.32"
              height="16.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.55"
            />

            <rect
              x="24.84"
              y="1"
              width="18.32"
              height="5.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.55"
            />


            {/* Own penalty area */}
            <rect
              x="13.84"
              y="87.5"
              width="40.32"
              height="16.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.55"
            />

            <rect
              x="24.84"
              y="99.5"
              width="18.32"
              height="4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.55"
            />
          </svg>


          {/* Direction labels */}
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/20 px-2 py-1 text-[8px] font-black uppercase tracking-[0.18em] text-white/55 backdrop-blur-sm"
          >
            Attack
          </div>

          <div
            aria-hidden="true"
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/20 px-2 py-1 text-[8px] font-black uppercase tracking-[0.18em] text-white/45 backdrop-blur-sm"
          >
            Own Goal
          </div>


          {/* Position markers */}
          {map.markers.flatMap(
            (marker) =>
              marker.locations.map(
                (location, locationIndex) => {

                  const secondaryOffset =
                    marker.kind === "SECONDARY"
                      ? 7
                      : 0;


                  return (
                    <div
                      key={[
                        marker.kind,
                        marker.canonicalKey,
                        location.xPercent,
                        location.yPercent,
                        locationIndex,
                      ].join("-")}
                      aria-label={markerAriaLabel(marker)}
                      className="absolute z-10"
                      style={{
                        left:
                          `${location.xPercent}%`,
                        top:
                          `${location.yPercent}%`,
                        transform:
                          `translate(-50%, -50%) translate(${secondaryOffset}px, ${secondaryOffset}px)`,
                      }}
                    >
                      <div className="flex flex-col items-center">
                        <div
                          className={
                            markerCircleClass(marker)
                          }
                        >
                          {markerText(marker)}
                        </div>

                        <span
                          className={[
                            "mt-1 max-w-[92px]",
                            "truncate rounded-full",
                            "bg-slate-950/75",
                            "px-2 py-0.5",
                            "text-[8px] font-bold",
                            "text-white shadow-sm",
                            "backdrop-blur-sm",
                          ].join(" ")}
                        >
                          {marker.placement === "FALLBACK"
                            ? "Unmapped"
                            : marker.displayText}
                        </span>
                      </div>
                    </div>
                  );
                },
              ),
          )}


          {map.markers.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="rounded-2xl border border-white/15 bg-slate-950/55 px-5 py-4 text-center backdrop-blur-md">
                <p className="text-xs font-black uppercase tracking-wider text-white/80">
                  Position unavailable
                </p>

                <p className="mt-1 text-[10px] leading-4 text-white/50">
                  No position marker can be displayed.
                </p>
              </div>
            </div>
          )}
        </div>


        {/* Legend */}
        <div className="mt-5 flex flex-wrap gap-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-600 ring-2 ring-indigo-200" />

            <span className="text-[10px] font-bold text-slate-600">
              Primary
            </span>
          </div>


          {hasSecondary && (
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-indigo-400 bg-white" />

              <span className="text-[10px] font-bold text-slate-600">
                Secondary
              </span>
            </div>
          )}


          {ambiguousMarkers.length > 0 && (
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-dashed border-amber-500" />

              <span className="text-[10px] font-bold text-amber-700">
                Side not specified
              </span>
            </div>
          )}
        </div>


        {/* Semantic notices */}
        {ambiguousMarkers.map(
          (marker) => (
            <div
              key={`ambiguous-${marker.kind}-${marker.originalText}`}
              className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"
            >
              <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">
                Winger side not specified
              </p>

              <p className="mt-1 text-xs leading-5 text-amber-800/80">
                Stored position “{marker.displayText}” is shown on both flanks.
                FutVerse does not infer LW or RW.
              </p>
            </div>
          ),
        )}


        {fallbackMarkers.map(
          (marker) => (
            <div
              key={`fallback-${marker.kind}-${marker.originalText}`}
              className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Position not mapped
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-600">
                Stored position “{marker.displayText}” is preserved.
                The center badge is an unresolved display fallback,
                not an inferred football position.
              </p>
            </div>
          ),
        )}
      </div>
    </section>
  );
}