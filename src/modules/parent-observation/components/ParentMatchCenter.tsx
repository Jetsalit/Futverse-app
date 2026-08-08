import React, { useState, useEffect } from "react";
import { ChevronRight, Calendar, Users, MapPin, Shield, CheckCircle } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { collection, doc, getDoc, query, getDocs, where } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { Match } from "../../../types/Match";
import { linkedPlayerLookupForUser } from "../../../lib/nonStaffPlayerAccess";

export default function ParentMatchCenter({ onSelectMatch }: { onSelectMatch: (matchId: string, playerId: string, position?: string, academyId?: string) => void }) {
  const { currentUser } = useAuth();
  const [realPlayerId, setRealPlayerId] = useState<string>("");
  const [realPlayerPosition, setRealPlayerPosition] = useState<string>("Field");
  const [realAcademyId, setRealAcademyId] = useState<string>("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [recordedMatchIds, setRecordedMatchIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUser?.id) return;

    const fetchData = async () => {
      setIsLoading(true);

      try {
        const lookup = linkedPlayerLookupForUser(currentUser);
        if (lookup.kind !== "PARENT_DOCUMENT") {
          throw new Error("Parent access requires an exact Academy and linked Player pointer.");
        }

        const foundAcademyId = lookup.academyId;
        const foundPlayerId = lookup.playerId;
        const playerSnapshot = await getDoc(doc(
          db,
          `academies/${foundAcademyId}/players`,
          foundPlayerId,
        ));
        if (!playerSnapshot.exists()) {
          throw new Error("The linked Player profile was not found.");
        }

        const playerData = playerSnapshot.data();
        if (playerData.position) {
          const position = String(playerData.position).trim().toUpperCase();
          setRealPlayerPosition(
            position === "GK" || position === "GOALKEEPER" || position.includes("GOAL")
              ? "Goalkeeper"
              : playerData.position,
          );
        }
        setRealPlayerId(foundPlayerId);

        // Fetch matches using the resolved academyId
        setRealAcademyId(foundAcademyId);
        // Match documents do not currently expose a Rules-queryable Parent link.
        // Exact linked-match reads remain protected, but an Academy-wide list is not attempted.
        setMatches([]);

        // Fetch only observation sessions created by this Parent.
        const sessionsQ = query(
          collection(db, `academies/${foundAcademyId}/observation_sessions`),
          where("academyId", "==", foundAcademyId),
          where("creatorId", "==", currentUser.id),
          where("playerId", "==", foundPlayerId),
          where("source", "==", "PARENT"),
        );
        const sessionsSnap = await getDocs(sessionsQ);
        const recordedIds = new Set<string>();
        sessionsSnap.docs.forEach(sessionDocument => {
          const data = sessionDocument.data();
          if (data.contextId) {
            recordedIds.add(data.contextId);
          }
        });
        setRecordedMatchIds(recordedIds);
      } catch (error) {
        console.error("Error fetching ParentMatchCenter data", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [currentUser]);

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading matches...</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-800 tracking-tight">Match Center</h1>
        <p className="text-slate-500 mt-2">Select a match to record your positive observations.</p>
      </div>

      <div className="space-y-4">
        {matches.length === 0 ? (
          <div className="text-center p-8 bg-slate-50 rounded-2xl border border-slate-200">
            <Calendar size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500 font-medium">No matches available for observation yet.</p>
          </div>
        ) : (
          matches.map((match) => (
            <div 
              key={match.id}
              onClick={() => onSelectMatch(match.id, realPlayerId, realPlayerPosition, realAcademyId)}
              className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group flex items-center justify-between"
            >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center shrink-0 border border-slate-200">
                  <Shield size={24} className="text-slate-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-[10px] font-bold tracking-widest uppercase bg-indigo-50 text-indigo-600 px-2 py-1 rounded">
                    {match.competitionType}
                  </span>
                  {match.status === "COMPLETED" && (
                    <span className="text-[10px] font-bold tracking-widest uppercase bg-emerald-50 text-emerald-600 px-2 py-1 rounded flex items-center gap-1">
                      <CheckCircle size={10} /> Played
                    </span>
                  )}
                  {match.status === "SCHEDULED" && (
                    <span className="text-[10px] font-bold tracking-widest uppercase bg-blue-50 text-blue-600 px-2 py-1 rounded flex items-center gap-1">
                      Upcoming
                    </span>
                  )}
                  {recordedMatchIds.has(match.id) && (
                    <span className="text-[10px] font-bold tracking-widest uppercase bg-purple-50 text-purple-600 px-2 py-1 rounded flex items-center gap-1 border border-purple-200">
                      <CheckCircle size={10} /> Evaluated
                    </span>
                  )}
                </div>
                  <h3 className="text-lg font-black text-slate-800 group-hover:text-indigo-600 transition-colors">
                    vs {match.opponent}
                  </h3>
                  <div className="flex items-center gap-4 text-xs font-medium text-slate-500 mt-1">
                    <span className="flex items-center gap-1"><Calendar size={14} /> {match.matchDate}</span>
                    <span className="flex items-center gap-1"><MapPin size={14} /> {match.location}</span>
                  </div>
                </div>
              </div>
              <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-slate-50 group-hover:bg-indigo-50 transition-colors text-slate-400 group-hover:text-indigo-600">
                <ChevronRight size={20} />
              </div>
            </div>
          </div>
        )))}
      </div>
    </div>
  );
}
