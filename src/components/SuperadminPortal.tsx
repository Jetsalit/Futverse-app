import React, { useState, useEffect, useRef } from "react";
import { useAuth, User } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
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
  ShieldAlert,
  CreditCard,
  Activity,
  FileText,
  BadgeCheck,
  Building2,
  UserCheck,
  ArrowRight,
} from "lucide-react";
import { subscribeToUsers } from "../lib/firestore/users";
import {
  firestoreSuperAdminDashboardSignalReadOps,
  loadPendingProfileClaimCount,
} from "../lib/firestore/superAdminDashboardSignalReadAdapter";
import {
  SAFE_ACCOUNT_ROLES,
  assessRequestedIntent,
  genericApprovalBlockReason,
  isSafeAccountRole,
  type SafeAccountRole,
} from "../lib/accountRolePolicy";
import {
  formatFirestoreDate,
  getUserApprovalBadge,
  mapCanonicalClaimSnapshot,
  resolveStaffClaimView,
  getApprovalActionLabel,
  normalizeManagedAccountStatus,
  getManagedAccountStatusDisplay,
  resolveClaimDisplayAcademy,
  canReviewModeApprove,
  canReviewModeReject,
  isPendingAccountStatus,
  type ExplicitAccountRoleSelection,
  type StaffClaimView,
  type UserReviewMode,
} from "../lib/superAdminApprovalModel";
import {
  APPROVED_ACCOUNT_STATUS,
  approveUserAtomically,
  rejectUserAtomically,
  updateUserRoleAtomically,
  updateUserStatusAtomically,
} from "../lib/firestore/adminUserMutations";
import { useSuperAdminSupport } from "../contexts/SuperAdminSupportContext";
import { isExactActiveStaffMembership, isExactActiveSuperAdmin } from "../lib/superAdminSupportModel";

import BootstrapLegacyAdmin from "./BootstrapLegacyAdmin";
import SuperAdminHeader from "./superadmin/SuperAdminHeader";
import SuperAdminPortalNavigation from "./superadmin/SuperAdminPortalNavigation";
import SuperAdminOverview from "./superadmin/SuperAdminOverview";
import SuperAdminUsersRelationships from "./superadmin/SuperAdminUsersRelationships";
import {
  createSuperAdminRelationshipInventoryOwner,
  type SuperAdminRelationshipInventoryOwner,
} from "./superadmin/superAdminRelationshipInventoryOwner";
import {
  createSuperAdminRelationshipInventoryLifecycleState,
} from "./superadmin/superAdminRelationshipInventoryLifecycle";
import {
  firestoreSuperAdminRelationshipReadOps,
  loadSuperAdminRelationshipInventory,
} from "../lib/firestore/superAdminRelationshipReadAdapter";
import {
  buildSuperAdminAccountOrganizationContext,
  type SuperAdminAccountOrganizationInventoryState,
} from "./superadmin/superAdminAccountOrganizationContext";
import SuperAdminAccountOrganizationCells from "./superadmin/SuperAdminAccountOrganizationCells";
import SuperAdminUserRelationshipInspector from "./superadmin/SuperAdminUserRelationshipInspector";
import type {
  SuperAdminUserRelationshipRow,
} from "../lib/superAdminRelationshipReadModel";
import { SuperAdminNonStaffWorkAsLauncher } from "./superadmin/SuperAdminNonStaffWorkAsLauncher";
import {
  deriveEffectiveRoleCounts,
  deriveDashboardSearchCoverage,
  searchDashboardData,
  resolveDashboardSearchSelection,
  deriveDashboardAlerts,
  deriveDashboardOperationalSignals,
  parseAuditLog,
  buildRecentActivities,
  type SuperAdminTab,
  type DashboardSearchResult,
  type DashboardLoadState,
  type AuditLogEntry,
} from "./superadmin/dashboardModel";
import { downloadSuperAdminDashboardCsv } from "./superadmin/dashboardExport";
import { deriveSuperAdminReviewQueue } from "./superadmin/reviewQueueModel";

const CLEAN_AVAILABLE_TABS = [
  "dashboard",
  "approvals",
  "users",
  "relationships",
  "academies",
  "system_logs",
  "profile_claims",
  "payment_approvals",
  "observation_metrics",
  "bootstrap_legacy",
] as const;

type CleanTab = (typeof CLEAN_AVAILABLE_TABS)[number];

interface ProfileClaimItem {
  id: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  playerName?: string;
  futId?: string;
  requestedRole?: string;
  approvedRole?: string;
  academyId?: string;
  requestedAcademyId?: string;
  approvedAcademyId?: string;
  status?: string;
  createdAt?: unknown;
}

interface AcademyListItem {
  id: string;
  name?: string;
  shortName?: string;
  logoUrl?: string | null;
  createdAt?: string;
}

interface StaffMemberItem {
  id: string;
  userId: string;
  academyId: string;
  role: string;
  status: string;
  displayName?: string;
  userEmail?: string;
  data: Record<string, unknown>;
}

export default function SuperadminPortal({ onBack }: { onBack: () => void }) {
  const { hasPermission, currentUser: authUser, actualUser } = useAuth();
  const { enterAcademyWorkspace, startStaffWorkMode } = useSuperAdminSupport();

  const [activeTab, setActiveTab] = useState<CleanTab>("dashboard");
  const [users, setUsers] = useState<User[]>([]);
  const [userLoadState, setUserLoadState] =
    useState<DashboardLoadState>("loading");
  const [userReadError, setUserReadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [headerSearchQuery, setHeaderSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [reviewMode, setReviewMode] = useState<UserReviewMode>("READ_ONLY_PROFILE");
  const [approvedRole, setApprovedRole] = useState<ExplicitAccountRoleSelection>("");
  const [staffClaimView, setStaffClaimView] = useState<StaffClaimView | null>(null);
  const [staffClaimLoadState, setStaffClaimLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationNotice, setMutationNotice] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const [academyCount, setAcademyCount] = useState<number | null>(null);
  const [academyLoadState, setAcademyLoadState] =
    useState<DashboardLoadState>("idle");
  const [academiesList, setAcademiesList] = useState<AcademyListItem[]>([]);
  const [academySearchQuery, setAcademySearchQuery] = useState("");

  const [selectedAcademyForStaff, setSelectedAcademyForStaff] = useState<AcademyListItem | null>(null);
  const [staffMembersList, setStaffMembersList] = useState<StaffMemberItem[]>([]);
  const [staffLoadState, setStaffLoadState] = useState<DashboardLoadState>("idle");

  const [activityLogs, setActivityLogs] = useState<AuditLogEntry[]>([]);
  const [activityLoadState, setActivityLoadState] =
    useState<DashboardLoadState>("idle");

  // System Audit Logs State
  const [logsList, setLogsList] = useState<AuditLogEntry[]>([]);
  const [logsLoadState, setLogsLoadState] = useState<DashboardLoadState>("idle");
  const [logsSearchQuery, setLogsSearchQuery] = useState("");

  // Profile Claims State
  const [profileClaimsList, setProfileClaimsList] = useState<ProfileClaimItem[]>([]);
  const [profileClaimsLoadState, setProfileClaimsLoadState] = useState<DashboardLoadState>("idle");
  const [claimsSearchQuery, setClaimsSearchQuery] = useState("");

  // Command Center authoritative Profile Claim signal.
  // Kept separate from the limited Profile Claims audit list.
  const [profileClaimSignalCount, setProfileClaimSignalCount] =
    useState<number | null>(null);
  const [profileClaimSignalLoadState, setProfileClaimSignalLoadState] =
    useState<DashboardLoadState>("idle");

  const relationshipInventoryActorUid =
    isExactActiveSuperAdmin(actualUser)
      ? actualUser?.uid || actualUser?.id || null
      : null;

  const relationshipInventoryOwnerRef =
    useRef<SuperAdminRelationshipInventoryOwner | null>(null);

  const relationshipInventoryOwnerActorUidRef =
    useRef<string | null>(null);

  const [
    relationshipInventoryScopedState,
    setRelationshipInventoryScopedState,
  ] = useState(() => ({
    actorUid: null as string | null,
    inventoryState: createSuperAdminRelationshipInventoryLifecycleState(),
  }));

  const relationshipInventoryState =
    relationshipInventoryScopedState.actorUid === relationshipInventoryActorUid
      ? relationshipInventoryScopedState.inventoryState
      : createSuperAdminRelationshipInventoryLifecycleState();

  const accountOrganizationInventoryState:
    SuperAdminAccountOrganizationInventoryState =
      relationshipInventoryState.status === "READY"
        ? "READY"
        : relationshipInventoryState.status === "UNAVAILABLE"
          ? "UNAVAILABLE"
          : "LOADING";

  const relationshipRowsByUserId =
    new Map<string, SuperAdminUserRelationshipRow>();

  if (relationshipInventoryState.status === "READY") {
    for (const row of relationshipInventoryState.inventory.rows) {
      relationshipRowsByUserId.set(row.userId, row);
    }
  }

  const accountOrganizationContextFor = (userId: string) =>
    buildSuperAdminAccountOrganizationContext({
      userId,
      inventoryState: accountOrganizationInventoryState,
      row: relationshipRowsByUserId.get(userId),
    });

  useEffect(() => {
    const inventoryState =
      createSuperAdminRelationshipInventoryLifecycleState();

    setRelationshipInventoryScopedState({
      actorUid: relationshipInventoryActorUid,
      inventoryState,
    });

    setSelectedAcademyForStaff(null);
    setStaffMembersList([]);
    setStaffLoadState("idle");

    setSelectedUser(null);
    setStaffClaimView(null);
    setStaffClaimLoadState("idle");

    relationshipInventoryOwnerRef.current = null;
    relationshipInventoryOwnerActorUidRef.current = null;

    if (!relationshipInventoryActorUid) {
      return;
    }

    relationshipInventoryOwnerActorUidRef.current =
      relationshipInventoryActorUid;

    const relationshipInventoryOwner =
      createSuperAdminRelationshipInventoryOwner({
        loadInventory: () =>
          loadSuperAdminRelationshipInventory(
            firestoreSuperAdminRelationshipReadOps,
          ),
        onStateChange: (inventoryState) => {
          if (
            relationshipInventoryOwnerActorUidRef.current !==
            relationshipInventoryActorUid
          ) {
            return;
          }

          setRelationshipInventoryScopedState({
            actorUid: relationshipInventoryActorUid,
            inventoryState,
          });
        },
      });

    relationshipInventoryOwnerRef.current = relationshipInventoryOwner;

    return () => {
      relationshipInventoryOwner.dispose();

      if (
        relationshipInventoryOwnerRef.current ===
        relationshipInventoryOwner
      ) {
        relationshipInventoryOwnerRef.current = null;
        relationshipInventoryOwnerActorUidRef.current = null;
      }
    };
  }, [relationshipInventoryActorUid]);

  useEffect(() => {
    const relationshipInventoryOwner =
      relationshipInventoryOwnerRef.current;

    if (!relationshipInventoryActorUid ||
        !relationshipInventoryOwner ||
        relationshipInventoryOwnerActorUidRef.current !== relationshipInventoryActorUid) {
      return;
    }

    void (async () => {
      try {
        await relationshipInventoryOwner.activate(activeTab);
      } catch (error) {
        console.error(
          "SuperAdmin relationship inventory activation failed:",
          error,
        );
      }
    })();
  }, [activeTab, relationshipInventoryActorUid]);

  const refreshRelationshipInventory = async () => {
    if (!relationshipInventoryActorUid ||
        relationshipInventoryOwnerActorUidRef.current !== relationshipInventoryActorUid) {
      return;
    }

    try {
      await relationshipInventoryOwnerRef.current?.refresh();
    } catch (error) {
      console.error(
        "SuperAdmin relationship inventory refresh failed:",
        error,
      );
    }
  };

  const refreshRelationshipInventoryAfterMutation = async () => {
    const actorUid =
      relationshipInventoryActorUid;

    const owner =
      relationshipInventoryOwnerRef.current;

    if (!actorUid) {
      throw new Error(
        "Active SuperAdmin relationship inventory actor is unavailable.",
      );
    }

    if (!owner) {
      throw new Error(
        "Relationship inventory owner is unavailable for authoritative refresh.",
      );
    }

    if (
      relationshipInventoryOwnerActorUidRef.current !==
      actorUid
    ) {
      throw new Error(
        "Relationship inventory actor changed before authoritative refresh.",
      );
    }

    await owner.refresh();

    if (
      relationshipInventoryOwnerActorUidRef.current !==
        actorUid ||
      relationshipInventoryOwnerRef.current !==
        owner
    ) {
      throw new Error(
        "SuperAdmin relationship inventory ownership changed during authoritative refresh.",
      );
    }

    const refreshedState =
      owner.getState();

    if (
      refreshedState.status !== "READY" ||
      refreshedState.inventory === null
    ) {
      throw new Error(
        refreshedState.errorMessage ||
          "Authoritative relationship inventory refresh did not reach READY state.",
      );
    }
  };

  const invalidateRelationshipInventory = async () => {
    if (!relationshipInventoryActorUid ||
        relationshipInventoryOwnerActorUidRef.current !== relationshipInventoryActorUid) {
      return;
    }

    try {
      await relationshipInventoryOwnerRef.current?.invalidate();
    } catch (error) {
      console.error(
        "SuperAdmin relationship inventory invalidation failed:",
        error,
      );
    }
  };

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

    if (!relationshipInventoryActorUid) {
      setAcademyCount(null);
      setAcademiesList([]);
      setAcademyLoadState("idle");
      return;
    }

    setAcademyCount(null);
    setAcademiesList([]);
    async function fetchAcademies() {
      setAcademyLoadState("loading");
      try {
        const snapshot = await getDocs(collection(db, "academies"));
        if (cancelled) return;
        const academyDocs = snapshot.docs.filter(
          (academyDoc) => academyDoc.id !== "superadmin_system",
        );
        const count = academyDocs.length;
        setAcademyCount(count);

        const academyItems: AcademyListItem[] = academyDocs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            name: typeof data.name === "string" ? data.name : undefined,
            shortName: typeof data.shortName === "string" ? data.shortName : undefined,
            logoUrl: typeof data.logoUrl === "string" ? data.logoUrl : undefined,
            createdAt: typeof data.createdAt === "string" ? data.createdAt : undefined,
          };
        });
        setAcademiesList(academyItems);
        setAcademyLoadState("loaded");
      } catch (err) {
        if (cancelled) return;
        console.error("SuperAdmin failed to fetch academies:", err);
        setAcademyCount(null);
        setAcademiesList([]);
        setAcademyLoadState("unavailable");
      }
    }

    fetchAcademies();
    return () => {
      cancelled = true;
    };
  }, [relationshipInventoryActorUid]);

  useEffect(() => {
    if (!relationshipInventoryActorUid) {
      setStaffMembersList([]);
      setStaffLoadState("idle");
      return;
    }

    if (!selectedAcademyForStaff) {
      setStaffMembersList([]);
      setStaffLoadState("idle");
      return;
    }
    let cancelled = false;
    async function fetchStaffMembers() {
      setStaffLoadState("loading");
      try {
        const academyId = selectedAcademyForStaff.id;
        const membersCollection = collection(db, "academies", academyId, "members");
        const snapshot = await getDocs(membersCollection);
        if (cancelled) return;

        const members: StaffMemberItem[] = snapshot.docs.map((memberDoc) => {
          const data = memberDoc.data() as Record<string, unknown>;
          const userId = typeof data.userId === "string" ? data.userId : memberDoc.id;
          const userMeta = users.find((u) => (u.id || u.uid) === userId);
          return {
            id: memberDoc.id,
            userId,
            academyId,
            role: typeof data.role === "string" ? data.role : "",
            status: typeof data.status === "string" ? data.status : "",
            displayName: userMeta?.name || (typeof data.name === "string" ? data.name : undefined),
            userEmail: userMeta?.email || (typeof data.email === "string" ? data.email : undefined),
            data,
          };
        });

        setStaffMembersList(members);
        setStaffLoadState("loaded");
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to fetch academy staff members:", err);
        setStaffMembersList([]);
        setStaffLoadState("unavailable");
      }
    }

    fetchStaffMembers();
    return () => {
      cancelled = true;
    };
  }, [selectedAcademyForStaff, users, relationshipInventoryActorUid]);

  useEffect(() => {
    let cancelled = false;

    if (!relationshipInventoryActorUid) {
      setActivityLogs([]);
      setActivityLoadState("idle");
      return;
    }

    setActivityLogs([]);
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
  }, [relationshipInventoryActorUid]);

  useEffect(() => {
    let cancelled = false;

    if (!relationshipInventoryActorUid) {
      setLogsList([]);
      setLogsLoadState("idle");
      return;
    }

    setLogsList([]);
    async function fetchSystemLogs() {
      setLogsLoadState("loading");
      try {
        const logsQuery = query(
          collection(db, "logs"),
          orderBy("timestamp", "desc"),
          limit(50),
        );
        const snapshot = await getDocs(logsQuery);
        if (cancelled) return;
        const logs = snapshot.docs.map((logDoc) =>
          parseAuditLog(logDoc.id, logDoc.data() as Record<string, unknown>),
        );
        setLogsList(logs);
        setLogsLoadState("loaded");
      } catch (err) {
        if (cancelled) return;
        console.error("SuperAdmin failed to fetch system logs:", err);
        setLogsList([]);
        setLogsLoadState("unavailable");
      }
    }

    fetchSystemLogs();
    return () => {
      cancelled = true;
    };
  }, [relationshipInventoryActorUid]);

  useEffect(() => {
    let cancelled = false;

    if (!relationshipInventoryActorUid) {
      setProfileClaimsList([]);
      setProfileClaimsLoadState("idle");
      return;
    }

    setProfileClaimsList([]);
    async function fetchProfileClaims() {
      setProfileClaimsLoadState("loading");
      try {
        const claimsQuery = query(
          collection(db, "profile_claims"),
          limit(50),
        );
        const snapshot = await getDocs(claimsQuery);
        if (cancelled) return;
        const claims = snapshot.docs.map((claimDoc) => {
          const data = claimDoc.data() as Record<string, unknown>;
          return {
            id: claimDoc.id,
            userId: typeof data.userId === "string" ? data.userId : undefined,
            userEmail: typeof data.userEmail === "string" ? data.userEmail : undefined,
            userName: typeof data.userName === "string" ? data.userName : undefined,
            playerName: typeof data.playerName === "string" ? data.playerName : undefined,
            futId: typeof data.futId === "string" ? data.futId : undefined,
            requestedRole: typeof data.requestedRole === "string" ? data.requestedRole : undefined,
            approvedRole: typeof data.approvedRole === "string" ? data.approvedRole : undefined,
            academyId: typeof data.academyId === "string" ? data.academyId : undefined,
            requestedAcademyId: typeof data.requestedAcademyId === "string" ? data.requestedAcademyId : undefined,
            approvedAcademyId: typeof data.approvedAcademyId === "string" ? data.approvedAcademyId : undefined,
            status: typeof data.status === "string" ? data.status : undefined,
            createdAt: data.createdAt,
          };
        });
        setProfileClaimsList(claims);
        setProfileClaimsLoadState("loaded");
      } catch (err) {
        if (cancelled) return;
        console.error("SuperAdmin failed to fetch profile claims:", err);
        setProfileClaimsList([]);
        setProfileClaimsLoadState("unavailable");
      }
    }

    fetchProfileClaims();
    return () => {
      cancelled = true;
    };
  }, [relationshipInventoryActorUid]);

  useEffect(() => {
    if (
      activeTab !== "dashboard" ||
      !relationshipInventoryActorUid
    ) {
      return;
    }

    let cancelled = false;

    setProfileClaimSignalCount(null);
    setProfileClaimSignalLoadState("loading");

    void (async () => {
      const result =
        await loadPendingProfileClaimCount(
          firestoreSuperAdminDashboardSignalReadOps,
        );

      if (cancelled) return;

      if (result.state === "READY") {
        setProfileClaimSignalCount(result.count);
        setProfileClaimSignalLoadState("loaded");
        return;
      }

      console.error(
        "SuperAdmin failed to count pending Profile Claims:",
        result.error,
      );
      setProfileClaimSignalCount(null);
      setProfileClaimSignalLoadState("unavailable");
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, relationshipInventoryActorUid]);

  if (!hasPermission(["SUPERADMIN"])) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500">Access Denied</p>
      </div>
    );
  }

  const pendingUsers = users.filter((u) => isPendingAccountStatus(u.status));
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

  const operationalSignals =
    deriveDashboardOperationalSignals({
      userApprovals: {
        loadState: userLoadState,
        count:
          userLoadState === "loaded"
            ? pendingUsers.length
            : null,
      },
      profileClaims: {
        loadState: profileClaimSignalLoadState,
        count:
          profileClaimSignalLoadState === "loaded"
            ? profileClaimSignalCount
            : null,
      },
    });

  const reviewQueue =
    deriveSuperAdminReviewQueue(
      operationalSignals,
    );

  const alerts =
    deriveDashboardAlerts(operationalSignals);

  const searchCoverage =
    deriveDashboardSearchCoverage({
      users: userLoadState,
      academies: academyLoadState,
      profileClaims: profileClaimsLoadState,
    });

  const searchResults = searchDashboardData({
    query: headerSearchQuery,
    users,
    academies: academiesList.map((academy) => ({
      id: academy.id,
      name: academy.name || academy.id,
    })),
    claims: profileClaimsList.map((c) => ({
      id: c.id,
      playerName: c.playerName || c.userName,
      futId: c.futId,
      userEmail: c.userEmail,
    })),
  });

  const handleNavigate = (tab: SuperAdminTab) => {
    if ((CLEAN_AVAILABLE_TABS as readonly string[]).includes(tab)) {
      setActiveTab(tab as CleanTab);
    }
  };

  const handleSearchSelect = (result: DashboardSearchResult) => {
    const selection = resolveDashboardSearchSelection(result);

    if ((CLEAN_AVAILABLE_TABS as readonly string[]).includes(selection.tab)) {
      setActiveTab(selection.tab as CleanTab);
    }

    setSearchQuery(selection.accountQuery);
    setAcademySearchQuery(selection.academyQuery);
    setClaimsSearchQuery(selection.claimQuery);
  };

  const handleExportReport = () => {
    downloadSuperAdminDashboardCsv({
      exportedAt: new Date(),
      academyCount,
      academyLoadState,
      roleCounts,
      users,
      operationalSignals,
      recentActivities,
      recentActivityLoadState: activityLoadState,
    });
  };

  const actorUid = authUser?.uid || authUser?.id;
  useEffect(() => {
    setStaffClaimView(null);

    if (!relationshipInventoryActorUid) {
      setStaffClaimLoadState("idle");
      return;
    }

    if (!selectedUser) {
      setStaffClaimLoadState("idle");
      return;
    }

    const intent = assessRequestedIntent(selectedUser.requestedRole);

    if (
      intent.kind !== "TENANT_MEMBERSHIP_INTENT" ||
      !selectedUser.id
    ) {
      setStaffClaimLoadState("idle");
      return;
    }

    const capturedUid = selectedUser.id;
    const capturedUser = selectedUser;
    let cancelled = false;

    setStaffClaimLoadState("loading");

    async function loadStaffClaims() {
      try {
        const claimsQuery = query(
          collection(db, "profile_claims"),
          where("userId", "==", capturedUid),
        );
        const snap = await getDocs(claimsQuery);
        if (cancelled) return;

        const rawClaims = snap.docs.map((docSnap) =>
          mapCanonicalClaimSnapshot(
            docSnap.id,
            docSnap.data() as Record<string, unknown>,
          ),
        );

        if (cancelled) return;

        const resolved = resolveStaffClaimView(rawClaims, capturedUser);
        setStaffClaimView(resolved);
        setStaffClaimLoadState("loaded");
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to query profile_claims for user:", err);
        setStaffClaimView(null);
        setStaffClaimLoadState("error");
      }
    }

    void loadStaffClaims();

    return () => {
      cancelled = true;
    };
  }, [selectedUser?.id, selectedUser?.requestedRole, relationshipInventoryActorUid]);

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

  const openUserReview = (user: User, mode: UserReviewMode = "APPROVAL_REVIEW") => {
    setReviewMode(mode);
    setApprovedRole("");
    setMutationError(null);
    setMutationNotice(null);
    setSelectedUser(user);
    setStaffClaimView(null);
  };

  const handleApprove = async (user: User) => {
    if (!user.id || !actorUid) {
      setMutationError("Canonical target UID and authenticated SuperAdmin UID are required.");
      return;
    }
    if (reviewMode !== "APPROVAL_REVIEW") {
      setMutationError("Account approval is only permitted in Approval Review mode.");
      return;
    }
    if (!canReviewModeApprove(
      reviewMode,
      user.status,
      user.requestedRole,
      user.role,
    )) {
      setMutationError("Only pending USER accounts with safe account intent can be approved.");
      return;
    }
    if (!isSafeAccountRole(approvedRole)) {
      setMutationError("Please explicitly select an approved account role.");
      return;
    }
    beginMutation();
    try {
      await approveUserAtomically({
        ...administrativeTarget(user),
        actorUid,
        approvedRole,
      });
      void invalidateRelationshipInventory();
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
    if (reviewMode !== "APPROVAL_REVIEW") {
      setMutationError("Account rejection is only permitted in Approval Review mode.");
      return;
    }
    if (!canReviewModeReject(reviewMode, user.status, user.requestedRole, user.role)) {
      setMutationError("This account record cannot be rejected from the Approval Review modal.");
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
      void invalidateRelationshipInventory();
      setSelectedUser(null);
      setMutationNotice(`${user.email || user.name} rejected with an atomic audit record.`);
    } catch (error) {
      mutationFailure(error, "Error rejecting user");
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
      void invalidateRelationshipInventory();
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
      void invalidateRelationshipInventory();
      setMutationNotice(`${user.email || user.name} status updated atomically to ${newStatus}.`);
    } catch (error) {
      mutationFailure(error, "Error updating status");
    } finally {
      setIsMutating(false);
    }
  };

  const handleEnterWorkspace = async (targetAcademyId: string) => {
    beginMutation();
    try {
      await enterAcademyWorkspace(targetAcademyId);
      onBack();
    } catch (error) {
      mutationFailure(error, "Error entering Academy workspace");
    } finally {
      setIsMutating(false);
    }
  };

  const handleStartWorkMode = async (targetAcademyId: string, targetUid: string) => {
    beginMutation();
    try {
      await startStaffWorkMode(targetAcademyId, targetUid);
      onBack();
    } catch (error) {
      mutationFailure(error, "Error starting Staff Work Mode");
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

  const filteredAcademies = academiesList.filter(
    (academy) =>
      academy.name?.toLowerCase().includes(academySearchQuery.toLowerCase()) ||
      academy.id.toLowerCase().includes(academySearchQuery.toLowerCase()),
  );

  const filteredLogs = logsList.filter(
    (log) =>
      log.action.toLowerCase().includes(logsSearchQuery.toLowerCase()) ||
      log.actorUid?.toLowerCase().includes(logsSearchQuery.toLowerCase()) ||
      log.targetEmail?.toLowerCase().includes(logsSearchQuery.toLowerCase()) ||
      log.targetUid?.toLowerCase().includes(logsSearchQuery.toLowerCase()),
  );

  const filteredClaims = profileClaimsList.filter(
    (claim) =>
      claim.playerName?.toLowerCase().includes(claimsSearchQuery.toLowerCase()) ||
      claim.futId?.toLowerCase().includes(claimsSearchQuery.toLowerCase()) ||
      claim.userEmail?.toLowerCase().includes(claimsSearchQuery.toLowerCase()) ||
      claim.userName?.toLowerCase().includes(claimsSearchQuery.toLowerCase()) ||
      claim.requestedRole?.toLowerCase().includes(claimsSearchQuery.toLowerCase()) ||
      claim.approvedRole?.toLowerCase().includes(claimsSearchQuery.toLowerCase()) ||
      claim.academyId?.toLowerCase().includes(claimsSearchQuery.toLowerCase()) ||
      claim.requestedAcademyId?.toLowerCase().includes(claimsSearchQuery.toLowerCase()) ||
      claim.approvedAcademyId?.toLowerCase().includes(claimsSearchQuery.toLowerCase()) ||
      claim.id.toLowerCase().includes(claimsSearchQuery.toLowerCase()),
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
        searchCoverage={searchCoverage}
        onSearchQueryChange={setHeaderSearchQuery}
        onSearchSelect={handleSearchSelect}
      />

      <SuperAdminPortalNavigation
        activeTab={activeTab}
        onNavigate={handleNavigate}
        operationalSignals={operationalSignals}
        academyCount={academyCount}
      />

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

        {(activeTab === "observation_metrics" ||
          activeTab === "payment_approvals") && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-black text-amber-950">
                Parent / Player support session
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-amber-800">
                Start the existing controlled Work As workflow. The
                authenticated actor remains SUPERADMIN and the existing support
                engine continues to validate the presented Parent or Player
                context.
              </p>
            </div>

            <div className="shrink-0">
              <SuperAdminNonStaffWorkAsLauncher />
            </div>
          </div>
        )}

        {activeTab === "dashboard" && (
          <SuperAdminOverview
            academyCount={academyCount}
            academyLoadState={academyLoadState}
            roleCounts={roleCounts}
            userLoadState={userLoadState}
            operationalSignals={operationalSignals}
            reviewQueue={reviewQueue}
            activities={recentActivities}
            activityLoadState={activityLoadState}
            alerts={alerts}
            onNavigate={handleNavigate}
            availableTabs={CLEAN_AVAILABLE_TABS}
          />
        )}

        {activeTab === "relationships" && (
          <SuperAdminUsersRelationships
            inventoryState={relationshipInventoryState}
            onRefresh={refreshRelationshipInventory}
            onInventoryInvalidated={invalidateRelationshipInventory}
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
                            {(() => {
                              const badge = getUserApprovalBadge(user.requestedRole);
                              const badgeColor =
                                badge.kind === "SAFE_ACCOUNT"
                                  ? "bg-blue-100 text-blue-800 border-blue-200"
                                  : badge.kind === "TENANT_STAFF"
                                    ? "bg-amber-100 text-amber-800 border-amber-200"
                                    : "bg-rose-100 text-rose-800 border-rose-200";
                              return (
                                <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${badgeColor}`}>
                                  {badge.label}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="p-4 text-slate-500 text-xs">
                            {formatFirestoreDate(user.createdAt)}
                          </td>
                          <td className="p-4 text-right space-x-2 whitespace-nowrap">
                            {canReviewModeApprove(
                              "APPROVAL_REVIEW",
                              user.status,
                              user.requestedRole,
                              user.role,
                            ) ? (
                              <>
                                <button
                                  onClick={() => openUserReview(user, "APPROVAL_REVIEW")}
                                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="View Profile"
                                >
                                  <Eye size={18} />
                                </button>
                                <button
                                  onClick={() => openUserReview(user, "APPROVAL_REVIEW")}
                                  className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                  title="Review explicit account approval"
                                >
                                  <CheckCircle size={18} />
                                </button>
                                <button
                                  onClick={() => openUserReview(user, "APPROVAL_REVIEW")}
                                  disabled={isMutating}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                  title="Review account rejection"
                                >
                                  <XCircle size={18} />
                                </button>
                              </>
                            ) : assessRequestedIntent(user.requestedRole).kind === "TENANT_MEMBERSHIP_INTENT" ? (
                              <button
                                onClick={() => openUserReview(user, "APPROVAL_REVIEW")}
                                className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                title="View Membership Status"
                              >
                                <Eye size={18} />
                              </button>
                            ) : (
                              <button
                                onClick={() => openUserReview(user, "APPROVAL_REVIEW")}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="View non-actionable account record"
                              >
                                <Eye size={18} />
                              </button>
                            )}
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
                    <th className="p-4">Organization Context</th>
                    <th className="p-4">Current Authority</th>
                    <th className="p-4">Account Status</th>
                    <th className="p-4">Account Role</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoadingUsers ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
                      </td>
                    </tr>
                  ) : userLoadState === "unavailable" ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-rose-600">
                        User inventory unavailable.
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => {
                      const organizationContext =
                        accountOrganizationContextFor(user.id);

                      return (
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

                        <SuperAdminAccountOrganizationCells
                          context={organizationContext}
                        />

                        <td className="p-4">
                          <select
                            value={normalizeManagedAccountStatus(user.status)}
                            onChange={(e) =>
                              handleUpdateStatus(user, e.target.value)
                            }
                            disabled={
                              isMutating
                              || user.id === actorUid
                              || user.role === "SUPERADMIN"
                            }
                            className={`text-xs font-bold rounded-xl px-2 py-1 outline-none cursor-pointer border ${
                              normalizeManagedAccountStatus(user.status) === "ACTIVE"
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                : normalizeManagedAccountStatus(user.status) === "PENDING"
                                  ? "bg-amber-100 text-amber-800 border-amber-200"
                                  : normalizeManagedAccountStatus(user.status) === "REJECTED"
                                    ? "bg-rose-100 text-rose-800 border-rose-200"
                                    : "bg-slate-100 text-slate-800 border-slate-200"
                            }`}
                          >
                            <option value="" disabled>
                              {getManagedAccountStatusDisplay(user.status)}
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
                                ? "Account role (not organization authority)"
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
                            onClick={() => openUserReview(user, "READ_ONLY_PROFILE")}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Profile"
                          >
                            <Eye size={18} />
                          </button>
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "academies" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-2">
                <Building2 className="text-emerald-600" size={20} />
                <h3 className="font-black text-slate-800 text-base">Academies Directory</h3>
              </div>
              <div className="relative flex-1 sm:w-64 w-full">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  type="text"
                  placeholder="Filter academies by name or exact ID..."
                  value={academySearchQuery}
                  onChange={(e) => setAcademySearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>
            <div className="bg-emerald-50/70 border-b border-emerald-100 px-4 py-3 text-xs text-emerald-800 font-medium flex items-center gap-2">
              <ShieldAlert className="shrink-0 text-emerald-600" size={16} />
              SuperAdmin Global Academies Directory. Select an Academy to enter its workspace directly, or view staff to operate in Work Mode.
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4">Academy Name</th>
                    <th className="p-4">Academy Document ID</th>
                    <th className="p-4">Short Name</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {academyLoadState === "loading" ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
                      </td>
                    </tr>
                  ) : academyLoadState === "unavailable" ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-rose-600">
                        Academies inventory unavailable.
                      </td>
                    </tr>
                  ) : filteredAcademies.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">
                        No academies found matching filter.
                      </td>
                    </tr>
                  ) : (
                    filteredAcademies.map((academyItem) => (
                      <tr key={academyItem.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 font-bold text-slate-800 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                            {academyItem.name?.[0] || academyItem.id[0]}
                          </div>
                          <span>{academyItem.name || academyItem.id}</span>
                        </td>
                        <td className="p-4 text-xs font-mono text-slate-600">
                          {academyItem.id}
                        </td>
                        <td className="p-4 text-xs text-slate-500">
                          {academyItem.shortName || "-"}
                        </td>
                        <td className="p-4 text-right space-x-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleEnterWorkspace(academyItem.id)}
                            disabled={isMutating}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors inline-flex items-center gap-1.5 shadow-sm"
                          >
                            <ArrowRight size={14} />
                            Enter Workspace
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedAcademyForStaff(academyItem)}
                            disabled={isMutating}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors inline-flex items-center gap-1.5 shadow-sm"
                          >
                            <UserCheck size={14} />
                            Staff ({users.filter((u) => u.academyId === academyItem.id || u.activeAcademyId === academyItem.id).length})
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

        {selectedAcademyForStaff && (
          <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
                    <UserCheck className="text-emerald-600" size={20} />
                    Staff Directory
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Academy: <span className="font-bold text-slate-800">{selectedAcademyForStaff.name || selectedAcademyForStaff.id}</span> ({selectedAcademyForStaff.id})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAcademyForStaff(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs p-3 rounded-xl">
                Work Mode requires an exact ACTIVE ADMIN or COACH membership. Firebase actor identity remains SuperAdmin.
              </div>

              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-3">Staff User</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Membership Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {staffLoadState === "loading" ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-slate-500">
                          <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
                        </td>
                      </tr>
                    ) : staffMembersList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-slate-500">
                          No staff members found in this Academy.
                        </td>
                      </tr>
                    ) : (
                      staffMembersList.map((staff) => {
                        const canWorkAs = isExactActiveStaffMembership(
                          staff.data,
                          staff.userId,
                          staff.academyId,
                          staff.id,
                        );
                        return (
                          <tr key={staff.id} className="hover:bg-slate-50/50">
                            <td className="p-3">
                              <div className="font-bold text-slate-800">
                                {staff.displayName || staff.userId}
                              </div>
                              {staff.userEmail && (
                                <div className="text-xs text-slate-500">{staff.userEmail}</div>
                              )}
                            </td>
                            <td className="p-3 font-mono text-xs font-bold text-slate-700">
                              {staff.role}
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 text-[10px] font-bold rounded-lg border ${
                                  staff.status === "ACTIVE"
                                    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                    : "bg-slate-100 text-slate-700 border-slate-200"
                                }`}
                              >
                                {staff.status}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              {canWorkAs ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleStartWorkMode(staff.academyId, staff.userId)
                                  }
                                  disabled={isMutating}
                                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition-colors shadow-sm inline-flex items-center gap-1"
                                >
                                  Work As
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400 font-medium bg-slate-100 px-2.5 py-1 rounded-lg">
                                  Unavailable
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "system_logs" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-2">
                <FileText className="text-emerald-600" size={20} />
                <h3 className="font-black text-slate-800 text-base">System Audit Logs</h3>
              </div>
              <div className="relative flex-1 sm:w-64 w-full">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  type="text"
                  placeholder="Filter logs by action, actor, target..."
                  value={logsSearchQuery}
                  onChange={(e) => setLogsSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4">Action</th>
                    <th className="p-4">Actor</th>
                    <th className="p-4">Target</th>
                    <th className="p-4">Log Record ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logsLoadState === "loading" ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
                      </td>
                    </tr>
                  ) : logsLoadState === "unavailable" ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-rose-600">
                        Audit log entry collection is unavailable.
                      </td>
                    </tr>
                  ) : filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">
                        No audit log entries found matching filter.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 font-bold text-slate-800">
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-800 text-xs font-mono rounded-lg border border-slate-200">
                            {log.action}
                          </span>
                        </td>
                        <td className="p-4 text-xs font-mono text-slate-600">
                          {log.actorUid || log.approvedBy || log.updatedBy || "System"}
                        </td>
                        <td className="p-4 text-xs font-mono text-slate-600">
                          {log.targetEmail || log.targetUid || log.userId || "-"}
                        </td>
                        <td className="p-4 text-xs font-mono text-slate-400">
                          {log.id}
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
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-2">
                <BadgeCheck className="text-emerald-600" size={20} />
                <h3 className="font-black text-slate-800 text-base">Profile Claims Audit</h3>
              </div>
              <div className="relative flex-1 sm:w-64 w-full">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  type="text"
                  placeholder="Filter claims by email, name, role, academy..."
                  value={claimsSearchQuery}
                  onChange={(e) => setClaimsSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>
            <div className="bg-blue-50/70 border-b border-blue-100 px-4 py-3 text-xs text-blue-800 font-medium flex items-center gap-2">
              <ShieldAlert className="shrink-0 text-blue-600" size={16} />
              SuperAdmin Profile Claims is a read-only audit view. No claim status or player-link writes are performed from this screen.
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4">User</th>
                    <th className="p-4">Requested Role</th>
                    <th className="p-4">Academy ID</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Claim ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {profileClaimsLoadState === "loading" ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
                      </td>
                    </tr>
                  ) : profileClaimsLoadState === "unavailable" ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-rose-600">
                        Profile claims inventory unavailable.
                      </td>
                    </tr>
                  ) : filteredClaims.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">
                        No profile claims found matching filter.
                      </td>
                    </tr>
                  ) : (
                    filteredClaims.map((claim) => (
                      <tr key={claim.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4">
                          <div className="font-bold text-slate-800">{claim.userName || "-"}</div>
                          <div className="text-xs text-slate-500">{claim.userEmail || claim.userId || "-"}</div>
                        </td>
                        <td className="p-4">
                          <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full border border-amber-200">
                            {claim.requestedRole || "-"}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-xs text-slate-700">
                          {(() => {
                            const display = resolveClaimDisplayAcademy(claim);
                            return (
                              <div className="flex flex-col">
                                <span>{display.academyId}</span>
                                {display.label && display.academyId !== "-" && (
                                  <span className="text-[10px] text-slate-400 font-sans font-medium">{display.label}</span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${
                            claim.status === "APPROVED"
                              ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                              : claim.status === "REJECTED"
                                ? "bg-rose-100 text-rose-800 border-rose-200"
                                : "bg-amber-100 text-amber-800 border-amber-200"
                          }`}>
                            {claim.status || "PENDING"}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-xs text-slate-400">
                          {claim.id}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "payment_approvals" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-2xl mx-auto shadow-sm">
            <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-200">
              <CreditCard size={24} />
            </div>
            <h3 className="text-lg font-black text-slate-900 mb-2">
              Payment Approvals Control Unavailable
            </h3>
            <p className="text-slate-600 text-sm leading-relaxed mb-6">
              Payment approvals require an authoritative server-backed payment gateway API. Client-side payment status modification is disabled under Access A6 security rules to prevent unbacked privilege escalation.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200">
              <ShieldAlert size={14} className="text-amber-600" />
              Access A6 Security Baseline Preserved
            </div>
          </div>
        )}

        {activeTab === "bootstrap_legacy" && (
          <BootstrapLegacyAdmin />
        )}
        {activeTab === "observation_metrics" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-2xl mx-auto shadow-sm">
            <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-200">
              <Activity size={24} />
            </div>
            <h3 className="text-lg font-black text-slate-900 mb-2">
              Observation Metrics Configuration Unavailable
            </h3>
            <p className="text-slate-600 text-sm leading-relaxed mb-6">
              This module is reserved for defining the match observation and statistic buttons available to Parent and other authorized match-observation flows. The authoritative configuration backend is not connected in this release, so no synthetic button definitions are shown.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200">
              <ShieldAlert size={14} className="text-blue-600" />
              Match Observation Configuration Preserved
            </div>
          </div>
        )}
      </div>

      {/* User Review / Approval Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-start shrink-0">
              <div>
                <h3 className="text-xl font-black text-slate-800">
                  {reviewMode === "APPROVAL_REVIEW" ? "User Review & Approval" : "User Profile"}
                </h3>
                <p className="text-sm text-slate-500">
                  {reviewMode === "APPROVAL_REVIEW"
                    ? "Review details and take explicit approval action"
                    : "Read-only profile inspection"}
                </p>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              {mutationError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
                  {mutationError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
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
                  <div className="font-bold text-slate-800 truncate">
                    {selectedUser.email}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs font-bold uppercase mb-1">
                    Account Status
                  </div>
                  <div className="font-bold text-slate-800">
                    {getManagedAccountStatusDisplay(selectedUser.status)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs font-bold uppercase mb-1">
                    Registered Date
                  </div>
                  <div className="font-bold text-slate-800">
                    {formatFirestoreDate(selectedUser.createdAt)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs font-bold uppercase mb-1">
                    Account Role
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

              {/* Dynamic Review Mode & Intent Body */}
              {(() => {
                if (reviewMode === "READ_ONLY_PROFILE") {
                  return (
                    <>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                        Account Role and Account Status remain read-only in this profile. Controlled Academy Membership status actions appear below only for verified canonical Membership evidence.
                      </div>

                      <SuperAdminUserRelationshipInspector
                        userId={selectedUser.id}
                        context={accountOrganizationContextFor(selectedUser.id)}
                        row={relationshipRowsByUserId.get(selectedUser.id)}
                        onRefresh={refreshRelationshipInventory}
                        onMutationRefresh={refreshRelationshipInventoryAfterMutation}
                      />
                    </>
                  );
                }

                if (!isPendingAccountStatus(selectedUser.status)) {
                  const displayedStatus = getManagedAccountStatusDisplay(selectedUser.status);
                  return (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
                      This account record is not in a pending state ({displayedStatus}). Approval actions are disabled.
                    </div>
                  );
                }

                if (selectedUser.role !== "USER") {
                  return (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-900">
                      Generic account approval and rejection require the current authoritative role to be exactly USER. This record is read-only in the generic workflow.
                    </div>
                  );
                }

                const intent = assessRequestedIntent(selectedUser.requestedRole);

                if (intent.kind === "SAFE_ACCOUNT_INTENT") {
                  return (
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
                        Explicit approved account role
                      </span>
                      <select
                        value={approvedRole}
                        onChange={(event) => {
                          const val = event.target.value;
                          if (val === "" || isSafeAccountRole(val)) {
                            setApprovedRole(val as ExplicitAccountRoleSelection);
                          }
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                      >
                        <option value="">Select approved account role...</option>
                        {SAFE_ACCOUNT_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                      <span className="mt-1 block text-xs text-slate-500">
                        Must be explicitly chosen. Never automatically derived from requested intent.
                      </span>
                    </label>
                  );
                }

                if (intent.kind === "TENANT_MEMBERSHIP_INTENT") {
                  return (
                    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                      <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                        <ShieldAlert className="text-amber-600 shrink-0" size={18} />
                        STAFF MEMBERSHIP REQUIRED
                      </div>
                      <p className="text-xs text-amber-800 leading-relaxed">
                        {intent.intent} authority requires an exact ACTIVE Academy Membership.
                      </p>

                      {staffClaimLoadState === "loading" && (
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 py-2">
                          <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                          Checking Academy Membership request...
                        </div>
                      )}

                      {staffClaimLoadState === "error" && (
                        <div className="rounded-lg bg-rose-100 border border-rose-200 p-2.5 text-xs font-bold text-rose-800">
                          Academy Membership request could not be verified.
                        </div>
                      )}

                      {staffClaimLoadState === "loaded" && staffClaimView?.state === "NO_CLAIM" && (
                        <div className="space-y-2 text-xs text-slate-700 bg-white p-3 rounded-lg border border-amber-200/60">
                          <div className="font-bold text-slate-800">
                            Waiting for Academy Join Request
                          </div>
                          <p className="text-slate-600">
                            This user must sign in and enter a valid Academy Invite Code before staff Membership can be approved.
                          </p>
                          {selectedUser.requestedAcademyName && (
                            <div className="mt-2 pt-2 border-t border-slate-100 text-[11px]">
                              <span className="font-bold text-slate-500">
                                Requested academy name (registration metadata):
                              </span>{" "}
                              <span className="font-semibold text-slate-700">
                                {selectedUser.requestedAcademyName}
                              </span>{" "}
                              <span className="text-amber-700 italic">
                                (non-authoritative)
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {staffClaimLoadState === "loaded" && staffClaimView?.state === "PENDING" && (
                        <div className="space-y-3 bg-white p-3 rounded-lg border border-amber-200/60 text-xs">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-slate-500 font-bold uppercase text-[10px] block">Status</span>
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-bold rounded-md border border-amber-200 inline-block text-[11px]">
                                PENDING
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 font-bold uppercase text-[10px] block">Requested Role</span>
                              <span className="font-bold text-slate-800">{staffClaimView.role}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 font-bold uppercase text-[10px] block">Academy ID</span>
                              <span className="font-mono font-bold text-slate-800">{staffClaimView.academyId}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 font-bold uppercase text-[10px] block">Claim ID</span>
                              <span className="font-mono text-slate-600 truncate block">{staffClaimView.claimId}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleEnterWorkspace(staffClaimView.academyId)}
                            disabled={isMutating}
                            className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                          >
                            <ArrowRight size={14} />
                            Enter Academy Membership Flow
                          </button>
                        </div>
                      )}

                      {staffClaimLoadState === "loaded" && staffClaimView?.state === "APPROVED" && (
                        <div className="space-y-2 bg-white p-3 rounded-lg border border-emerald-200 text-xs">
                          <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
                            <CheckCircle size={14} className="text-emerald-600" />
                            Membership Claim Approved
                          </div>
                          <div className="text-slate-700">
                            <span className="font-semibold">Academy:</span> {staffClaimView.academyId} | <span className="font-semibold">Role:</span> {staffClaimView.role}
                          </div>
                          <p className="text-slate-600 text-[11px]">
                            The Membership is approved. The user must complete Activate Academy Access from their own account.
                          </p>
                        </div>
                      )}

                      {staffClaimLoadState === "loaded" && staffClaimView?.state === "REJECTED" && (
                        <div className="space-y-1 bg-white p-3 rounded-lg border border-rose-200 text-xs">
                          <div className="flex items-center gap-1.5 text-rose-800 font-bold">
                            <XCircle size={14} className="text-rose-600" />
                            Membership Claim Rejected
                          </div>
                          <p className="text-slate-600 text-[11px]">
                            The Academy Membership claim was rejected.
                          </p>
                        </div>
                      )}

                      {staffClaimLoadState === "loaded" && staffClaimView?.state === "AMBIGUOUS" && (
                        <div className="space-y-2 bg-white p-3 rounded-lg border border-amber-300 text-xs text-amber-900">
                          <div className="font-bold">
                            Conflicting or malformed Academy Membership claims require manual review.
                          </div>
                          <p className="text-[11px] text-slate-600">
                            Conflicting, malformed, or multiple claims were detected for exact UID <span className="font-mono font-bold">{selectedUser.id}</span>. Review these UID-scoped claim records:
                          </p>
                          <div className="space-y-1.5" aria-label="Conflicting UID-scoped claim records">
                            {staffClaimView.claims.map((claim) => (
                              <div
                                key={claim.claimId}
                                className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-slate-700"
                              >
                                <div className="font-mono font-bold text-slate-900 break-all">
                                  {claim.claimId}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                  <span>Status: <strong>{claim.status || "UNKNOWN"}</strong></span>
                                  <span>Role: <strong>{claim.role || "UNKNOWN"}</strong></span>
                                  <span>Academy: <strong>{claim.academyId || "UNKNOWN"}</strong></span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-900"
                    role="alert"
                  >
                    {intent.reason}
                  </div>
                );
              })()}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
              {reviewMode === "READ_ONLY_PROFILE"
              || !isPendingAccountStatus(selectedUser.status)
              || (
                !canReviewModeReject(
                  reviewMode,
                  selectedUser.status,
                  selectedUser.requestedRole,
                  selectedUser.role,
                )
                && !canReviewModeApprove(
                  reviewMode,
                  selectedUser.status,
                  selectedUser.requestedRole,
                  selectedUser.role,
                )
              ) ? (
                <button
                  onClick={() => setSelectedUser(null)}
                  className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors text-sm"
                >
                  Close
                </button>
              ) : (
                <>
                  {canReviewModeReject(reviewMode, selectedUser.status, selectedUser.requestedRole, selectedUser.role) && (
                    <button
                      onClick={() => handleReject(selectedUser)}
                      disabled={isMutating}
                      className="px-4 py-2 text-rose-600 font-bold hover:bg-rose-50 rounded-xl transition-colors"
                    >
                      Reject Account Request
                    </button>
                  )}
                  {canReviewModeApprove(
                    reviewMode,
                    selectedUser.status,
                    selectedUser.requestedRole,
                    selectedUser.role,
                  ) && (
                    <button
                      onClick={() => handleApprove(selectedUser)}
                      disabled={isMutating || approvedRole === ""}
                      className={`px-6 py-2 font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2 ${
                        approvedRole === "" || isMutating
                          ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                          : "bg-emerald-500 hover:bg-emerald-600 text-white"
                      }`}
                    >
                      <CheckCircle size={18} />
                      {getApprovalActionLabel(approvedRole)}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
