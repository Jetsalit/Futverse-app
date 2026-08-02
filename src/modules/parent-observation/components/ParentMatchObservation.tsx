import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, Save, Info, AlertCircle } from "lucide-react";
import { 
  ObservationMetric, 
  ObservationSession,
  ObservationLiveEvent,
  ObservationReflection,
  MatchSegment
} from "../types";
import { 
  getSystemMetrics, 
  getObservationSession, 
  createObservationSession,
  getObservationLiveEvents,
  batchSaveObservationLiveEvents,
  saveObservationReflection,
  updateObservationSession,
  getActiveObservationProfile
} from "../firebase/api";
import { useAuth } from "../../../contexts/AuthContext";
import { useAcademy } from "../../../contexts/AcademyContext";
import ParentMetricCategory from "./ParentMetricCategory";
import ParentSummary from "./ParentSummary";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { Match } from "../../../types/Match";

export default function ParentMatchObservation({ 
  matchId, 
  playerId,
  playerPosition = "Field",
  resolvedAcademyId,
  onBack 
}: { 
  matchId: string; 
  playerId: string;
  playerPosition?: string;
  resolvedAcademyId?: string;
  onBack: () => void; 
}) {
  const { currentUser } = useAuth();
  const { academyId, activeSeason } = useAcademy();
  
  const [session, setSession] = useState<ObservationSession | null>(null);
  const [metrics, setMetrics] = useState<ObservationMetric[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [matchContext, setMatchContext] = useState<Match | null>(null);
  const [playerContext, setPlayerContext] = useState<any>(null);
  const [contextError, setContextError] = useState<boolean>(false);

  // Queue for time-series events that haven't been pushed yet
  const liveEventsQueue = useRef<Omit<ObservationLiveEvent, "id">[]>([]);
  const eventSequence = useRef(0);

  useEffect(() => {
    const loadData = async () => {
      const effectiveAcademyId = resolvedAcademyId || academyId;
      if (!currentUser?.id || !effectiveAcademyId) return;
      setIsLoading(true);
      
      try {
        // 1. Resolve Match Context & Player Context first (GUARD)
        if (!matchId || !playerId) {
          setContextError(true);
          setIsLoading(false);
          return;
        }

        const matchDoc = await getDoc(doc(db, `academies/${effectiveAcademyId}/matches`, matchId));
        if (!matchDoc.exists()) {
          setContextError(true);
          setIsLoading(false);
          return;
        }
        
        const playerDoc = await getDoc(doc(db, `academies/${effectiveAcademyId}/players`, playerId));
        if (!playerDoc.exists()) {
          setContextError(true);
          setIsLoading(false);
          return;
        }

        setMatchContext({ id: matchDoc.id, ...matchDoc.data() } as Match);
        setPlayerContext({ id: playerDoc.id, ...playerDoc.data() });

        // 2. Load Observation Session
        let activeSession = await getObservationSession(effectiveAcademyId, matchId, currentUser.id);
        
        // Check if session needs recreation:
        // - No session exists
        // - Session has empty/missing snapshot
        // - Session's profileVersion is outdated (admin activated a new profile version)
        let needsRecreation = !activeSession || !activeSession.immutableMetricSnapshot || activeSession.immutableMetricSnapshot.length === 0;
        
        if (!needsRecreation && activeSession) {
          // Check if the profile version has been updated since this session was created
          const currentActiveProfile = await getActiveObservationProfile(effectiveAcademyId);
          if (currentActiveProfile && activeSession.profileVersion !== currentActiveProfile.profileVersion) {
            // Profile was updated! Only recreate if the session has NOT been actively used (no live events recorded)
            const existingEventsForCheck = await getObservationLiveEvents(effectiveAcademyId, activeSession.id);
            const activeEventCount = existingEventsForCheck.filter(ev => ev.eventStatus === "ACTIVE").length;
            if (activeEventCount === 0) {
              needsRecreation = true;
            }
          }
        }
        
        if (needsRecreation) {
          if (activeSession) {
            // Cleanup the stale/outdated session document before creating a new one
            await deleteDoc(doc(db, `academies/${effectiveAcademyId}/observation_sessions`, activeSession.id));
          }

          const newSessionData: Omit<ObservationSession, "id" | "startedAt" | "immutableMetricSnapshot"> = {
            academyId: effectiveAcademyId,
            contextType: "MATCH",
            contextId: matchId,
            matchId: matchId,
            seasonId: activeSeason,
            source: "PARENT",
            creatorId: currentUser.id,
            sessionStatus: "IN_PROGRESS"
          };

          const sessionId = await createObservationSession(effectiveAcademyId, newSessionData);
          // Fetch back the session to retrieve the immutableMetricSnapshot generated by the service
          const createdSessionDoc = await getDoc(doc(db, `academies/${effectiveAcademyId}/observation_sessions`, sessionId));
          activeSession = { id: createdSessionDoc.id, ...createdSessionDoc.data() } as ObservationSession;
        }

        setSession(activeSession);
        
        // Helper function for robust position matching
        const isGoalkeeperPos = (pos?: any) => {
          if (!pos) return false;
          let pStr = "";
          if (Array.isArray(pos)) {
            pStr = pos.join(" ").toUpperCase();
          } else {
            pStr = String(pos).toUpperCase();
          }
          return pStr.includes("GK") || pStr.includes("GOALKEEPER") || pStr.includes("GOAL KEEPER") || pStr.includes("GOAL");
        };

        const rawPlayerData = playerDoc.data();
        const effectivePos = rawPlayerData?.position || playerPosition;
        const playerIsGK = isGoalkeeperPos(effectivePos);

        // Filter the immutableMetricSnapshot for UI display based on role and position
        let displayMetrics = activeSession.immutableMetricSnapshot.filter(m => {
          if (!m.allowedSource || !m.allowedSource.includes("PARENT")) return false;
          
          const posType = String(m.positionType || "").trim().toUpperCase();

          if (playerIsGK) {
            // For Goalkeepers: Strictly allow ONLY metrics with positionType "GOALKEEPER" or "ALL"
            if (posType === "GOALKEEPER" || posType === "ALL" || m.category === "Goalkeeper") {
              return true;
            }
            return false;
          } else {
            // For Outfield Players: Strictly exclude GOALKEEPER metrics
            if (posType === "GOALKEEPER" || m.category === "Goalkeeper") {
              return false;
            }
            return true;
          }
        });
        
        // Safety fallback: If displayMetrics is empty for any reason (e.g. no metrics enabled in active profile, or legacy empty snapshot),
        // dynamically load system default metrics appropriate for the player position so parents are never stuck with an empty screen.
        if (displayMetrics.length === 0) {
          const systemMetrics = await getSystemMetrics();
          displayMetrics = systemMetrics.filter(m => {
            if (!m.allowedSource || !m.allowedSource.includes("PARENT")) return false;
            const posType = String(m.positionType || "").trim().toUpperCase();
            if (playerIsGK) {
              return posType === "GOALKEEPER" || posType === "ALL" || m.category === "Goalkeeper";
            } else {
              return posType !== "GOALKEEPER" && m.category !== "Goalkeeper";
            }
          });
        }

        setMetrics(displayMetrics);

        // Load previously saved live events for UI count aggregation
        const existingEvents = await getObservationLiveEvents(effectiveAcademyId, activeSession.id);
        const aggregatedCounts: Record<string, number> = {};
        let maxSequence = 0;
        
        existingEvents.forEach(ev => {
          if (ev.eventStatus === "ACTIVE") {
            aggregatedCounts[ev.metricCode] = (aggregatedCounts[ev.metricCode] || 0) + 1;
          }
          if (ev.eventSequence > maxSequence) {
            maxSequence = ev.eventSequence;
          }
        });
        
        setCounts(aggregatedCounts);
        eventSequence.current = maxSequence;
        
      } catch (error) {
        console.error("Error loading observation session", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [matchId, playerId, currentUser?.id, playerPosition, academyId, activeSeason]);

  // Auto-flush live events queue every 5 seconds
  useEffect(() => {
    const intervalId = setInterval(() => {
      flushEventsQueue();
    }, 5000);

    return () => {
      clearInterval(intervalId);
      flushEventsQueue(); // Flush on unmount
    };
  }, [academyId, resolvedAcademyId]);

  const flushEventsQueue = async () => {
    const effectiveAcademyId = resolvedAcademyId || academyId;
    if (liveEventsQueue.current.length === 0 || !effectiveAcademyId) return;
    const eventsToPush = [...liveEventsQueue.current];
    liveEventsQueue.current = []; // Clear queue immediately to prevent double push
    
    try {
      await batchSaveObservationLiveEvents(effectiveAcademyId, eventsToPush);
    } catch (error) {
      console.error("Failed to flush live events", error);
      // Put them back in queue if failed
      liveEventsQueue.current = [...eventsToPush, ...liveEventsQueue.current];
    }
  };

  const recordEvent = (metric: ObservationMetric) => {
    const effectiveAcademyId = resolvedAcademyId || academyId;
    if (!session || !currentUser?.id || !effectiveAcademyId) return;
    
    eventSequence.current += 1;
    
    const newEvent: Omit<ObservationLiveEvent, "id"> = {
      academyId: effectiveAcademyId,
      sessionId: session.id,
      observationSchemaVersion: "v3.8",
      contextType: "MATCH",
      contextId: matchId,
      matchId: matchId,
      playerId,
      futId: `${playerId}-fut`, // Mock Global ID fallback for now
      seasonId: activeSeason,
      source: "PARENT",
      creatorId: currentUser.id,
      metricId: metric.id,
      metricCode: metric.metricCode,
      evaluationCriteriaVersion: "v1", // Default criteria version
      matchContext: { competitionType: "League", importance: "Normal" },
      eventStatus: "ACTIVE",
      matchSegment: "1H", // Ideally this should be dynamic based on a match timer
      evidence: "MANUAL_TAP",
      eventTimestamp: new Date(), // Local JS Date, will be saved as timestamp by Firebase
      eventSequence: eventSequence.current,
      weights: metric.weights, // Snapshot
      metricDifficulty: metric.metricDifficulty, // Snapshot
      confidenceWeight: 1.0 // Parent reliability base
    };

    liveEventsQueue.current.push(newEvent);
  };

  const handleIncrement = (metricId: string) => {
    const metric = metrics.find(m => m.id === metricId);
    if (!metric) return;
    
    setCounts(prev => ({ ...prev, [metric.id]: (prev[metric.id] || 0) + 1 }));
    recordEvent(metric);
  };

  const handleDecrement = (metricId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // For Revision 3.8, we decrement UI visually. 
    // True "Undo" of time-series would require finding the last event in Firestore and marking INVALID.
    // For simplicity in UI here, we just drop the UI count.
    setCounts(prev => {
      const current = prev[metricId] || 0;
      if (current <= 0) return prev;
      return { ...prev, [metricId]: current - 1 };
    });
  };

  const handleToggle = (metricId: string, newState: boolean) => {
    const metric = metrics.find(m => m.id === metricId);
    if (!metric) return;
    
    setCounts(prev => ({ ...prev, [metric.id]: newState ? 1 : 0 }));
    if (newState) {
      recordEvent(metric);
    }
  };

  const saveFinalReflection = async () => {
    const effectiveAcademyId = resolvedAcademyId || academyId;
    if (!session || !currentUser?.id || !effectiveAcademyId) return;
    setIsSaving(true);
    
    try {
      await flushEventsQueue(); // Ensure all live events are saved first

      const reflectionData: Omit<ObservationReflection, "id"> = {
        academyId: effectiveAcademyId,
        sessionId: session.id,
        observationSchemaVersion: "v3.8",
        contextType: "MATCH",
        contextId: matchId,
        matchId: matchId,
        playerId,
        futId: `${playerId}-fut`,
        seasonId: activeSeason,
        source: "PARENT",
        creatorId: currentUser.id,
        evaluationCriteriaVersion: "v1",
        matchContext: { competitionType: "League", importance: "Normal" },
        strengths: [],
        improvements: [],
        nextGoals: [],
        evidence: "MANUAL_TAP",
        comment: comment,
        version: 1,
        editedBy: currentUser.id,
        editedAt: new Date(),
        eventStatus: "ACTIVE"
      };

      await saveObservationReflection(effectiveAcademyId, reflectionData);
      
      // Complete Session
      await updateObservationSession(effectiveAcademyId, session.id, { 
        sessionStatus: "COMPLETED",
        completedAt: new Date()
      });

      alert("Observation session completed and saved successfully!");
      onBack();
    } catch (error) {
      console.error("Error saving final reflection", error);
      alert("Failed to save final observation.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading Observation Engine...</div>;

  if (contextError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-slate-50 p-6 rounded-2xl text-center">
        <AlertCircle size={48} className="text-rose-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">Match information unavailable.</h2>
        <p className="text-slate-500 mb-6">Please return to Matches and select a valid match.</p>
        <button 
          onClick={onBack}
          className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 transition"
        >
          BACK TO MATCHES
        </button>
      </div>
    );
  }

  // Render compatibility mapping
  const legacyMappedMetrics = metrics.map(m => ({
    ...m,
    name: m.metricName,
    enabled: true,
    sortOrder: 0
  })) as any[];

  const uniqueCategories = Array.from(new Set(legacyMappedMetrics.map(m => m.category).filter(Boolean)));
  
  const preferredOrder = ["Attack", "Defense", "Tactical", "Physical", "Mental", "Goalkeeper", "Behaviour", "Match Event"];
  const categories = uniqueCategories.sort((a, b) => {
    const indexA = preferredOrder.indexOf(a);
    const indexB = preferredOrder.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  const metricsByCategory = categories.reduce((acc, cat) => {
    acc[cat] = legacyMappedMetrics.filter(m => m.category === cat);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">
      <div className="flex items-center gap-4">
        <button onClick={() => { flushEventsQueue(); onBack(); }} className="p-2 -ml-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors">
          <ChevronLeft size={24} />
        </button>
      </div>

      {/* MATCH CONTEXT HEADER */}
      {matchContext && playerContext && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-center">
          <div className="text-xs font-black tracking-widest text-indigo-500 uppercase mb-2">Match Observation</div>
          
          <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-6 mb-4">
            <div className="text-lg md:text-xl font-black text-slate-800 truncate max-w-[200px] md:max-w-[300px]">
              {(matchContext as any).location === "AWAY" ? ((matchContext as any).opponent || "Opponent") : "Our Academy"}
            </div>
            <div className="text-sm font-bold text-slate-400">VS</div>
            <div className="text-lg md:text-xl font-black text-slate-800 truncate max-w-[200px] md:max-w-[300px]">
              {(matchContext as any).location === "AWAY" ? "Our Academy" : ((matchContext as any).opponent || "Opponent")}
            </div>
          </div>
          
          <div className="text-sm text-slate-500 font-medium flex items-center justify-center gap-2 mb-6 flex-wrap">
            <span>
              {((matchContext as any).date || (matchContext as any).matchDate) 
                ? new Date((matchContext as any).date || (matchContext as any).matchDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) 
                : "TBA"}
            </span>
            {((matchContext as any).time || (matchContext as any).kickoff) && (
              <>
                <span>·</span>
                <span>{(matchContext as any).time || (matchContext as any).kickoff}</span>
              </>
            )}
            {((matchContext as any).type || (matchContext as any).competitionType) && (
              <>
                <span>·</span>
                <span className="bg-slate-100 px-2 py-0.5 rounded text-xs text-slate-600">{(matchContext as any).type || (matchContext as any).competitionType}</span>
              </>
            )}
          </div>

          <div className="bg-indigo-50 p-4 rounded-xl inline-block text-left w-full max-w-md mx-auto">
            <div className="text-xs font-bold text-indigo-400 uppercase mb-1 flex items-center gap-1">
              <span className="text-lg">👤</span> Observing Player
            </div>
            <div className="text-indigo-900 font-black text-lg flex items-center gap-2">
              <span className="bg-indigo-600 text-white w-6 h-6 flex items-center justify-center rounded-full text-xs shrink-0">
                #{playerContext.jerseyNumber || "-"}
              </span>
              <span className="truncate">{playerContext.firstName} {playerContext.lastName}</span>
              {playerContext.ageGroup && (
                <span className="text-indigo-400 text-sm font-medium shrink-0">· {playerContext.ageGroup}</span>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-rose-500 font-black animate-pulse">
            <span className="w-2.5 h-2.5 bg-rose-500 rounded-full"></span>
            LIVE OBSERVATION
          </div>
        </div>
      )}

      <ParentSummary metrics={legacyMappedMetrics} counts={counts} />

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        {categories.map(category => (
          <ParentMetricCategory
            key={category}
            title={category}
            metrics={metricsByCategory[category]}
            counts={counts}
            onIncrement={handleIncrement}
            onDecrement={handleDecrement}
            onToggle={handleToggle}
          />
        ))}
        
        {metrics.length === 0 && (
          <div className="text-center py-8 text-slate-500 flex flex-col items-center gap-2">
            <AlertCircle size={32} className="text-slate-300" />
            <p>No observation metrics have been configured by the admin yet.</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="font-black text-slate-800 text-lg mb-2">Parent Reflection (Finalize Session)</h3>
        <p className="text-sm text-slate-500 mb-4">Share a few words to finalize this observation session.</p>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What positive things did you observe today?"
          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none h-32"
        />
      </div>

      <div className="flex justify-end pt-4 pb-12">
        <button
          onClick={saveFinalReflection}
          disabled={isSaving}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-8 py-4 rounded-xl font-black text-sm transition-all shadow-lg shadow-indigo-900/20 group"
        >
          {isSaving ? "COMPLETING SESSION..." : (
            <>
              <Save size={20} className="group-hover:scale-110 transition-transform" />
              COMPLETE OBSERVATION
            </>
          )}
        </button>
      </div>
    </div>
  );
}
