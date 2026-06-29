import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Database, Search, ArrowRight, Shield, Users } from "lucide-react";
import { User } from "../contexts/AuthContext";
import { EmptyState } from "./common/EmptyState";

const CLIENTS: User[] = [
  {
    id: "2",
    name: "Coach Pep",
    email: "pep@futverse.com",
    role: "COACH",
    status: "ACTIVE",
  },
  {
    id: "3",
    name: "Dr. Somchai",
    email: "medical@futverse.com",
    role: "ADMIN",
    status: "ACTIVE",
  },
  {
    id: "4",
    name: "Scout A",
    email: "scout@futverse.com",
    role: "SCOUT",
    status: "ACTIVE",
  },
];

export default function ConciergeDashboard({
  onNavigate,
}: {
  onNavigate: (page: string) => void;
}) {
  const { hasPermission, actualUser, impersonate } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  if (!hasPermission(["DATA_ADMIN"])) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500">Access Denied</p>
      </div>
    );
  }

  // Filter clients based on actualUser's assignedClients
  const assignedClients = CLIENTS.filter((client) =>
    actualUser?.assignedClients?.includes(client.id!),
  );

  const filteredClients = assignedClients.filter(
    (client) =>
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

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
          <p className="text-3xl font-black text-slate-800">
            {assignedClients.length}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-800">Your Clients</h2>
          </div>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              type="text"
              placeholder="Search clients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none w-64"
            />
          </div>
        </div>

        {assignedClients.length === 0 ? (
          <div className="flex-1 p-6 flex flex-col justify-center min-h-[200px]">
            <EmptyState
              icon={Users}
              title="No Assigned Clients"
              description="You do not have any clients assigned to you yet. Please contact a Super Admin."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Client Name
                  </th>
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClients.map((client) => (
                  <tr
                    key={client.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    <td className="py-4 px-6">
                      <div className="font-bold text-slate-800">
                        {client.name}
                      </div>
                      <div className="text-xs text-slate-500 font-medium mt-0.5">
                        {client.email}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        {client.role}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border ${
                          client.status === "Active" ||
                          client.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : client.status === "Pending" ||
                                client.status === "PENDING"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-slate-50 text-slate-700 border-slate-200"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            client.status === "Active" ||
                            client.status === "ACTIVE"
                              ? "bg-emerald-500"
                              : client.status === "Pending" ||
                                  client.status === "PENDING"
                                ? "bg-amber-500"
                                : "bg-slate-400"
                          }`}
                        ></span>
                        {client.status || "Unknown"}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => impersonate(client)}
                        className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-800 transition-colors shadow-sm"
                      >
                        <Shield size={16} className="text-cyan-400" />
                        Log In As
                        <ArrowRight size={16} className="text-slate-400" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredClients.length === 0 && assignedClients.length > 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-10 text-center text-slate-500 font-medium"
                    >
                      No clients found matching "{searchTerm}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
