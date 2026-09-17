import type { ProClubWeeklyPeriodizationBoard as ProClubWeeklyPeriodizationBoardModel } from "../../../lib/proClubWeeklyPeriodizationBoard";
import WeeklyPlannerBoard from "./WeeklyPlannerBoard";

export default function WeeklyPeriodizationBoard({
  board,
  onTakeAttendance,
}: {
  board: ProClubWeeklyPeriodizationBoardModel;
  onTakeAttendance?: (slot: { sessionDate: string; startTime: string }) => void;
}) {
  return (
    <WeeklyPlannerBoard
      board={board}
      onTakeAttendance={onTakeAttendance}
    />
  );
}
