import type { ProClubWeeklyTrainingDraft } from "./proClubWeeklyTraining";
import type { ProClubWeeklyTrainingFreshDraftInput } from "./proClubWeeklyTrainingDraftSaveClient";

/**
 * Builds a new fresh-DRAFT input from an already validated saved DRAFT.
 *
 * The source plan identity, tenant/actor bindings, audit metadata and closed
 * Technical Director note are deliberately not copied. The caller must save
 * through the existing Fresh-DRAFT path, which binds the current club/actor and
 * creates a new deterministic request/plan identity.
 */
export function buildFreshWeeklyTrainingDraftFromSavedDraft(
  source: ProClubWeeklyTrainingDraft,
): ProClubWeeklyTrainingFreshDraftInput {
  return {
    weekStartDate: source.weekStartDate,
    squadLabel: source.squadLabel,
    mainObjective: source.mainObjective,
    ...(source.secondaryObjective !== undefined
      ? { secondaryObjective: source.secondaryObjective }
      : {}),
    ...(source.headCoachNote !== undefined
      ? { headCoachNote: source.headCoachNote }
      : {}),
    sessions: source.sessions.map((session) => ({
      sessionDate: session.sessionDate,
      startTime: session.startTime,
      location: session.location,
      objective: session.objective,
      phaseOfPlay: session.phaseOfPlay,
      plannedLoad: session.plannedLoad,
      durationMinutes: session.durationMinutes,
      blocks: session.blocks.map((block) => ({
        blockType: block.blockType,
        title: block.title,
        durationMinutes: block.durationMinutes,
        ...(block.drillReference !== undefined
          ? { drillReference: block.drillReference }
          : {}),
        coachingPoints: [...block.coachingPoints],
      })),
    })),
  };
}
