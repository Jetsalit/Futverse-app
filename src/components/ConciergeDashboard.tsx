import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Database, Search, ArrowRight, Shield } from 'lucide-react';
import { User } from '../contexts/AuthContext';

// We share MOCK_USERS from SuperadminPortal for simplicity, but we can just define a few here
const CLIENTS: User[] = [
  { id: '2', name: 'Coach Pep', email: 'pep@futverse.com', role: 'COACH', status: 'Active' },
  { id: '6', name: 'Academy XYZ', email: 'contact@academy-xyz.com', role: 'USER', status: 'Pending', subscriptionPlan: 'yearly' },
  { id: '10', name: 'Coach Arteta', email: 'mikel@example.com', role: 'COACH', status: 'Active' }
];

export default function ConciergeDashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { hasPermission, actualUser, impersonate } = useAuth();

  if (!hasPermission(['DATA_ADMIN'])) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500">Access Denied</p>
      </div>
    );
  }

  // Filter clients based on actualUser's assignedClients
  const assignedClients = CLIENTS.filter(client => 
    actualUser?.assignedClients?.includes(client.id!)
  );

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <Database className="text-cyan-600" /> Concierge Dashboard
        </h1>
        <p className="text-sm font-medium text-slate-500 mt-1">Data Entry Concierge Service - Assigned Clients</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-500 font-bold text-sm">Assigned Clients</h3>
            <div className="w-8 h-8 rounded-full bg-cyan-100 text-cyan-600 flex items-center justify-center">
              <Database size={16} />
            </div>
          </div>
          <p className="text-3xl font-black text-slate-800">{assignedClients.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-800">Your Clients</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Search clients..." 
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none w-64"
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Client / Academy</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Role</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Plan</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assignedClients.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    No clients assigned to you yet.
                  </td>
                </tr>
              ) : (
                assignedClients.map(client => (
                  <tr key={client.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800 text-sm">{client.name}</div>
                      <div className="text-xs text-slate-500 font-medium">{client.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">
                        {client.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {client.subscriptionPlan ? (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          client.subscriptionPlan === 'yearly' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'
                        }`}>
                          {client.subscriptionPlan}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => impersonate(client)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                      >
                        <span className="text-base leading-none">🎭</span> Act As / Data Entry
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
