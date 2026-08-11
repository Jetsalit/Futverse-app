import React, { useState, useEffect } from "react";
import { useAuth, User } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import {
  CheckCircle,
  XCircle,
  X,
  Search,
  Filter,
  Eye,
  Loader2,
} from "lucide-react";
import { subscribeToUsers } from "../lib/firestore/users";
import {
  SAFE_ACCOUNT_ROLES,
  assessRequestedIntent,
  genericApprovalBlockReason,
  isSafeAccountRole,
  type SafeAccountRole,
} from "../lib/accountRolePolicy";
import {
  APPROVED_ACCOUNT_STATUS,
  BULK_APPROVED_ROLE,
  MAX_ATOMIC_BULK_APPROVAL_USERS,
  approveUserAtomically,
  bulkApproveUsersAtomically,
  rejectUserAtomically,
  updateUserRoleAtomically,
  updateUserStatusAtomically,
} from "../lib/firestore/adminUserMutations";

import SuperAdminHeader from "./superadmin/SuperAdminHeader";
import SuperAdminOverview from "./superadmin/SuperAdminOverview";
import {
  deriveEffectiveRoleCounts,
  searchDashboardData,
  deriveDashboardAlerts,
  parseAuditLog,
  buildRecentActivities,
  type SuperAdminTab,
  type DashboardSearchResult,
  type DashboardLoadState,
  type AuditLogEntry,
} from "./superadmin/dashboardModel";
import { downloadSuperAdminDashboardCsv } from "./superadmin/dashboardExport";

const CLEAN_AVAILABLE_TABS = [
  "dashboard",
  "approvals",
  "users",
] as const;

type CleanTab = (typeof CLEAN_AVAILABLE_TABS)[number];

export default function SuperadminPortal({ onBack }: { onBack: () => void }) {
  const { hasPermission, currentUser: authUser } = useAuth();
  const [activeTab, setActiveTab] = useState<CleanTab>("dashboard");
  const [users, setUsers] = useState<User[]>([]);
  const [userLoadState, setUserLoadState] =
    useState<DashboardLoadState>("loading");
  const [userReadError, setUserReadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [headerSearchQuery, setHeaderSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [approvedRole, setApprovedRole] = useState<SafeAccountRole>("USER");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationNotice, setMutationNotice] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const [academyCount, setAcademyCount] = useState<number | null>(null);
  const [academyLoadState, setAcademyLoadState] =
    useState<DashboardLoadState>("idle");

  const [activityLogs, setActivityLogs] = useState<AuditLogEntry[]>([]);
  const [activityLoadState, setActivityLoadState] =
    useState<DashboardLoadState>("idle");

  useEffect(() => {
    setUserLoadState("loading");
    setUserReadError(null);
    setUsers([]);

    const unsubscribe = subscribeToUsers(
      (firestoreUsers) => {
        setUsers(firestoreUsers.filter((u) => u.id !== authUser?.id));
        setUserLoadState("loaded");
      },
      (error) => {
        console.error("SuperAdmin failed to read user inventory:", error);
        setUsers([]);
        setSelectedUser(null);
        setUserReadError(
          "Unable to read the Firestore user inventory. User counts, search, approvals, and exports are unavailable.",
        );
        setUserLoadState("unavailable");
      },
    );
    return () => unsubscribe();
  }, [authUser?.id]);

  useEffect(() => {
    let cancelled = false;
    async function fetchAcademyCount() {
      setAcademyLoadState("loading");
      try {
        const snapshot = await getDocs(collection(db, "academies"));
        if (cancelled) return;
        const count = snapshot.docs.filter(
          (academyDoc) => academyDoc.id !== "superadmin_system",
        ).length;
        setAcademyCount(count);
        setAcademyLoadState("loaded");
      } catch (err) {
        if (cancelled) return;
        console.error("SuperAdmin failed to fetch academy count:", err);
        setAcademyCount(null);
        setAcademyLoadState("unavailable");
      }
    }

    fetchAcademyCount();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchRecentActivity() {
      setActivityLoadState("loading");
      try {
        const activityQuery = query(
          collection(db, "logs"),
          orderBy("timestamp", "desc"),
          limit(8),
        );
        const snapshot = await getDocs(activityQuery);
        if (cancelled) return;
        const logs = snapshot.docs.map((logDoc) =>
          parseAuditLog(logDoc.id, logDoc.data() as Record<string, unknown>),
        );
        setActivityLogs(logs);
        setActivityLoadState("loaded");
      } catch (err) {
        if (cancelled) return;
        console.error("SuperAdmin failed to fetch recent activity:", err);
        setActivityLogs([]);
        setActivityLoadState("unavailable");
      }
    }

    fetchRecentActivity();
    return () => {
      cancelled = true;
    };
  }, []);

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
  const rejectedCount = users.filter((u) => u.status === "REJECTED").length;

  const roleCounts = deriveEffectiveRoleCounts(users);

  const recentActivities = buildRecentActivities(activityLogs, users);

  const alerts = deriveDashboardAlerts({
    pendingUsers: pendingUsers.length,
    paymentApprovals: null,
    profileClaims: null,
    errorReports: null,
  });

  const searchResults = searchDashboardData({
    query: headerSearchQuery,
    users,
    academies: [],
    claims: [],
  });

  const handleNavigate = (tab: SuperAdminTab) => {
    if ((CLEAN_AVAILABLE_TABS as readonly string[]).includes(tab)) {
      setActiveTab(tab as CleanTab);
    }
  };

  const handleSearchSelect = (result: DashboardSearchResult) => {
    if ((CLEAN_AVAILABLE_TABS as readonly string[]).includes(result.tab)) {
      setActiveTab(result.tab as CleanTab);
    }
    if (result.searchValue) {
      setSearchQuery(result.searchValue);
    }
  };

  const handleExportReport = () => {
    downloadSuperAdminDashboardCsv({
      exportedAt: new Date(),
      pendingUsers: pendingUsers.length,
      academyCount,
      academyLoadState,
      roleCounts,
      users,
      paymentApprovals: null,
      paymentApprovalsLoadState: "unavailable",
      profileClaims: null,
      profileClaimsLoadState: "unavailable",
      errorReports: null,
      errorReportsLoadState: "unavailable",
      recentActivities,
      recentActivityLoadState: activityLoadState,
    });
  };

  const actorUid = authUser?.uid || authUser?.id;
  const administrativeTarget = (user: User) => ({
    targetUid: user.id || "",
    targetEmail: user.email,
    previousRole: user.role,
    previousStatus: user.status,
    requestedRole: user.requestedRole,
  });

  const beginMutation = () => {
    setMutationError(null);
    setMutationNotice(null);
    setIsMutating(true);
  };

  const mutationFailure = (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : fallback;
    setMutationError(message);
    console.error(fallback, error);
  };

  const openUserReview = (user: User) => {
    setApprovedRole("USER");
    setMutationError(null);
    setMutationNotice(null);
    setSelectedUser(user);
  };

  const handleApprove = async (user: User) => {
    if (!user.id || !actorUid) {
      setMutationError("Canonical target UID and authenticated SuperAdmin UID are required.");
      return;
    }
    beginMutation();
    try {
      await approveUserAtomically({
        ...administrativeTarget(user),
        actorUid,
        approvedRole,
      });
      setSelectedUser(null);
      setMutationNotice(
        `${user.email || user.name} approved explicitly as ${approvedRole} / ${APPROVED_ACCOUNT_STATUS}.`,
      );
    } catch (error) {
      mutationFailure(error, "Error approving user");
    } finally {
      setIsMutating(false);
    }
  };

  const handleReject = async (user: User) => {
    if (!user.id || !actorUid) {
      setMutationError("Canonical target UID and authenticated SuperAdmin UID are required.");
      return;
    }
    const rejectReason = "Rejected by admin";
    beginMutation();
    try {
      await rejectUserAtomically({
        ...administrativeTarget(user),
        actorUid,
        rejectionReason: rejectReason,
      });
      setSelectedUser(null);
      setMutationNotice(`${user.email || user.name} rejected with an atomic audit record.`);
    } catch (error) {
      mutationFailure(error, "Error rejecting user");
    } finally {
      setIsMutating(false);
    }
  };

  const handleBulkApprove = async () => {
    const toApprove = filteredPendingUsers;
    if (!actorUid) {
      setMutationError("Authenticated SuperAdmin UID is required.");
      return;
    }
    const blocked = toApprove.filter((user) =>
      genericApprovalBlockReason(user.requestedRole) !== null
    );
    if (blocked.length > 0) {
      setMutationError(
        `Bulk approval refused: ${blocked.length} selected record(s) have tenant, privileged, missing, malformed, or unknown requested intent metadata. Review them individually or use the Membership flow.`,
      );
      return;
    }
    if (toApprove.length > MAX_ATOMIC_BULK_APPROVAL_USERS) {
      setMutationError(
        `Bulk approval refused: ${toApprove.length} Users exceed the atomic limit of ${MAX_ATOMIC_BULK_APPROVAL_USERS}. Narrow the filter; no writes were attempted.`,
      );
      return;
    }
    const confirmed = window.confirm(
      `Approve all ${toApprove.length} filtered Users as authoritative role ${BULK_APPROVED_ROLE} with status ${APPROVED_ACCOUNT_STATUS}? requestedRole will remain metadata only. All User and audit-log writes will commit in one atomic batch.`,
    );
    if (!confirmed) return;

    beginMutation();
    try {
      await bulkApproveUsersAtomically({
        actorUid,
        targets: toApprove.map(administrativeTarget),
      });
      setMutationNotice(
        `${toApprove.length} Users approved atomically as ${BULK_APPROVED_ROLE} / ${APPROVED_ACCOUNT_STATUS}.`,
      );
    } catch (error) {
      mutationFailure(error, "Bulk approval failed");
    } finally {
      setIsMutating(false);
    }
  };

  const handleUpdateRole = async (user: User, newRole: string) => {
    if (!user.id || !actorUid) {
      setMutationError("Canonical target UID and authenticated SuperAdmin UID are required.");
      return;
    }
    beginMutation();
    try {
      await updateUserRoleAtomically({
        ...administrativeTarget(user),
        actorUid,
        approvedRole: newRole,
      });
      setMutationNotice(`${user.email || user.name} role updated atomically to ${newRole}.`);
    } catch (error) {
      mutationFailure(error, "Error updating role");
    } finally {
      setIsMutating(false);
    }
  };

  const handleUpdateStatus = async (user: User, newStatus: string) => {
    if (!user.id || !actorUid) {
      setMutationError("Canonical target UID and authenticated SuperAdmin UID are required.");
      return;
    }
    beginMutation();
    try {
      await updateUserStatusAtomically({
        ...administrativeTarget(user),
        actorUid,
        approvedStatus: newStatus,
      });
      setMutationNotice(`${user.email || user.name} status updated atomically to ${newStatus}.`);
    } catch (error) {
      mutationFailure(error, "Error updating status");
    } finally {
      setIsMutating(false);
    }
  };

  const filteredPendingUsers = pendingUsers.filter((u) => {
    const matchesSearch =
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "ALL" || u.requestedRole === roleFilter;
    return matchesSearch && matchesRole;
  });

  const filteredUsers = users.filter(
    (u) =>
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const isLoadingUsers = userLoadState === "loading";
  const selectedApprovalBlockReason = selectedUser
    ? genericApprovalBlockReason(selectedUser.requestedRole)
    : null;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
      <SuperAdminHeader
        onBack={onBack}
        onNavigate={handleNavigate}
        onExportReport={handleExportReport}
        dashboardActionsDisabled={userLoadState !== "loaded"}
        searchResults={searchResults}
        onSearchQueryChange={setHeaderSearchQuery}
        onSearchSelect={handleSearchSelect}
      />

      <div className="bg-white border-b border-slate-200 px-6 flex gap-6 shrink-0">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`py-4 font-bold text-sm border-b-2 transition-colors ${
            activeTab === "dashboard"
              ? "border-emerald-500 text-emerald-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Dashboard
        </button>
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
        {isLoadingUsers && (
          <div
            className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800"
            role="status"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading the authoritative Firestore user inventory...
          </div>
        )}

        {userLoadState === "unavailable" && (
          <div
            className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
            role="alert"
          >
            <XCircle className="h-4 w-4" />
            {userReadError}
          </div>
        )}

        {userLoadState === "loaded" && users.length === 0 && (
          <div
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600"
            role="status"
          >
            No other users found in the authoritative Firestore users collection.
          </div>
        )}

        {mutationError && (
          <div
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
            role="alert"
          >
            {mutationError}
          </div>
        )}

        {mutationNotice && (
          <div
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
            role="status"
          >
            {mutationNotice}
          </div>
        )}

        {activeTab === "dashboard" && (
          <SuperAdminOverview
            pendingUsers={pendingUsers.length}
            academyCount={academyCount}
            roleCounts={roleCounts}
            paymentApprovals={null}
            profileClaims={null}
            errorReports={null}
            profileClaimsAvailable={false}
            errorReportsAvailable={false}
            activities={recentActivities}
            activityLoadState={activityLoadState}
            alerts={alerts}
            onNavigate={handleNavigate}
            availableTabs={CLEAN_AVAILABLE_TABS}
          />
        )}

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
                  Authoritative Coaches
                </div>
                <div className="text-2xl font-black text-blue-600">
                  {roleCounts.coaches}
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="text-slate-500 text-xs font-bold uppercase mb-1">
                  Authoritative Players
                </div>
                <div className="text-2xl font-black text-indigo-600">
                  {roleCounts.playerAccounts}
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="text-slate-500 text-xs font-bold uppercase mb-1">
                  Authoritative Scouts
                </div>
                <div className="text-2xl font-black text-amber-600">
                  {roleCounts.scouts}
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="text-slate-500 text-xs font-bold uppercase mb-1">
                  Authoritative Parents
                </div>
                <div className="text-2xl font-black text-purple-600">
                  {roleCounts.parents}
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
                      <option value="ALL">All pending intents</option>
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
                    disabled={isMutating}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-colors whitespace-nowrap"
                  >
                    Approve Filtered as USER ({filteredPendingUsers.length})
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
                      <th className="p-4">Pending Requested Intent</th>
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
                    ) : userLoadState === "unavailable" ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="p-8 text-center text-rose-600"
                        >
                          User inventory unavailable.
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
                              {assessRequestedIntent(user.requestedRole).display}
                            </span>
                          </td>
                          <td className="p-4 text-slate-500 text-xs">
                            {user.createdAt
                              ? new Date(user.createdAt).toLocaleDateString()
                              : "-"}
                          </td>
                          <td className="p-4 text-right space-x-2 whitespace-nowrap">
                            <button
                              onClick={() => openUserReview(user)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="View Profile"
                            >
                              <Eye size={18} />
                            </button>
                            <button
                              onClick={() => openUserReview(user)}
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Review explicit account approval"
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
                    <th className="p-4">Authoritative Status</th>
                    <th className="p-4">Authoritative Role</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoadingUsers ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
                      </td>
                    </tr>
                  ) : userLoadState === "unavailable" ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-rose-600">
                        User inventory unavailable.
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
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
                            value={
                              typeof user.status === "string" ? user.status : ""
                            }
                            onChange={(e) =>
                              handleUpdateStatus(user, e.target.value)
                            }
                            disabled={
                              isMutating
                              || user.id === actorUid
                              || user.role === "SUPERADMIN"
                            }
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
                            <option value="" disabled>
                              MISSING STATUS
                            </option>
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="PENDING">PENDING</option>
                            <option value="REJECTED">REJECTED</option>
                            <option value="INACTIVE">SUSPENDED</option>
                          </select>
                        </td>
                        <td className="p-4">
                          <select
                            value={user.role || ""}
                            onChange={(e) =>
                              handleUpdateRole(user, e.target.value)
                            }
                            disabled={
                              isMutating
                              || user.id === actorUid
                              || !isSafeAccountRole(user.role)
                            }
                            title={
                              isSafeAccountRole(user.role)
                                ? "Authoritative account role"
                                : "Tenant and privileged roles are managed outside this generic control"
                            }
                            className="text-xs font-bold rounded-xl px-2 py-1 bg-slate-50 border border-slate-200 text-slate-800 outline-none cursor-pointer"
                          >
                            <option value="" disabled>
                              MISSING ROLE
                            </option>
                            {!isSafeAccountRole(user.role) && (
                              <option value={user.role} disabled>
                                {user.role} (externally managed)
                              </option>
                            )}
                            {SAFE_ACCOUNT_ROLES.map((role) => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-4 text-right space-x-2 whitespace-nowrap">
                          <button
                            onClick={() => openUserReview(user)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Profile"
                          >
                            <Eye size={18} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
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
                    Authoritative Account Role
                  </div>
                  <div className="font-bold text-slate-800">
                    {selectedUser.role || "MISSING"}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs font-bold uppercase mb-1">
                    Pending Requested Intent
                  </div>
                  <div className="font-bold text-slate-800">
                    {assessRequestedIntent(selectedUser.requestedRole).display}
                  </div>
                </div>
              </div>

              {selectedApprovalBlockReason ? (
                <div
                  className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900"
                  role="alert"
                >
                  {selectedApprovalBlockReason}
                </div>
              ) : (
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
                    Explicit approved account role
                  </span>
                  <select
                    value={approvedRole}
                    onChange={(event) => {
                      if (isSafeAccountRole(event.target.value)) {
                        setApprovedRole(event.target.value);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800"
                  >
                    {SAFE_ACCOUNT_ROLES.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-slate-500">
                    Defaults safely to USER and is never derived from requested intent.
                  </span>
                </label>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => handleReject(selectedUser)}
                disabled={isMutating}
                className="px-4 py-2 text-rose-600 font-bold hover:bg-rose-50 rounded-xl transition-colors"
              >
                Reject
              </button>
              <button
                onClick={() => handleApprove(selectedUser)}
                disabled={isMutating || selectedApprovalBlockReason !== null}
                className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2"
              >
                <CheckCircle size={18} />
                {selectedApprovalBlockReason ? "Generic Approval Blocked" : `Approve as ${approvedRole}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
