import type { ProClubWeeklyPeriodizationBoard as ProClubWeeklyPeriodizationBoardModel } from "../../../lib/proClubWeeklyPeriodizationBoard";
import WeeklyPlannerBoard from "./WeeklyPlannerBoard";

export default function WeeklyPeriodizationBoard({
  board,
}: {
  board: ProClubWeeklyPeriodizationBoardModel;
}) {
  return <WeeklyPlannerBoard board={board} />;
}
