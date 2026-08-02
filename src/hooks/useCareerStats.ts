import { useState, useEffect } from "react";
import { collection, query, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Match, PlayerMatchRecord } from "../types/Match";

export interface CareerStats {
  totalMatches: number;
  totalGoals: number;
  totalAssists: number;
  totalMinutes: number;
  yellowCards: number;
  redCards: number;
  cleanSheets: number;
  saves: number;
  averageRating: number;
  recentForm: { matchDate: string; rating: number; opponent: string; matchId: string }[];
}

export function useCareerStats(academyId: string | undefined, playerId: string | undefined) {
  const [stats, setStats] = useState<CareerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!academyId || !playerId) {
      setLoading(false);
      return;
    }

    const matchesRef = collection(db, "academies", academyId, "matches");
    const qMatches = query(matchesRef, orderBy("matchDate", "desc"));

    const unsubscribe = onSnapshot(qMatches, (snapshot) => {
      const allMatches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      let totalMatches = 0;
      let totalGoals = 0;
      let totalAssists = 0;
      let totalMinutes = 0;
      let yellowCards = 0;
      let redCards = 0;
      let cleanSheets = 0;
      let saves = 0;
      let ratingSum = 0;
      let ratedMatches = 0;
      const recentForm: any[] = [];

      allMatches.forEach((m) => {
        // Find player record considering V3 mapping and V2 backward compatibility
        let matchRecord: PlayerMatchRecord | any = null;
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
          totalMatches += 1;
          
          // Compat with V2 vs V3
          const goals = Number(matchRecord.goals || matchRecord.metrics?.goals || 0);
          const assists = Number(matchRecord.assists || matchRecord.metrics?.assists || 0);
          const mins = Number(matchRecord.minutesPlayed || matchRecord.metrics?.minutes || 0);
          const yc = Number(matchRecord.yellowCards || 0);
          const rc = Number(matchRecord.redCards || 0);
          const rating = Number(matchRecord.rating || 0);
          
          // GK stats mapping
          const cs = matchRecord.cleanSheet ? 1 : 0;
          const sv = Number(matchRecord.saves || matchRecord.metrics?.saves || 0);

          totalGoals += goals;
          totalAssists += assists;
          totalMinutes += mins;
          yellowCards += yc;
          redCards += rc;
          cleanSheets += cs;
          saves += sv;

          if (rating > 0) {
            ratingSum += rating;
            ratedMatches += 1;
          }

          if (recentForm.length < 5) {
            recentForm.push({
              matchId: m.id,
              matchDate: m.matchDate || m.date || "Unknown",
              opponent: m.opponent || m.opponentName || "Unknown",
              rating: rating
            });
          }
        }
      });

      const averageRating = ratedMatches > 0 ? Number((ratingSum / ratedMatches).toFixed(1)) : 0;

      setStats({
        totalMatches,
        totalGoals,
        totalAssists,
        totalMinutes,
        yellowCards,
        redCards,
        cleanSheets,
        saves,
        averageRating,
        recentForm
      });
      setLoading(false);
    }, (error) => {
      console.error("Error fetching career stats:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [academyId, playerId]);

  return { stats, loading };
}
