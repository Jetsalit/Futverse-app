import { useEffect, useState } from "react";

import FitnessTestCatalogue from "../../fitness/FitnessTestCatalogue";
import { calendarDateInTimeZone, parseCanonicalDateOnly } from "../../../lib/dateTimeFoundation";
import {
  FOOTBALL_FITNESS_TEST_CATALOGUE,
  type FitnessOrganizationRef,
} from "../../../lib/fitnessTestFoundation";
import {
  loadProClubFitnessWeeklyTrainingRead,
} from "../../../lib/firestore/proClubFitnessWeeklyTrainingReadAdapter";
import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import type { ProClubFitnessResultsServices } from "./ProClubFitnessResults";
import ProClubFitnessResults from "./ProClubFitnessResults";
import ProClubHeadCoachWeeklyProductionWorkspace, {
  canRenderHeadCoachWeeklyProductionWorkspace,
  type ProClubWeeklyFitnessContext,
} from "./ProClubHeadCoachWeeklyProductionWorkspace";

export const PRO_CLUB_FITNESS_TRAINING_TABS = [
  { id: "FITNESS_TESTS", label: "Fitness Tests" },
  { id: "FITNESS_RESULTS", label: "Fitness Results" },
  { id: "WEEKLY_TRAINING", label: "Weekly Training" },
] as const;

export type ProClubFitnessTrainingTab =
  (typeof PRO_CLUB_FITNESS_TRAINING_TABS)[number]["id"];

export interface ProClubFitnessTrainingWorkspaceProps {
  authority: ProClubOrganizationAuthority;
  organization: FitnessOrganizationRef;
  canManageCatalogue: boolean;
  onTakeAttendance?: (slot: { sessionDate: string; startTime: string }) => void;
  onOpenSubmissions?: () => void;
  resultsServices?: ProClubFitnessResultsServices;
  loadWeeklyFitnessContext?: typeof loadProClubFitnessWeeklyTrainingRead;
}

function authorityScope(authority: ProClubOrganizationAuthority): string {
  return [
    authority.organizationId,
    authority.userId,
    authority.organizationStatus,
    authority.membershipStatus,
    authority.hasMembershipAuthority ? "AUTHORIZED" : "UNAUTHORIZED",
    authority.staffRole ?? "NO_ROLE",
  ].join("|");
}

export default function ProClubFitnessTrainingWorkspace({
  authority,
  organization,
  canManageCatalogue,
  onTakeAttendance,
  onOpenSubmissions,
  resultsServices,
  loadWeeklyFitnessContext = loadProClubFitnessWeeklyTrainingRead,
}: ProClubFitnessTrainingWorkspaceProps) {
  const [selectedTab, setSelectedTab] = useState<ProClubFitnessTrainingTab>("FITNESS_TESTS");
  const [weeklyContextState, setWeeklyContextState] = useState<{
    scope: string;
    context: ProClubWeeklyFitnessContext;
  }>({ scope: "", context: { state: "LOADING" } });
  const scope = authorityScope(authority);
  const canLoadWeeklyContext = canRenderHeadCoachWeeklyProductionWorkspace(authority);
  const weeklyContext = weeklyContextState.scope === scope
    ? weeklyContextState.context
    : { state: "LOADING" as const };

  useEffect(() => {
    if (selectedTab !== "WEEKLY_TRAINING" || !canLoadWeeklyContext) return;

    let current = true;
    setWeeklyContextState({ scope, context: { state: "LOADING" } });
    const referenceDate = calendarDateInTimeZone(new Date(), "Asia/Bangkok");
    if (!referenceDate || parseCanonicalDateOnly(referenceDate) === null) {
      setWeeklyContextState({ scope, context: { state: "READ_ERROR" } });
      return () => { current = false; };
    }

    void loadWeeklyFitnessContext({
      clubId: authority.organizationId,
      referenceDate,
      definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
    }).then((selection) => {
      if (
        selection.organization.organizationType !== "PRO_CLUB" ||
        selection.organization.organizationId !== authority.organizationId ||
        selection.prescription !== null
      ) {
        throw new Error("Weekly Training Fitness context did not match its read-only tenant contract.");
      }
      if (current) {
        setWeeklyContextState({
          scope,
          context: { state: "READY", referenceDate, selection },
        });
      }
    }).catch(() => {
      if (current) setWeeklyContextState({ scope, context: { state: "READ_ERROR" } });
    });

    return () => { current = false; };
  }, [
    authority.organizationId,
    canLoadWeeklyContext,
    loadWeeklyFitnessContext,
    scope,
    selectedTab,
  ]);

  function selectTab(nextTab: ProClubFitnessTrainingTab) {
    if (nextTab === "WEEKLY_TRAINING" && selectedTab !== "WEEKLY_TRAINING") {
      setWeeklyContextState({ scope, context: { state: "LOADING" } });
    }
    setSelectedTab(nextTab);
  }

  return (
    <section aria-label="Fitness and Training workspace" className="space-y-5">
      <div
        role="tablist"
        aria-label="Fitness and Training sections"
        className="flex min-w-0 gap-2 overflow-x-auto rounded-2xl border border-slate-700 bg-slate-950/60 p-2"
      >
        {PRO_CLUB_FITNESS_TRAINING_TABS.map(({ id, label }) => {
          const selected = selectedTab === id;
          return (
            <button
              key={id}
              id={`pro-club-fitness-tab-${id.toLowerCase()}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="pro-club-fitness-training-panel"
              onClick={() => selectTab(id)}
              className={[
                "min-h-10 shrink-0 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition",
                selected
                  ? "bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-300/30"
                  : "text-slate-300 hover:bg-white/5 hover:text-white",
              ].join(" ")}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div
        id="pro-club-fitness-training-panel"
        role="tabpanel"
        aria-labelledby={`pro-club-fitness-tab-${selectedTab.toLowerCase()}`}
        className="min-w-0"
      >
        {selectedTab === "FITNESS_TESTS" && (
          <FitnessTestCatalogue
            organization={organization}
            canManage={canManageCatalogue}
            variant="pro-club"
          />
        )}
        {selectedTab === "FITNESS_RESULTS" && (
          <ProClubFitnessResults authority={authority} services={resultsServices} />
        )}
        {selectedTab === "WEEKLY_TRAINING" && (
          <ProClubHeadCoachWeeklyProductionWorkspace
            authority={authority}
            fitnessContext={weeklyContext}
            onTakeAttendance={onTakeAttendance}
            onOpenSubmissions={onOpenSubmissions}
          />
        )}
      </div>
    </section>
  );
}
