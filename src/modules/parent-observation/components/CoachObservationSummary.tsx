import React, { useState, useEffect } from "react";
import { MessageCircle, BarChart3, Users, Target } from "lucide-react";
import { ObservationLiveEvent, ObservationReflection, ObservationMetric } from "../types";
import { 
  getObservationLiveEventsByMatch, 
  getObservationReflectionsByMatch, 
  getSystemMetrics 
} from "../firebase/api";
import { useAcademy } from "../../../contexts/AcademyContext";
import { DynamicMatchIcon } from "./MatchEventIcons";

export default function CoachObservationSummary({ matchId, playerId }: { matchId: string; playerId: string }) {
  const { academyId } = useAcademy();
  const [liveEvents, setLiveEvents] = useState<ObservationLiveEvent[]>([]);
  const [reflections, setReflections] = useState<ObservationReflection[]>([]);
  const [metricsMap, setMetricsMap] = useState<Record<string, ObservationMetric>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!matchId || !playerId || !academyId) return;
      setIsLoading(true);
      try {
        const [eventsData, reflectionsData, metricsData] = await Promise.all([
          getObservationLiveEventsByMatch(academyId, matchId, playerId),
          getObservationReflectionsByMatch(academyId, matchId, playerId),
          getSystemMetrics()
        ]);
        
        // Filter out INVALID or DELETED events
        const activeEvents = eventsData.filter(e => e.eventStatus === "ACTIVE");
        const activeReflections = reflectionsData.filter(r => r.eventStatus === "ACTIVE");

        setLiveEvents(activeEvents);
        setReflections(activeReflections);
        
        const mMap: Record<string, ObservationMetric> = {};
        metricsData.forEach(m => mMap[m.metricCode] = m); // Use metricCode for mapping
        setMetricsMap(mMap);
      } catch (error) {
        console.error("Error fetching observation summary", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [matchId, playerId, academyId]);

  if (isLoading) return <div className="text-sm text-slate-400">Loading parent observations...</div>;
  
  // Calculate unique observation sessions based on unique creators in reflections
  const uniqueObservers = new Set(reflections.map(r => r.creatorId));
  
  // Debug output instead of just hiding
  if (uniqueObservers.size === 0 && liveEvents.length === 0) {
    return (
      <div className="text-sm text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200">
        No parent observations found for this match ({matchId}) and player ({playerId}).
      </div>
    );
  }

  // Calculate summary stats
  const metricCounts: Record<string, number> = {};
  liveEvents.forEach(ev => {
    metricCounts[ev.metricCode] = (metricCounts[ev.metricCode] || 0) + 1;
  });

  const totalClicks = liveEvents.length;
  // If there are observers, average clicks per observer, else use total
  const observerCount = uniqueObservers.size || 1;
  const averageObservationCount = (totalClicks / observerCount).toFixed(1);
  
  // Find all selected metrics
  const topMetrics = Object.entries(metricCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({
      metric: metricsMap[code],
      count
    }))
    .filter(item => item.metric); 

  const comments = reflections.map(r => r.comment).filter(Boolean);
  const latestComment = comments.length > 0 ? comments[comments.length - 1] : null;

  return (
    <div className="bg-white rounded-2xl border border-indigo-200 p-6 shadow-sm overflow-hidden relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
      
      <div className="flex items-center gap-2 mb-6 relative z-10">
        <Users className="text-indigo-500" size={24} />
        <h2 className="text-lg font-black text-slate-800">
          Observation Engine Summary <span className="text-xs text-indigo-400 font-normal ml-2">(Rev 3.8)</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="bg-indigo-50 rounded-xl p-4 flex-1 border border-indigo-100 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-1">Observers</div>
                <div className="text-2xl font-black text-indigo-900">{uniqueObservers.size}</div>
              </div>
              <Users size={24} className="text-indigo-300" />
            </div>
            
            <div className="bg-emerald-50 rounded-xl p-4 flex-1 border border-emerald-100 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">Total Actions</div>
                <div className="text-2xl font-black text-emerald-900">{totalClicks} <span className="text-xs text-emerald-600 font-normal">({averageObservationCount}/user)</span></div>
              </div>
              <BarChart3 size={24} className="text-emerald-300" />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <Target size={16} className="text-slate-400" /> Recorded Actions
            </h3>
            <div className="flex flex-wrap gap-2">
              {topMetrics.length > 0 ? topMetrics.map(({ metric, count }) => (
                <div key={metric.metricCode} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-bold ${metric.color}`}>
                  <DynamicMatchIcon iconId={metric.icon} size={16} />
                  <span>{metric.metricName}</span>
                  <span className="bg-white/50 px-1.5 rounded-md ml-1 text-xs">
                    {metric.displayType === "Toggle" ? (count > 0 ? "✓" : "") : count}
                  </span>
                </div>
              )) : (
                <span className="text-sm text-slate-400">No actions recorded.</span>
              )}
            </div>
          </div>
        </div>

        {latestComment && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 relative">
            <MessageCircle className="text-slate-300 absolute top-5 right-5" size={24} />
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Latest Parent Comment</h3>
            <p className="text-slate-700 text-sm italic leading-relaxed relative z-10">
              "{latestComment}"
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
