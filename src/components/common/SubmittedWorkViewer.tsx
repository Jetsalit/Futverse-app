import type { DrillSubmittedSnapshot } from "../../lib/drillSubmittedSnapshot";
import ReadOnlyTacticBoardCanvas from "./ReadOnlyTacticBoardCanvas";

type SubmittedWorkViewerProps = {
  snapshot: DrillSubmittedSnapshot;
};

const DETAIL_FIELDS = [
  ["title", "Title"],
  ["category", "Category"],
  ["duration", "Duration"],
  ["ageGroup", "Age group"],
  ["phase", "Phase"],
  ["trainingMethod", "Training method"],
  ["coachingPoints", "Coaching points"],
  ["description", "Description"],
  ["date", "Date"],
] as const;

export function SubmittedWorkViewer({ snapshot }: SubmittedWorkViewerProps) {
  const hasImage = typeof snapshot.previewImage === "string";
  const hasBoard = snapshot.canvasData !== undefined;

  return (
    <section
      className="space-y-5"
      aria-label="Submitted work"
      data-testid="submitted-work-viewer"
      data-visual-type={snapshot.visualType}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">Submitted work</h2>
        {snapshot.visualType === "BOTH" ? (
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
            Photo and tactic board
          </span>
        ) : null}
      </div>

      <div className={hasImage && hasBoard ? "grid gap-4 xl:grid-cols-2" : "space-y-4"}>
        {hasImage ? (
          <figure className="m-0 min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            <img
              src={snapshot.previewImage}
              alt="Submitted drill photo"
              className="block max-h-[32rem] w-full object-contain"
            />
            {hasBoard ? <figcaption className="border-t border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">Submitted photo</figcaption> : null}
          </figure>
        ) : null}
        {hasBoard ? (
          <figure className="m-0 min-w-0 space-y-2">
            <ReadOnlyTacticBoardCanvas canvasData={snapshot.canvasData!} />
            {hasImage ? <figcaption className="text-xs font-medium text-slate-600">Submitted tactic board</figcaption> : null}
          </figure>
        ) : null}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold text-slate-800">Drill details</h3>
        <dl className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
          {DETAIL_FIELDS.map(([key, label]) => {
            const value = snapshot.details[key];
            if (value === undefined) return null;
            return (
              <div key={key} className={key === "description" || key === "coachingPoints" ? "sm:col-span-2" : ""}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                <dd className="m-0 whitespace-pre-wrap break-words text-sm text-slate-900">{value}</dd>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}

export default SubmittedWorkViewer;
