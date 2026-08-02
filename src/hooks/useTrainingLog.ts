import { useState, useEffect } from "react";
import { collection, query, where, getDocs, documentId } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAcademy } from "../contexts/AcademyContext";

export type TimeRange = "Week" | "Month" | "Season" | "Career";
export type AttendanceStatus = "Present" | "Late" | "Absent" | "Sick" | "Injured";

export interface Drill {
  id: string;
  name: string;
  duration?: number;
}

export interface IDPTraining {
  activity: string;
  minutes: number;
  repetitions: number;
  completedAt: string;
  coachVerified: boolean;
  idpId?: string;
  goalId?: string;
}

export interface TrainingLogEntry {
  rpe: number;
  minutes: number;
  notes: string;
  idpTraining?: IDPTraining;
}

export interface NormalizedSession {
  id: string;
  date: string;
  dayOfWeek: string;
  theme: string | null;
  intensity: string | null;
  objective: string;
  drills: Drill[];
  attendanceStatus: AttendanceStatus | null;
  log: TrainingLogEntry | null;
}

export function useTrainingLog(playerId: string | null, timeRange: TimeRange) {
  const { academyId, activeSeason, getAcademyCollection } = useAcademy();
  const [sessions, setSessions] = useState<NormalizedSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!academyId || !playerId) {
      setSessions([]);
      return;
    }

    const fetchLogs = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const trainingWeeksRef = getAcademyCollection("training_weeks");
        let q = query(trainingWeeksRef);

        const today = new Date();
        
        if (timeRange === "Week") {
          const startOfWeek = new Date(today);
          const day = today.getDay();
          const diff = today.getDate() - day + (day === 0 ? -6 : 1);
          startOfWeek.setDate(diff - 7); // Include previous week as buffer
          
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(endOfWeek.getDate() + 21); // Include next week as buffer
          
          const formatStr = (d: Date) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dt = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dt}`;
          };

          q = query(
            trainingWeeksRef,
            where(documentId(), ">=", formatStr(startOfWeek)),
            where(documentId(), "<=", formatStr(endOfWeek))
          );
        } else if (timeRange === "Month") {
          const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          startOfMonth.setDate(startOfMonth.getDate() - 7);
          const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          endOfMonth.setDate(endOfMonth.getDate() + 7);
          
          const formatStr = (d: Date) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dt = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dt}`;
          };

          q = query(
            trainingWeeksRef, 
            where(documentId(), ">=", formatStr(startOfMonth)),
            where(documentId(), "<=", formatStr(endOfMonth))
          );
        } else if (timeRange === "Season") {
          const year = parseInt(activeSeason) || today.getFullYear();
          const startOfSeason = new Date(year, 0, 1);
          startOfSeason.setDate(startOfSeason.getDate() - 7);
          const endOfSeason = new Date(year, 11, 31);
          
          const formatStr = (d: Date) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dt = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dt}`;
          };

          q = query(
            trainingWeeksRef, 
            where(documentId(), ">=", formatStr(startOfSeason)),
            where(documentId(), "<=", formatStr(endOfSeason))
          );
        }
        // Career = no where clause (fetches all)

        const [querySnapshot, matchSnapshot] = await Promise.all([
          getDocs(q),
          getDocs(query(getAcademyCollection("matches"))) // Fetch all matches then filter manually if needed, or query if bounds exist. But since matches are few, fetch all is fine for now, or we can apply bounds. We will fetch all and filter in JS to be safe with indexing.
        ]);
        
        const allSessions: NormalizedSession[] = [];

        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const days = data.days || [];
          const attendanceDB = data.attendanceDB || {};
          const trainingLogsDB = data.trainingLogsDB || {};

          days.forEach((day: any) => {
            const dayAttendance = attendanceDB[day.id] || {};
            const dayLogs = trainingLogsDB[day.id] || {};
            const playerStatus = dayAttendance[playerId] || null;
            const playerLog = dayLogs[playerId] || null;
            const hasDataForPlayer = Boolean(playerStatus) || Boolean(playerLog);

            if (day.theme !== "Rest" && (day.theme || hasDataForPlayer || (day.drills && day.drills.length > 0))) {
              allSessions.push({
                id: day.id,
                date: day.date,
                dayOfWeek: day.dayOfWeek,
                theme: day.theme || "วันฝึกซ้อม",
                intensity: day.intensity || "Medium",
                objective: day.objective || "",
                drills: day.drills || [],
                attendanceStatus: playerStatus,
                log: playerLog,
              });
            }
          });
        });

        // Add Match Sessions
        matchSnapshot.forEach(docSnap => {
          const m = { id: docSnap.id, ...docSnap.data() } as any;
          if (!m.matchDate) return;

          let matchRecord = null;
          if (m.playersData && m.playersData[playerId]) {
            matchRecord = m.playersData[playerId];
          }
          if (!matchRecord && m.players) {
            matchRecord = m.players.find((p: any) => p.id === playerId);
          }
          if (!matchRecord && m.guestPlayers) {
            matchRecord = m.guestPlayers.find((gp: any) => gp.id === playerId);
          }

          if (matchRecord) {
            // Apply time range filter if needed
            if (timeRange !== "Career") {
              // We need startStr and endStr from the above logic.
              // To avoid re-computing, we can extract it or just check matchDate against the boundaries.
              // But wait, startStr/endStr were local to the if/else blocks.
              // Let's compute standard JS Dates for the bounds.
            }
            
            // To make it simpler, we compute the bounds again:
            const matchDate = new Date(m.matchDate);
            const today = new Date();
            let inRange = true;
            
            if (timeRange === "Week") {
              const day = today.getDay();
              const diff = today.getDate() - day + (day === 0 ? -6 : 1);
              const monday = new Date(today);
              monday.setDate(diff);
              monday.setHours(0,0,0,0);
              
              const sunday = new Date(monday);
              sunday.setDate(sunday.getDate() + 6);
              sunday.setHours(23,59,59,999);
              
              if (matchDate < monday || matchDate > sunday) inRange = false;
            } else if (timeRange === "Month") {
              const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
              const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
              if (matchDate < startOfMonth || matchDate > endOfMonth) inRange = false;
            } else if (timeRange === "Season") {
              const year = parseInt(activeSeason) || today.getFullYear();
              const startOfSeason = new Date(year, 0, 1);
              const endOfSeason = new Date(year, 11, 31, 23, 59, 59, 999);
              if (matchDate < startOfSeason || matchDate > endOfSeason) inRange = false;
            }

            if (inRange) {
              const mins = Number(matchRecord.minutesPlayed || matchRecord.metrics?.minutes || 0);
              const d = new Date(m.matchDate);
              const dayOfWeekStr = d.toLocaleDateString('en-US', { weekday: 'short' });
              
              allSessions.push({
                id: m.id,
                date: m.matchDate,
                dayOfWeek: dayOfWeekStr,
                theme: "Match Day",
                intensity: "High",
                objective: m.opponentName ? `vs ${m.opponentName}` : "Official Match",
                drills: [],
                attendanceStatus: "Present",
                log: {
                  rpe: 9, // Match standard RPE
                  minutes: mins,
                  notes: "Official Match Load"
                }
              });
            }
          }
        });

        // Sort chronologically
        allSessions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        setSessions(allSessions);
      } catch (err: any) {
        console.error("Error fetching training logs:", err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogs();
  }, [academyId, playerId, timeRange, activeSeason]);

  return { sessions, isLoading, error };
}
