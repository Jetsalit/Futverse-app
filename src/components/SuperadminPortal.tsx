import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAuth, User } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
  limit,
  addDoc,
} from "firebase/firestore";
import { createNotification } from "../lib/notifications";
import notificationService from "../services/notificationService";
import {
  CheckCircle,
  XCircle,
  X,
  Search,
  Filter,
  Eye,
  Loader2,
  LogIn,
} from "lucide-react";
import { subscribeToUsers, updateUserStatus } from "../lib/firestore/users";
import ObservationMetricsManager from "../modules/parent-observation/components/ObservationMetricsManager";
import SuperAdminHeader from "./superadmin/SuperAdminHeader";
import SuperAdminNoticeComposer from "./superadmin/SuperAdminNoticeComposer";
import SuperAdminOverview from "./superadmin/SuperAdminOverview";
import { downloadSuperAdminDashboardCsv } from "./superadmin/dashboardExport";
import {
  firebaseUidForUser,
  sendNoticeInBatches,
  type NoticeSendRequest,
  type NoticeSendSummary,
} from "./superadmin/noticeAudience";
import {
  buildRecentActivities,
  deriveDashboardAlerts,
  deriveEffectiveRoleCounts,
  parseAuditLog,
  searchDashboardData,
  type AcademyDirectoryItem,
  type AuditLogEntry,
  type DashboardLoadState,
  type DashboardSearchResult,
  type ProfileClaimSearchItem,
  type SuperAdminTab,
} from "./superadmin/dashboardModel";

interface FirestoreDateLike {
  toDate?: () => Date;
}

interface ProfileClaim extends ProfileClaimSearchItem {
  academyId?: string;
  playerId: string;
  role?: string;
  userId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedAt?: FirestoreDateLike;
}

interface ErrorLog {
  id: string;
  timestamp?: FirestoreDateLike;
  type?: string;
  message?: string;
  url?: string;
}

export default function SuperadminPortal({ onBack }: { onBack: () => void }) {
  const { hasPermission, impersonate, currentUser: authUser } = useAuth();
  const [activeTab, setActiveTab] = useState<SuperAdminTab>("dashboard");
  const [viewSlipUrl, setViewSlipUrl] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [errorLogsLoadState, setErrorLogsLoadState] = useState<DashboardLoadState>("idle");

  const [profileClaims, setProfileClaims] = useState<ProfileClaim[]>([]);
  const [isLoadingClaims, setIsLoadingClaims] = useState(false);
  const [profileClaimsLoadState, setProfileClaimsLoadState] = useState<DashboardLoadState>("idle");
  const [academyDirectory, setAcademyDirectory] = useState<AcademyDirectoryItem[]>([]);
  const [academyLoadState, setAcademyLoadState] = useState<DashboardLoadState>("idle");
  const [activityLogs, setActivityLogs] = useState<AuditLogEntry[]>([]);
  const [activityLoadState, setActivityLoadState] = useState<DashboardLoadState>("idle");
  const [dashboardSearchQuery, setDashboardSearchQuery] = useState("");
  const [isNoticeComposerOpen, setIsNoticeComposerOpen] = useState(false);
  const [noticeAcademyByUid, setNoticeAcademyByUid] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [academyResolutionLoadState, setAcademyResolutionLoadState] = useState<DashboardLoadState>("idle");
  const activityRequestStartedRef = useRef(false);

  useEffect(() => {
    if (activeTab === "system_logs") {
      fetchErrorLogs();
    } else if (activeTab === "profile_claims") {
      fetchProfileClaims();
    }
  }, [activeTab]);

  const fetchProfileClaims = async () => {
    setIsLoadingClaims(true);
    setProfileClaimsLoadState("loading");
    try {
      const q = query(collection(db, "profile_claims"), orderBy("requestedAt", "desc"), limit(50));
      const snapshot = await getDocs(q);
      const claims = snapshot.docs.map((claimDoc) => ({
        id: claimDoc.id,
        ...claimDoc.data(),
      })) as ProfileClaim[];
      setProfileClaims(claims);
      setProfileClaimsLoadState("loaded");
    } catch (e) {
      console.error("Error fetching claims", e);
      setProfileClaimsLoadState("unavailable");
    } finally {
      setIsLoadingClaims(false);
    }
  };

  const handleApproveClaim = async (claim: ProfileClaim) => {
    try {
      // Find the academy this player belongs to
      const accSnap = await getDocs(collection(db, "academies"));
      let targetAcademyId = claim.academyId;
      
      if (!targetAcademyId) {
        // If academyId is not saved in claim, search for the player across all academies
        for (const acc of accSnap.docs) {
          const q = query(collection(db, `academies/${acc.id}/players`));
          const playersSnap = await getDocs(q);
          const found = playersSnap.docs.find(d => d.id === claim.playerId);
          if (found) {
            targetAcademyId = acc.id;
            break;
          }
        }
      }

      if (claim.role === "PARENT") {
        await updateDoc(doc(db, "users", claim.userId), { linkedPlayerId: claim.playerId });
      } else {
        if (!targetAcademyId) {
          throw new Error("Could not find the player in any academy");
        }
        await updateDoc(doc(db, `academies/${targetAcademyId}/players`, claim.playerId), { linkedUserId: claim.userId });
      }
      
      await updateDoc(doc(db, "profile_claims", claim.id), { status: "APPROVED" });
      await createNotification(
        claim.userId,
        "Profile Claim Approved",
        "Your player profile has been successfully linked.",
        "System"
      );
      fetchProfileClaims();
    } catch (error) {
      console.error("Error approving claim", error);
      alert("เกิดข้อผิดพลาดในการอนุมัติ โปรดตรวจสอบ log");
    }
  };

  const handleRejectClaim = async (claimId: string, userId: string) => {
    try {
      await updateDoc(doc(db, "profile_claims", claimId), { status: "REJECTED" });
      await createNotification(
        userId,
        "Profile Claim Rejected",
        "Your player profile claim was rejected. Please contact the coach.",
        "System"
      );
      fetchProfileClaims();
    } catch (error) {
      console.error("Error rejecting claim", error);
    }
  };

  const fetchErrorLogs = async () => {
    setIsLoadingLogs(true);
    setErrorLogsLoadState("loading");
    try {
      const q = query(collection(db, "error_logs"), orderBy("timestamp", "desc"), limit(50));
      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map((logDoc) => ({
        id: logDoc.id,
        ...logDoc.data(),
      })) as ErrorLog[];
      setErrorLogs(logs);
      setErrorLogsLoadState("loaded");
    } catch (e) {
      console.error("Error fetching logs", e);
      setErrorLogsLoadState("unavailable");
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "dashboard" || activityRequestStartedRef.current) return;

    activityRequestStartedRef.current = true;
    setActivityLoadState("loading");

    const fetchRecentActivity = async () => {
      try {
        const activityQuery = query(
          collection(db, "logs"),
          orderBy("timestamp", "desc"),
          limit(8),
        );
        const snapshot = await getDocs(activityQuery);
        setActivityLogs(snapshot.docs.map((logDoc) => (
          parseAuditLog(logDoc.id, logDoc.data() as Record<string, unknown>)
        )));
        setActivityLoadState("loaded");
      } catch (error) {
        console.error("Error fetching recent SuperAdmin activity", error);
        setActivityLoadState("unavailable");
      }
    };

    void fetchRecentActivity();
  }, [activeTab]);

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [manageUserRoleFilter, setManageUserRoleFilter] = useState("ALL");
  const [manageUserStatusFilter, setManageUserStatusFilter] = useState("ALL");
  const [manageUserAcademyFilter, setManageUserAcademyFilter] = useState("ALL");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const [enrichedUsers, setEnrichedUsers] = useState<User[]>([]);

  // Extract unique academies for the filter dropdown
  const uniqueAcademies = Array.from(new Set(enrichedUsers.map(u => u.academyId).filter(Boolean))) as string[];

  useEffect(() => {
    const enrichUsers = async () => {
      setAcademyResolutionLoadState("loading");
      try {
        const accSnap = await getDocs(collection(db, "academies"));
        const accNameMap = new Map<string, string>();
        const parentMap = new Map<string, string>();
        const playerMap = new Map<string, string>();

        const nextAcademyDirectory = accSnap.docs
          .filter((academyDoc) => academyDoc.id !== "superadmin_system")
          .map((academyDoc) => ({
            id: academyDoc.id,
            name: typeof academyDoc.data().name === "string"
              ? academyDoc.data().name
              : academyDoc.id,
          }));
        setAcademyDirectory(nextAcademyDirectory);
        setAcademyLoadState("loaded");

        // Fetch players for each academy manually to avoid collectionGroup permission issues
        const playerPromises = accSnap.docs.map(async (accDoc) => {
          const academyName = typeof accDoc.data().name === "string"
            ? accDoc.data().name
            : accDoc.id;
          accNameMap.set(accDoc.id, academyName);
          const playersRef = collection(db, `academies/${accDoc.id}/players`);
          const playersSnap = await getDocs(playersRef);
          playersSnap.forEach((pDoc) => {
             const data = pDoc.data();
             if (typeof data.linkedUserId === "string" && data.linkedUserId) {
                playerMap.set(data.linkedUserId, accDoc.id);
             }
             parentMap.set(pDoc.id, accDoc.id);
          });
        });

        await Promise.all(playerPromises);

        const nextNoticeAcademyByUid = new Map<string, string>();
        const newUsers = users.map(u => {
           let derivedAcademyId = u.academyId;
           const userIdentity = u.id || u.uid;
           
           // If the user's ID is listed as linkedUserId on an academy player (Parent or Player)
           if (userIdentity && playerMap.has(userIdentity)) {
               derivedAcademyId = playerMap.get(userIdentity);
           } 
           // Fallback: if the user document has linkedPlayerId pointing to an academy player
           else if (u.linkedPlayerId && parentMap.has(u.linkedPlayerId)) {
               derivedAcademyId = parentMap.get(u.linkedPlayerId);
           }
           
           // Resolve ID to readable name if possible
           let displayAcademy = derivedAcademyId;
           if (derivedAcademyId && accNameMap.has(derivedAcademyId)) {
               displayAcademy = accNameMap.get(derivedAcademyId);
           }

           const uid = firebaseUidForUser(u);
           const noticeAcademyId = u.activeAcademyId || derivedAcademyId;
           if (uid && noticeAcademyId) {
             nextNoticeAcademyByUid.set(uid, noticeAcademyId);
           }
           
           return { ...u, academyId: displayAcademy || null };
        });
        setEnrichedUsers(newUsers);
        setNoticeAcademyByUid(nextNoticeAcademyByUid);
        setAcademyResolutionLoadState("loaded");
      } catch (err) {
        console.error("Error enriching users with academy data:", err);
        setEnrichedUsers(users);
        setAcademyLoadState("unavailable");
        setNoticeAcademyByUid(new Map());
        setAcademyResolutionLoadState("unavailable");
      }
    };
    
    if (users.length > 0) {
      enrichUsers();
    } else {
      setEnrichedUsers([]);
      setNoticeAcademyByUid(new Map());
      setAcademyResolutionLoadState("idle");
    }
  }, [users]);

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
  const paymentPendingUsers = users.filter(
    (u) => u.status === "Pending" && u.paymentDetails,
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

  const effectiveRoleCounts = useMemo(() => deriveEffectiveRoleCounts(users), [users]);
  const profileClaimPendingCount = profileClaimsLoadState === "loaded"
    ? profileClaims.filter((claim) => claim.status === "PENDING").length
    : null;
  const errorReportCount = errorLogsLoadState === "loaded" ? errorLogs.length : null;
  const recentActivities = useMemo(
    () => buildRecentActivities(activityLogs, users),
    [activityLogs, users],
  );
  const dashboardAlerts = useMemo(() => deriveDashboardAlerts({
    pendingUsers: pendingUsers.length,
    paymentApprovals: paymentPendingUsers.length,
    profileClaims: profileClaimPendingCount,
    errorReports: errorReportCount,
  }), [errorReportCount, paymentPendingUsers.length, pendingUsers.length, profileClaimPendingCount]);
  const dashboardSearchResults = useMemo(() => searchDashboardData({
    query: dashboardSearchQuery,
    users,
    academies: academyDirectory,
    claims: profileClaimsLoadState === "loaded" ? profileClaims : [],
  }), [academyDirectory, dashboardSearchQuery, profileClaims, profileClaimsLoadState, users]);

  const handleDashboardSearchSelect = (result: DashboardSearchResult) => {
    if (result.searchValue) setSearchQuery(result.searchValue);
    if (result.academyFilter) setManageUserAcademyFilter(result.academyFilter);
    setActiveTab(result.tab);
  };

  const handleExportReport = () => {
    const exportedAt = new Date();
    downloadSuperAdminDashboardCsv({
      exportedAt,
      pendingUsers: pendingUsers.length,
      academyCount: academyLoadState === "loaded" ? academyDirectory.length : null,
      academyLoadState,
      roleCounts: effectiveRoleCounts,
      paymentApprovals: paymentPendingUsers.length,
      profileClaims: profileClaimPendingCount,
      profileClaimsLoadState,
      errorReports: errorReportCount,
      errorReportsLoadState: errorLogsLoadState,
      recentActivities,
      recentActivityLoadState: activityLoadState,
    });
  };

  const handleSendNotice = async (
    request: NoticeSendRequest,
  ): Promise<NoticeSendSummary> => sendNoticeInBatches(
    request.recipientUids,
    (recipientUids) => notificationService.emitToRecipients([...recipientUids], {
      title: request.title,
      message: request.message,
      type: "System",
      entityType: "BROADCAST",
      actionUrl: "dashboard",
      academyId: request.academyId,
    }),
  );

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

  const handleApprovePayment = async (user: User) => {
    if (!user.id) return;
    try {
      await updateUserStatus(user.id, "Active", {
        approvedBy: authUser?.id || "SUPERADMIN",
        approvedAt: new Date().toISOString(),
      });
      await addDoc(collection(db, "logs"), {
        action: "PAYMENT_APPROVED",
        approvedBy: authUser?.id || "SUPERADMIN",
        targetUser: user.id,
        targetEmail: user.email,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Error approving payment:", error);
    }
  };

  const handleRejectPayment = async (user: User) => {
    if (!user.id) return;
    try {
      await updateUserStatus(user.id, "Inactive", {
        rejectionReason: "Payment slip was rejected. Please upload a valid slip.",
        paymentDetails: null, // Clear invalid payment details
      });
      await addDoc(collection(db, "logs"), {
        action: "PAYMENT_REJECTED",
        rejectedBy: authUser?.id || "SUPERADMIN",
        targetUser: user.id,
        targetEmail: user.email,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Error rejecting payment:", error);
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
      <SuperAdminHeader
        onBack={onBack}
        onNavigate={setActiveTab}
        onOpenNotice={() => setIsNoticeComposerOpen(true)}
        onExportReport={handleExportReport}
        dashboardActionsDisabled={isLoadingUsers}
        searchResults={dashboardSearchResults}
        onSearchQueryChange={setDashboardSearchQuery}
        onSearchSelect={handleDashboardSearchSelect}
      />

      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 flex gap-4 sm:gap-6 shrink-0 overflow-x-auto hide-scrollbar">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`py-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
            activeTab === "dashboard"
              ? "border-emerald-500 text-emerald-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab("approvals")}
          className={`py-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
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
          onClick={() => setActiveTab("payment_approvals")}
          className={`py-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
            activeTab === "payment_approvals"
              ? "border-emerald-500 text-emerald-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span className="flex items-center gap-2">
            Payment Approvals
            {paymentPendingUsers.length > 0 && (
              <span className="bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                {paymentPendingUsers.length}
              </span>
            )}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`py-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
            activeTab === "users"
              ? "border-emerald-500 text-emerald-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span className="flex items-center gap-2">Manage Users</span>
        </button>
        <button
          onClick={() => setActiveTab("system_logs")}
          className={`py-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
            activeTab === "system_logs"
              ? "border-rose-500 text-rose-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span className="flex items-center gap-2">Error Reports</span>
        </button>
        <button
          onClick={() => setActiveTab("profile_claims")}
          className={`py-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
            activeTab === "profile_claims"
              ? "border-emerald-500 text-emerald-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span className="flex items-center gap-2">
            Profile Claims
            {profileClaims.filter(c => c.status === "PENDING").length > 0 && (
              <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                {profileClaims.filter(c => c.status === "PENDING").length}
              </span>
            )}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("observation_metrics")}
          className={`py-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
            activeTab === "observation_metrics"
              ? "border-emerald-500 text-emerald-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span className="flex items-center gap-2">Observation Metrics</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {activeTab === "dashboard" && (
          <SuperAdminOverview
            pendingUsers={pendingUsers.length}
            academyCount={academyLoadState === "loaded" ? academyDirectory.length : null}
            roleCounts={effectiveRoleCounts}
            paymentApprovals={paymentPendingUsers.length}
            profileClaims={profileClaimPendingCount}
            errorReports={errorReportCount}
            profileClaimsAvailable={profileClaimsLoadState === "loaded"}
            errorReportsAvailable={errorLogsLoadState === "loaded"}
            activities={recentActivities}
            activityLoadState={activityLoadState}
            alerts={dashboardAlerts}
            onNavigate={setActiveTab}
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
                      <th className="p-4">Academy ID / Country</th>
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

        {activeTab === "payment_approvals" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">Pending Payments</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4">User</th>
                    <th className="p-4">Plan</th>
                    <th className="p-4">Date/Time</th>
                    <th className="p-4">Slip Image</th>
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
                  ) : paymentPendingUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">
                        No pending payments found.
                      </td>
                    </tr>
                  ) : (
                    paymentPendingUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 font-bold text-slate-800">
                          <div>{user.name}</div>
                          <div className="text-xs text-slate-500 font-medium">{user.email}</div>
                        </td>
                        <td className="p-4">
                          <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 text-xs font-bold rounded-full border border-indigo-200 uppercase">
                            {user.subscriptionPlan || "N/A"}
                          </span>
                        </td>
                        <td className="p-4 text-slate-500 text-xs">
                          {user.paymentDetails?.date} <br/> {user.paymentDetails?.time}
                        </td>
                        <td className="p-4">
                          {user.paymentDetails?.slipUrl && (
                            <button 
                              onClick={() => setViewSlipUrl(user.paymentDetails?.slipUrl || null)}
                              className="w-16 h-16 rounded-lg border border-slate-200 overflow-hidden hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                              <img src={user.paymentDetails.slipUrl} alt="Slip Thumbnail" className="w-full h-full object-cover" />
                            </button>
                          )}
                        </td>
                        <td className="p-4 text-right space-x-2 whitespace-nowrap">
                          <button
                            onClick={() => handleApprovePayment(user)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 bg-slate-50 rounded-lg transition-colors font-bold border border-emerald-200"
                            title="Approve"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectPayment(user)}
                            className="p-2 text-rose-600 hover:bg-rose-50 bg-slate-50 rounded-lg transition-colors font-bold border border-rose-200"
                            title="Reject"
                          >
                            Reject
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

        {activeTab === "users" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50">
              <div className="relative flex-1 sm:max-w-xs w-full">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  type="text"
                  placeholder="Search users by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all shadow-sm"
                />
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
                  <Filter size={14} className="text-slate-400" />
                  <select
                    value={manageUserRoleFilter}
                    onChange={(e) => setManageUserRoleFilter(e.target.value)}
                    className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
                  >
                    <option value="ALL">All Roles</option>
                    <option value="SUPERADMIN">Superadmin</option>
                    <option value="DATA_ADMIN">Data Admin</option>
                    <option value="ADMIN">Admin</option>
                    <option value="COACH">Coach</option>
                    <option value="PARENT">Parent</option>
                    <option value="PLAYER">Player</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
                  <Filter size={14} className="text-slate-400" />
                  <select
                    value={manageUserStatusFilter}
                    onChange={(e) => setManageUserStatusFilter(e.target.value)}
                    className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="PENDING">Pending</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="INACTIVE">Suspended</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
                  <Filter size={14} className="text-slate-400" />
                  <select
                    value={manageUserAcademyFilter}
                    onChange={(e) => setManageUserAcademyFilter(e.target.value)}
                    className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
                  >
                    <option value="ALL">All Academies</option>
                    {uniqueAcademies.map(acc => (
                      <option key={acc} value={acc}>{acc}</option>
                    ))}
                    <option value="NONE">No Academy</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4">User</th>
                    <th className="p-4">Academy</th>
                    <th className="p-4">Contact</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Role</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {enrichedUsers
                    .filter((u) => {
                      const matchesSearch = 
                        u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        u.email?.toLowerCase().includes(searchQuery.toLowerCase());
                      const matchesRole = manageUserRoleFilter === "ALL" || u.role === manageUserRoleFilter;
                      const matchesStatus = manageUserStatusFilter === "ALL" || (u.status || "INACTIVE").toUpperCase() === manageUserStatusFilter.toUpperCase();
                      
                      let matchesAcademy = true;
                      if (manageUserAcademyFilter === "NONE") matchesAcademy = !u.academyId;
                      else if (manageUserAcademyFilter !== "ALL") matchesAcademy = u.academyId === manageUserAcademyFilter;

                      return matchesSearch && matchesRole && matchesStatus && matchesAcademy;
                    })
                    .map((user) => (
                      <tr
                        key={user.id}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="p-4 font-bold text-slate-800">
                          {user.name}
                        </td>
                        <td className="p-4">
                          {user.academyId ? (
                            <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider border border-indigo-100">
                              {user.academyId}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs italic">N/A</span>
                          )}
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
                          <button
                            onClick={() => {
                              impersonate(user);
                              onBack();
                            }}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Login as User (Impersonate)"
                          >
                            <LogIn size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "system_logs" && (
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Timestamp</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Message</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">URL / Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoadingLogs ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">
                        <Loader2 className="animate-spin inline-block mr-2" size={20} /> Loading logs...
                      </td>
                    </tr>
                  ) : errorLogsLoadState === "unavailable" ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">
                        Error reports are unavailable under the current data access configuration.
                      </td>
                    </tr>
                  ) : errorLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">
                        No error logs found. System is healthy!
                      </td>
                    </tr>
                  ) : (
                    errorLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 text-sm font-medium text-slate-600 whitespace-nowrap">
                          {log.timestamp?.toDate ? new Date(log.timestamp.toDate()).toLocaleString() : "Unknown time"}
                        </td>
                        <td className="p-4">
                          <span className="inline-block px-2 py-1 bg-rose-100 text-rose-700 text-xs font-bold rounded-lg">
                            {log.type || "ERROR"}
                          </span>
                        </td>
                        <td className="p-4 text-sm text-slate-800 font-medium">
                          {log.message}
                        </td>
                        <td className="p-4 text-xs text-slate-500 truncate max-w-xs" title={log.url}>
                          {log.url}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "profile_claims" && (
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Player Name</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">FUTID</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">User Email</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date Requested</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoadingClaims ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">
                        <Loader2 className="animate-spin inline-block mr-2" size={20} /> Loading claims...
                      </td>
                    </tr>
                  ) : profileClaimsLoadState === "unavailable" ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">
                        Profile claims are currently unavailable.
                      </td>
                    </tr>
                  ) : profileClaims.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">
                        ไม่มีคำขอเชื่อมโยงโปรไฟล์ในขณะนี้
                      </td>
                    </tr>
                  ) : (
                    profileClaims.map((claim) => (
                      <tr key={claim.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 text-sm font-bold text-slate-800">{claim.playerName}</td>
                        <td className="p-4 text-sm font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block mt-2">{claim.futId}</td>
                        <td className="p-4 text-sm text-slate-600">{claim.userEmail}</td>
                        <td className="p-4 text-sm text-slate-500">
                          {claim.requestedAt?.toDate ? new Date(claim.requestedAt.toDate()).toLocaleDateString() : "Unknown"}
                        </td>
                        <td className="p-4">
                          <span className={`inline-block px-2 py-1 text-xs font-bold rounded-lg ${
                            claim.status === "PENDING" ? "bg-amber-100 text-amber-700" :
                            claim.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" :
                            "bg-rose-100 text-rose-700"
                          }`}>
                            {claim.status}
                          </span>
                        </td>
                        <td className="p-4 text-right space-x-2">
                          {claim.status === "PENDING" && (
                            <div className="flex gap-2">
                              <button onClick={() => handleApproveClaim(claim)} className="px-3 py-1.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors shadow-sm">
                                Approve
                              </button>
                              <button onClick={() => handleRejectClaim(claim.id, claim.userId)} className="px-3 py-1.5 text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white rounded-lg transition-colors shadow-sm">
                                Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "observation_metrics" && (
          <ObservationMetricsManager />
        )}

      </div>

      <SuperAdminNoticeComposer
        isOpen={isNoticeComposerOpen}
        users={users}
        academies={academyDirectory}
        academyByUid={noticeAcademyByUid}
        academyTargetingAvailable={academyResolutionLoadState === "loaded"}
        onClose={() => setIsNoticeComposerOpen(false)}
        onSend={handleSendNotice}
      />

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

      {viewSlipUrl && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setViewSlipUrl(null)}>
          <div className="relative max-w-3xl w-full flex flex-col items-center animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setViewSlipUrl(null)}
              className="absolute -top-12 right-0 text-white hover:text-slate-200 p-2 transition-colors flex items-center gap-2 font-bold"
            >
              <X size={24} /> Close
            </button>
            <img src={viewSlipUrl} alt="Payment Slip" className="rounded-2xl max-h-[85vh] object-contain shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}
