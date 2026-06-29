import React, { useState, useEffect } from "react";
import { useAuth, User } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  addDoc,
} from "firebase/firestore";
import {
  ShieldAlert,
  ArrowLeft,
  CheckCircle,
  XCircle,
  X,
  Search,
  Filter,
  Eye,
  Loader2,
} from "lucide-react";
import { subscribeToUsers, updateUserStatus } from "../lib/firestore/users";

export default function SuperadminPortal({ onBack }: { onBack: () => void }) {
  const { hasPermission, impersonate, currentUser: authUser } = useAuth();
  const [activeTab, setActiveTab] = useState<"approvals" | "users">(
    "approvals",
  );
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToUsers((firestoreUsers) => {
      setUsers(firestoreUsers.filter((u) => u.id !== authUser?.id));
      setIsLoadingUsers(false);
    });
    return () => unsubscribe();
  }, [authUser?.id]);

  if (!hasPermission(["SUPERADMIN"])) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500">Access Denied</p>
      </div>
    );
  }

  const pendingUsers = users.filter(
    (u) => u.status === "PENDING" || u.status === "Inactive",
  );
  const today = new Date().toDateString();
  const approvedToday = users.filter(
    (u) =>
      (u.status === "ACTIVE" || u.status === "Active") &&
      u.approvedAt &&
      new Date(u.approvedAt).toDateString() === today,
  ).length;
  const rejectedCount = users.filter(
    (u) => u.status === "REJECTED" || u.status === "Inactive",
  ).length;
  const coachesCount = users.filter(
    (u) => u.role === "COACH" || u.requestedRole === "COACH",
  ).length;
  const playersCount = users.filter(
    (u) => u.role === "PLAYER" || u.requestedRole === "PLAYER",
  ).length;
  const scoutsCount = users.filter(
    (u) => u.role === "SCOUT" || u.requestedRole === "SCOUT",
  ).length;
  const parentsCount = users.filter(
    (u) => u.role === "PARENT" || u.requestedRole === "PARENT",
  ).length;

  const handleApprove = async (user: User) => {
    if (!user.id) return;
    try {
      const newRole = user.requestedRole || "USER";
      await updateUserStatus(user.id, "Active", {
        role: newRole,
        approvedBy: authUser?.id || "SUPERADMIN",
        approvedAt: new Date().toISOString(),
      });
      await addDoc(collection(db, "logs"), {
        action: "USER_APPROVED",
        approvedBy: authUser?.id || "SUPERADMIN",
        targetUser: user.id,
        targetEmail: user.email,
        oldRole: user.role,
        newRole: newRole,
        timestamp: new Date(),
      });
      setSelectedUser(null);
    } catch (error) {
      console.error("Error approving user:", error);
    }
  };

  const handleReject = async (user: User) => {
    if (!user.id) return;
    const rejectReason = "Rejected by admin";
    try {
      await updateUserStatus(user.id, "Inactive", {
        rejectionReason: rejectReason,
      });
      await addDoc(collection(db, "logs"), {
        action: "USER_REJECTED",
        rejectedBy: authUser?.id || "SUPERADMIN",
        targetUser: user.id,
        targetEmail: user.email,
        timestamp: new Date(),
      });
      setSelectedUser(null);
    } catch (error) {
      console.error("Error rejecting user:", error);
    }
  };

  const handleBulkApprove = async () => {
    const toApprove = filteredPendingUsers;
    for (const u of toApprove) {
      await handleApprove(u);
    }
  };

  const handleUpdateRole = async (user: User, newRole: string) => {
    if (!user.id) return;
    try {
      await updateDoc(doc(db, "users", user.id), {
        role: newRole,
      });
      await addDoc(collection(db, "logs"), {
        action: "ROLE_UPDATED",
        updatedBy: authUser?.id || "SUPERADMIN",
        targetUser: user.id,
        targetEmail: user.email,
        oldRole: user.role,
        newRole: newRole,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Error updating role:", error);
    }
  };

  const handleUpdateStatus = async (user: User, newStatus: string) => {
    if (!user.id) return;
    try {
      await updateDoc(doc(db, "users", user.id), {
        status: newStatus,
      });
      await addDoc(collection(db, "logs"), {
        action: "STATUS_UPDATED",
        updatedBy: authUser?.id || "SUPERADMIN",
        targetUser: user.id,
        targetEmail: user.email,
        oldStatus: user.status,
        newStatus: newStatus,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const filteredPendingUsers = pendingUsers.filter((u) => {
    const matchesSearch =
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "ALL" || u.requestedRole === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              <ShieldAlert className="text-emerald-600" size={28} />
              SuperAdmin Portal
            </h1>
            <p className="text-sm text-slate-500 font-medium">
              System Administration & Security
            </p>
          </div>
        </div>
      </header>

      <div className="bg-white border-b border-slate-200 px-6 flex gap-6 shrink-0">
        <button
          onClick={() => setActiveTab("approvals")}
          className={`py-4 font-bold text-sm border-b-2 transition-colors ${
            activeTab === "approvals"
              ? "border-emerald-500 text-emerald-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span className="flex items-center gap-2">
            User Approval Center
            {pendingUsers.length > 0 && (
              <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                {pendingUsers.length}
              </span>
            )}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`py-4 font-bold text-sm border-b-2 transition-colors ${
            activeTab === "users"
              ? "border-emerald-500 text-emerald-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span className="flex items-center gap-2">Manage Users</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === "approvals" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="text-slate-500 text-xs font-bold uppercase mb-1">
                  Pending
                </div>
                <div className="text-2xl font-black text-rose-600">
                  {pendingUsers.length}
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="text-slate-500 text-xs font-bold uppercase mb-1">
                  Approved Today
                </div>
                <div className="text-2xl font-black text-emerald-600">
                  {approvedToday}
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="text-slate-500 text-xs font-bold uppercase mb-1">
                  Rejected
                </div>
                <div className="text-2xl font-black text-slate-800">
                  {rejectedCount}
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="text-slate-500 text-xs font-bold uppercase mb-1">
                  Coaches
                </div>
                <div className="text-2xl font-black text-blue-600">
                  {coachesCount}
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="text-slate-500 text-xs font-bold uppercase mb-1">
                  Players
                </div>
                <div className="text-2xl font-black text-indigo-600">
                  {playersCount}
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="text-slate-500 text-xs font-bold uppercase mb-1">
                  Scouts
                </div>
                <div className="text-2xl font-black text-amber-600">
                  {scoutsCount}
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="text-slate-500 text-xs font-bold uppercase mb-1">
                  Parents
                </div>
                <div className="text-2xl font-black text-purple-600">
                  {parentsCount}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex gap-4 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      size={16}
                    />
                    <input
                      type="text"
                      placeholder="Search users..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div className="relative">
                    <Filter
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      size={16}
                    />
                    <select
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                      className="pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none cursor-pointer"
                    >
                      <option value="ALL">All Roles</option>
                      <option value="COACH">Coach</option>
                      <option value="PLAYER">Player</option>
                      <option value="SCOUT">Scout</option>
                      <option value="PARENT">Parent</option>
                    </select>
                  </div>
                </div>
                {filteredPendingUsers.length > 0 && (
                  <button
                    onClick={handleBulkApprove}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-colors whitespace-nowrap"
                  >
                    Approve Filtered ({filteredPendingUsers.length})
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-4">User</th>
                      <th className="p-4">Contact</th>
                      <th className="p-4">Academy / Country</th>
                      <th className="p-4">Requested Role</th>
                      <th className="p-4">Date</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoadingUsers ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="p-8 text-center text-slate-500"
                        >
                          <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
                        </td>
                      </tr>
                    ) : filteredPendingUsers.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="p-8 text-center text-slate-500"
                        >
                          No pending users found.
                        </td>
                      </tr>
                    ) : (
                      filteredPendingUsers.map((user) => (
                        <tr
                          key={user.id}
                          className="hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="p-4 font-bold text-slate-800">
                            {user.name}
                          </td>
                          <td className="p-4">
                            <div className="text-slate-800">{user.email}</div>
                            {user.phone && (
                              <div className="text-xs text-slate-500">
                                {user.phone}
                              </div>
                            )}
                          </td>
                          <td className="p-4">
                            <div className="text-slate-800">
                              {user.academyId || "-"}
                            </div>
                            <div className="text-xs text-slate-500">
                              {user.country || "-"}
                            </div>
                          </td>
                          <td className="p-4">
                            <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full border border-amber-200">
                              {user.requestedRole || "N/A"}
                            </span>
                          </td>
                          <td className="p-4 text-slate-500 text-xs">
                            {user.createdAt
                              ? new Date(user.createdAt).toLocaleDateString()
                              : "-"}
                          </td>
                          <td className="p-4 text-right space-x-2 whitespace-nowrap">
                            <button
                              onClick={() => setSelectedUser(user)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="View Profile"
                            >
                              <Eye size={18} />
                            </button>
                            <button
                              onClick={() => handleApprove(user)}
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Approve"
                            >
                              <CheckCircle size={18} />
                            </button>
                            <button
                              onClick={() => handleReject(user)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Reject"
                            >
                              <XCircle size={18} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab === "users" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="relative flex-1 sm:w-64 w-full">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4">User</th>
                    <th className="p-4">Contact</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Role</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users
                    .filter(
                      (u) =>
                        u.name
                          ?.toLowerCase()
                          .includes(searchQuery.toLowerCase()) ||
                        u.email
                          ?.toLowerCase()
                          .includes(searchQuery.toLowerCase()),
                    )
                    .map((user) => (
                      <tr
                        key={user.id}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="p-4 font-bold text-slate-800">
                          {user.name}
                        </td>
                        <td className="p-4">
                          <div className="text-slate-800">{user.email}</div>
                        </td>
                        <td className="p-4">
                          <select
                            value={user.status || "INACTIVE"}
                            onChange={(e) =>
                              handleUpdateStatus(user, e.target.value)
                            }
                            disabled={user.role === "SUPERADMIN"}
                            className={`text-xs font-bold rounded-xl px-2 py-1 outline-none cursor-pointer border ${
                              user.status === "ACTIVE"
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                : user.status === "PENDING"
                                  ? "bg-amber-100 text-amber-800 border-amber-200"
                                  : user.status === "REJECTED"
                                    ? "bg-rose-100 text-rose-800 border-rose-200"
                                    : "bg-slate-100 text-slate-800 border-slate-200"
                            }`}
                          >
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="PENDING">PENDING</option>
                            <option value="REJECTED">REJECTED</option>
                            <option value="INACTIVE">SUSPENDED</option>
                          </select>
                        </td>
                        <td className="p-4">
                          <select
                            value={user.role || "USER"}
                            onChange={(e) =>
                              handleUpdateRole(user, e.target.value)
                            }
                            disabled={user.role === "SUPERADMIN"}
                            className="text-xs font-bold rounded-xl px-2 py-1 bg-slate-50 border border-slate-200 text-slate-800 outline-none cursor-pointer"
                          >
                            <option value="USER">USER</option>
                            <option value="PLAYER">PLAYER</option>
                            <option value="COACH">COACH</option>
                            <option value="SCOUT">SCOUT</option>
                            <option value="PARENT">PARENT</option>
                            <option value="ADMIN">ADMIN</option>
                            <option value="DATA_ADMIN">DATA_ADMIN</option>
                            <option value="SUPERADMIN" disabled>
                              SUPERADMIN
                            </option>
                          </select>
                        </td>
                        <td className="p-4 text-right space-x-2 whitespace-nowrap">
                          <button
                            onClick={() => setSelectedUser(user)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Profile"
                          >
                            <Eye size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {selectedUser && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-black text-slate-800">
                  User Profile
                </h3>
                <p className="text-sm text-slate-500">
                  Review details before approval
                </p>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-slate-500 text-xs font-bold uppercase mb-1">
                    Name
                  </div>
                  <div className="font-bold text-slate-800">
                    {selectedUser.name}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs font-bold uppercase mb-1">
                    Email
                  </div>
                  <div className="font-bold text-slate-800">
                    {selectedUser.email}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs font-bold uppercase mb-1">
                    Phone
                  </div>
                  <div className="font-bold text-slate-800">
                    {selectedUser.phone || "-"}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs font-bold uppercase mb-1">
                    Country
                  </div>
                  <div className="font-bold text-slate-800">
                    {selectedUser.country || "-"}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs font-bold uppercase mb-1">
                    Academy
                  </div>
                  <div className="font-bold text-slate-800">
                    {selectedUser.academyId || "-"}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs font-bold uppercase mb-1">
                    Requested Role
                  </div>
                  <div className="font-bold text-slate-800">
                    {selectedUser.requestedRole || "-"}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => handleReject(selectedUser)}
                className="px-4 py-2 text-rose-600 font-bold hover:bg-rose-50 rounded-xl transition-colors"
              >
                Reject
              </button>
              <button
                onClick={() => handleApprove(selectedUser)}
                className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2"
              >
                <CheckCircle size={18} />
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
