import React from "react";

import type {
  SuperAdminAccountOrganizationContext,
} from "./superAdminAccountOrganizationContext";

interface SuperAdminAccountOrganizationCellsProps {
  context: SuperAdminAccountOrganizationContext;
}

function presentationStateLabel(value: string): string {
  return value.replace(/_/g, " ");
}

export default function SuperAdminAccountOrganizationCells({
  context,
}: SuperAdminAccountOrganizationCellsProps) {
  if (context.state === "LOADING") {
    return (
      <>
        <td className="min-w-[240px] p-4 align-top">
          <div className="text-xs font-bold text-slate-500">
            Checking organization context...
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Academy authority is still loading.
          </div>
        </td>

        <td className="min-w-[210px] p-4 align-top">
          <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-500">
            Authority pending
          </span>
        </td>
      </>
    );
  }

  if (context.state === "UNAVAILABLE") {
    return (
      <>
        <td className="min-w-[240px] p-4 align-top">
          <div className="text-xs font-bold text-rose-700">
            Organization authority unavailable
          </div>
          <div className="mt-1 text-[11px] text-rose-600">
            No authority is inferred while the authoritative inventory is unavailable.
          </div>
        </td>

        <td className="min-w-[210px] p-4 align-top">
          <span className="inline-flex rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700">
            Authority unavailable
          </span>
        </td>
      </>
    );
  }

  if (context.state === "OUT_OF_SYNC") {
    return (
      <>
        <td className="min-w-[240px] p-4 align-top">
          <div className="text-xs font-black text-amber-800">
            Refresh required
          </div>
          <div className="mt-1 max-w-[320px] text-[11px] leading-relaxed text-amber-700">
            {context.reason}
          </div>
        </td>

        <td className="min-w-[210px] p-4 align-top">
          <span className="inline-flex rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800">
            Authority not resolved
          </span>
        </td>
      </>
    );
  }

  if (context.state === "READY") {
    const current = context.presentation.current;
    const historical = context.presentation.historical;

    return (
      <>
        <td className="min-w-[280px] p-4 align-top">
          <div className="space-y-3">
            {current.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                  Current
                </div>

                <div className="space-y-1.5">
                  {current.map((relationship) => {
                    const organizationName = relationship.organizationName || relationship.organizationId;

                    return (
                      <div
                        key={[
                          "current",
                          relationship.organizationId,
                          relationship.role,
                          relationship.status,
                          relationship.playerId || "",
                          relationship.futId || "",
                        ].join(":")}
                        className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-2.5 py-2"
                      >
                        <div className="text-xs font-black text-slate-800">
                          {organizationName}
                        </div>

                        <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                          {relationship.organizationType}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {historical.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  Historical
                </div>

                <div className="space-y-1.5">
                  {historical.map((relationship) => {
                    const organizationName = relationship.organizationName || relationship.organizationId;

                    return (
                      <div
                        key={[
                          "historical",
                          relationship.organizationId,
                          relationship.role,
                          relationship.status,
                          relationship.playerId || "",
                          relationship.futId || "",
                        ].join(":")}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"
                      >
                        <div className="text-xs font-bold text-slate-700">
                          {organizationName}
                        </div>

                        <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          {relationship.role} · {relationship.status}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {current.length === 0 && historical.length === 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] font-semibold text-slate-600">
                No Academy relationship in connected V1 coverage
              </div>
            )}

            {context.presentation.issues.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] leading-relaxed text-amber-800">
                {context.presentation.issues.join(" · ")}
              </div>
            )}

            {context.coverage.proClubAuthority === "NOT_CONNECTED" && (
              <div className="text-[10px] font-semibold text-slate-400">
                Pro Club authority not connected
              </div>
            )}
          </div>
        </td>

        <td className="min-w-[230px] p-4 align-top">
          <div className="space-y-2">
            {current.length > 0 ? (
              current.map((relationship) => {
                const organizationName = relationship.organizationName || relationship.organizationId;

                return (
                  <div
                    key={[
                      "authority",
                      relationship.organizationId,
                      relationship.role,
                      relationship.status,
                      relationship.playerId || "",
                      relationship.futId || "",
                    ].join(":")}
                    className="rounded-lg border border-indigo-100 bg-indigo-50/70 px-2.5 py-2"
                  >
                    <div className="text-[10px] font-semibold text-slate-500">
                      {organizationName}
                    </div>

                    <div className="mt-0.5 text-xs font-black text-indigo-900">
                      {relationship.role}
                    </div>

                    <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-600">
                      {relationship.status}
                    </div>

                    {(relationship.playerName || relationship.futId) && (
                      <div className="mt-1 text-[10px] text-slate-500">
                        {relationship.playerName || relationship.futId}
                        {relationship.playerName && relationship.futId
                          ? ` · ${relationship.futId}`
                          : ""}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] font-semibold text-slate-600">
                No current Academy authority
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                {presentationStateLabel(context.presentation.presentationState)}
              </span>

              <span className="inline-flex rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                {context.presentation.source}
              </span>

              <span className="inline-flex rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                {context.presentation.integrity}
              </span>
            </div>
          </div>
        </td>
      </>
    );
  }

  return null;
}
