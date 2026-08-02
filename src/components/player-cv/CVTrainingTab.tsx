import React from "react";
import { Calendar } from "lucide-react";
import PlayerTrainingDashboard from "../PlayerTrainingDashboard";

interface CVTrainingTabProps {
  player: any;
}

function CVTrainingTab({ player }: CVTrainingTabProps) {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Calendar className="text-indigo-600" size={28} />
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Training Log & Attendance</h2>
      </div>
      
      <PlayerTrainingDashboard playerId={player.id} />
    </div>
  );
}

export default React.memo(CVTrainingTab);
