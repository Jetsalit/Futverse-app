import React, { useState } from "react";
import { MatchEvent } from "../types/Match";
import { Clock, Plus } from "lucide-react";

export default function MatchTimeline({ 
  events, 
  matchId, 
  academyId, 
  onEventsChange 
}: { 
  events: MatchEvent[]; 
  matchId: string; 
  academyId: string;
  onEventsChange: () => void;
}) {
  const [isAdding, setIsAdding] = useState(false);

  // In a real app, we would add the form to create events here.
  // For Phase 1 demonstration, we will just show the timeline layout.

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Events ({events.length})</h4>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors"
        >
          <Plus size={16} /> Add Event
        </button>
      </div>

      {isAdding && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl mb-6">
          <p className="text-sm text-slate-500 italic mb-2">Event creation form placeholder (Phase 1 scope limits).</p>
          <button onClick={() => setIsAdding(false)} className="text-sm text-slate-400 hover:text-slate-600">Cancel</button>
        </div>
      )}

      {events.length === 0 ? (
        <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-2xl">
          <Clock className="mx-auto text-slate-300 mb-2" size={32} />
          <p className="text-slate-500 font-medium">No events recorded yet.</p>
          <p className="text-sm text-slate-400">Click 'Add Event' to log goals, cards, and more.</p>
        </div>
      ) : (
        <div className="relative border-l-2 border-slate-200 ml-4 space-y-6">
          {events.map(event => (
            <div key={event.eventId} className="relative pl-6">
              <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-white border-2 border-indigo-500"></div>
              <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <div className="flex justify-between items-start mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-indigo-600">{event.minute}'</span>
                    <span className="font-bold text-slate-800">{event.eventType}</span>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 bg-slate-100 rounded text-slate-600">{event.team}</span>
                </div>
                <div className="text-sm text-slate-600">
                  Player ID: {event.playerId.substring(0, 6)}...
                  {event.secondaryPlayerId && ` (Assist: ${event.secondaryPlayerId.substring(0, 6)}...)`}
                </div>
                {event.notes && <div className="text-xs text-slate-500 mt-2 italic">"{event.notes}"</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
