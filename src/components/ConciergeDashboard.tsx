import React from "react";
import { useAuth } from "../contexts/AuthContext";
import { Database, Users } from "lucide-react";
import { EmptyState } from "./common/EmptyState";

export default function ConciergeDashboard({
  onNavigate: _onNavigate,
}: {
  onNavigate: (page: string) => void;
}) {
  const { hasPermission } = useAuth();

  if (!hasPermission(["DATA_ADMIN"])) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500">Access Denied</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <Database className="text-cyan-600" /> Concierge Dashboard
        </h1>
        <p className="text-sm font-medium text-slate-500 mt-1">
          Data Entry Concierge Service - Assigned Clients
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-500 font-bold text-sm">
              Assigned Clients
            </h3>
            <div className="w-8 h-8 rounded-full bg-cyan-100 text-cyan-600 flex items-center justify-center">
              <Database size={16} />
            </div>
          </div>
          <p className="text-3xl font-black text-slate-800">0</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-800">Your Clients</h2>
          </div>
        </div>

        <div className="flex-1 p-6 flex flex-col justify-center min-h-[200px]">
          <EmptyState
            icon={Users}
            title="Assigned Clients Unavailable"
            description="No authorized Firestore-backed Concierge assignment inventory is available."
          />
        </div>
      </div>
    </div>
  );
}
