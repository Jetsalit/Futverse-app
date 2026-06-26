import React, { useState } from 'react';
import { useAuth, User } from '../contexts/AuthContext';
import { Users, ShieldAlert, ArrowLeft, CreditCard, CheckCircle, XCircle, Image as ImageIcon, X, Database } from 'lucide-react';

const INITIAL_USERS: User[] = [
  { id: '1', name: 'Director J', email: 'director@futverse.com', role: 'ADMIN', status: 'Active' },
  { id: '2', name: 'Coach Pep', email: 'pep@futverse.com', role: 'COACH', status: 'Active' },
  { id: '3', name: 'Coach Klopp', email: 'klopp@futverse.com', role: 'COACH', status: 'Inactive' },
  { id: '4', name: 'Chief Scout', email: 'scout@futverse.com', role: 'SCOUT', status: 'Active' },
  { id: '5', name: 'Parent Dan', email: 'parent.dan@mail.com', role: 'USER', status: 'Active' },
  { 
    id: '6', 
    name: 'Academy XYZ', 
    email: 'contact@academy-xyz.com', 
    role: 'USER', 
    status: 'Pending',
    subscriptionPlan: 'yearly',
    paymentDetails: { date: '2026-06-21', time: '14:30', slipUrl: 'https://images.unsplash.com/photo-1620714223084-8fcacc6dfd8d?auto=format&fit=crop&q=80&w=600' } 
  },
  { 
    id: '7', 
    name: 'Coach Thomas', 
    email: 'thomas@example.com', 
    role: 'COACH', 
    status: 'Pending',
    subscriptionPlan: 'monthly',
    paymentDetails: { date: '2026-06-22', time: '09:15', slipUrl: 'https://images.unsplash.com/photo-1620714223084-8fcacc6dfd8d?auto=format&fit=crop&q=80&w=600' } 
  },
  { id: '8', name: 'Data Entry Pro', email: 'data@futverse.com', role: 'DATA_ADMIN', status: 'Active', assignedClients: ['2', '6'] },
];

export default function SuperadminPortal({ onBack }: { onBack: () => void }) {
  const { hasPermission, impersonate } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'approvals' | 'staff'>('users');
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [selectedSlipUser, setSelectedSlipUser] = useState<User | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<User | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  if (!hasPermission(['SUPERADMIN'])) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500">Access Denied</p>
      </div>
    );
  }

  const pendingUsers = users.filter(u => u.status === 'Pending');

  const handleApprove = (userId: string) => {
    setUsers(users.map(u => {
      if (u.id === userId) {
        return { ...u, status: 'Active' }; // Simplified, in real app set expiry date
      }
      return u;
    }));
    closeModal();
  };

  const handleReject = (userId: string) => {
    if (!rejectReason) return;
    setUsers(users.map(u => {
      if (u.id === userId) {
        return { ...u, status: 'Inactive', rejectionReason: rejectReason };
      }
      return u;
    }));
    closeModal();
  };

  const closeModal = () => {
    setSelectedSlipUser(null);
    setRejectReason('');
    setIsRejecting(false);
  };

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              <ShieldAlert className="text-violet-600" /> Superadmin Portal
            </h1>
            <p className="text-sm font-medium text-slate-500">Manage users and global system settings.</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-slate-200 bg-slate-50 px-4">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors ${
                activeTab === 'users' ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Users size={18} /> User Management
              </div>
            </button>
            <button
              onClick={() => setActiveTab('approvals')}
              className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors ${
                activeTab === 'approvals' ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <CreditCard size={18} /> 
                Payment Approvals 
                {pendingUsers.length > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full">{pendingUsers.length}</span>
                )}
              </div>
            </button>
            <button
              onClick={() => setActiveTab('staff')}
              className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors ${
                activeTab === 'staff' ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Database size={18} /> Data Entry Staff
              </div>
            </button>
          </div>
          
          {activeTab === 'users' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Role</th>
                        <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.filter(u => u.status !== 'Pending').map(user => (
                        <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                              <div className="font-bold text-slate-800 text-sm">{user.name}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500 font-medium">{user.email}</td>
                          <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                user.role === 'ADMIN' ? 'bg-rose-100 text-rose-700' :
                                user.role === 'COACH' ? 'bg-emerald-100 text-emerald-700' :
                                user.role === 'SCOUT' ? 'bg-amber-100 text-amber-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>
                                {user.role}
                              </span>
                          </td>
                          <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                user.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                              }`}>
                                {user.status}
                              </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => impersonate(user)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors"
                              >
                                <span className="text-base leading-none">🎭</span> Act As
                              </button>
                          </td>
                        </tr>
                    ))}
                  </tbody>
              </table>
            </div>
          )}

          {activeTab === 'approvals' && (
            <div className="overflow-x-auto">
              {pendingUsers.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle size={32} />
                  </div>
                  <h3 className="text-slate-800 font-bold mb-1">No pending approvals</h3>
                  <p className="text-slate-500 text-sm">All subscriptions are up to date.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">User / Academy</th>
                        <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Package</th>
                        <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Transfer Info</th>
                        <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider text-right">Verification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingUsers.map(user => (
                        <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                              <div className="font-bold text-slate-800 text-sm">{user.name}</div>
                              <div className="text-xs text-slate-500">{user.email}</div>
                          </td>
                          <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                user.subscriptionPlan === 'yearly' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-700'
                              }`}>
                                {user.subscriptionPlan === 'yearly' ? 'Yearly' : 'Monthly'}
                              </span>
                          </td>
                          <td className="px-6 py-4">
                              <div className="text-sm font-bold text-slate-700">{user.paymentDetails?.date}</div>
                              <div className="text-xs text-slate-500">at {user.paymentDetails?.time}</div>
                          </td>
                          <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => setSelectedSlipUser(user)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-bold rounded-lg transition-colors"
                              >
                                <ImageIcon size={14} /> View Slip
                              </button>
                          </td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {activeTab === 'staff' && (
            <div className="overflow-x-auto p-4 max-w-4xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-800">Data Entry Team</h3>
                <button className="px-4 py-2 bg-violet-600 text-white font-bold rounded-lg text-sm hover:bg-violet-700 transition-colors">
                  + Add Staff
                </button>
              </div>
              <div className="space-y-4">
                {users.filter(u => u.role === 'DATA_ADMIN').map(staff => (
                  <div key={staff.id} className="p-4 border border-slate-200 rounded-xl bg-white flex items-center justify-between shadow-sm">
                    <div>
                      <div className="font-bold text-slate-800 text-sm">{staff.name}</div>
                      <div className="text-xs text-slate-500">{staff.email}</div>
                      <div className="mt-2 text-xs font-bold text-cyan-600 bg-cyan-50 px-2 py-1 rounded inline-block">
                        {staff.assignedClients?.length || 0} Assigned Clients
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setSelectedStaff(staff);
                        setIsAssignModalOpen(true);
                      }}
                      className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg text-sm hover:bg-slate-200 transition-colors"
                    >
                      Assign Clients
                    </button>
                  </div>
                ))}
                {users.filter(u => u.role === 'DATA_ADMIN').length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    No data entry staff found. Add one to get started.
                  </div>
                )}
              </div>
            </div>
          )}
      </div>

      {/* Assign Clients Modal */}
      {isAssignModalOpen && selectedStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
             <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <Database className="text-cyan-600" /> Assign Clients
                </h3>
                <button onClick={() => setIsAssignModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-200 transition-colors">
                  <X size={20} />
                </button>
             </div>
             <div className="p-6 overflow-y-auto">
               <p className="text-sm text-slate-500 mb-4">Select clients (Coaches/Academies) to assign to <span className="font-bold text-slate-800">{selectedStaff.name}</span></p>
               <div className="space-y-2 max-h-64 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-slate-50">
                 {users.filter(u => u.role === 'COACH' || u.role === 'USER').map(client => {
                   const isAssigned = selectedStaff.assignedClients?.includes(client.id!);
                   return (
                     <label key={client.id} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-lg cursor-pointer hover:border-slate-300 transition-colors">
                       <input 
                         type="checkbox" 
                         checked={isAssigned || false}
                         onChange={(e) => {
                           const newAssigned = e.target.checked 
                             ? [...(selectedStaff.assignedClients || []), client.id!]
                             : (selectedStaff.assignedClients || []).filter(id => id !== client.id);
                             
                           const updatedStaff = { ...selectedStaff, assignedClients: newAssigned };
                           setSelectedStaff(updatedStaff);
                           setUsers(users.map(u => u.id === selectedStaff.id ? updatedStaff : u));
                         }}
                         className="w-4 h-4 text-cyan-600 rounded border-slate-300"
                       />
                       <div>
                         <div className="text-sm font-bold text-slate-800">{client.name}</div>
                         <div className="text-xs text-slate-500">{client.role}</div>
                       </div>
                     </label>
                   )
                 })}
               </div>
               <button 
                 onClick={() => setIsAssignModalOpen(false)}
                 className="w-full mt-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-sm transition-colors"
               >
                 Done
               </button>
             </div>
          </div>
        </div>
      )}

      {/* View Slip Modal */}
      {selectedSlipUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <CreditCard className="text-indigo-600" /> Slip Verification
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <div className="mb-6 flex gap-4 text-sm bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="flex-1">
                  <div className="text-slate-500 mb-1">User / Academy</div>
                  <div className="font-bold text-slate-800">{selectedSlipUser.name}</div>
                </div>
                <div className="flex-1">
                  <div className="text-slate-500 mb-1">Package</div>
                  <div className="font-bold text-slate-800 capitalize">{selectedSlipUser.subscriptionPlan}</div>
                </div>
                <div className="flex-1">
                  <div className="text-slate-500 mb-1">Time & Date</div>
                  <div className="font-bold text-slate-800">{selectedSlipUser.paymentDetails?.date} {selectedSlipUser.paymentDetails?.time}</div>
                </div>
              </div>

              <div className="w-full h-80 bg-slate-100 rounded-xl border border-slate-200 overflow-hidden mb-6 flex justify-center items-center">
                <img src={selectedSlipUser.paymentDetails?.slipUrl || undefined} alt="Slip" className="max-h-full max-w-full object-contain" />
              </div>

              {isRejecting ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                  <label className="block text-sm font-bold text-slate-700">Reason for rejection</label>
                  <input 
                    type="text" 
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g. Invalid slip, incorrect amount..." 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none"
                    autoFocus
                  />
                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={() => handleReject(selectedSlipUser.id!)}
                      disabled={!rejectReason}
                      className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-sm transition-colors disabled:opacity-50"
                    >
                      Confirm Rejection
                    </button>
                    <button 
                      onClick={() => setIsRejecting(false)}
                      className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button 
                    onClick={() => handleApprove(selectedSlipUser.id!)}
                    className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-[0_4px_12px_rgba(16,185,129,0.3)] hover:shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={18} /> Approve & Activate
                  </button>
                  <button 
                    onClick={() => setIsRejecting(true)}
                    className="flex-1 py-3.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl border border-rose-200 transition-colors flex items-center justify-center gap-2"
                  >
                    <XCircle size={18} /> Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
