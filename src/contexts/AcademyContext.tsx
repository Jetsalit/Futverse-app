import React, { createContext, useContext, useEffect, useState } from "react";
import { FirebaseError } from "firebase/app";
import {
  collection,
  CollectionReference,
  deleteField,
  doc,
  DocumentData,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  mapCanonicalSnapshot,
  withoutCanonicalDocumentId,
} from "../lib/firestore/canonicalDocument";
import type { Membership, TenantRole } from "../types/Membership";
import { useAuth } from "./AuthContext";
import {
  isExactActiveMembership,
  isExactDocumentId,
  resolveExactMembershipSnapshot,
} from "./academyAccessModel";
import { useSuperAdminSupport } from "./SuperAdminSupportContext";
import {
  canUpdateAcademySettings,
  isExactActiveSuperAdmin,
} from "../lib/superAdminSupportModel";

export interface AcademySettings {
  name: string;
  shortName: string;
  logoUrl: string | null;
  squads: string[];
  inviteCode?: string;
}

export interface AcademyDocument extends Partial<AcademySettings> {
  id: string;
  [key: string]: unknown;
}

export type AcademyAccessState =
  | "LOADING"
  | "ACTIVE_MEMBERSHIP"
  | "SUPERADMIN_WORKSPACE"
  | "NO_ACADEMY"
  | "MEMBERSHIP_MISSING"
  | "MEMBERSHIP_PENDING"
  | "MEMBERSHIP_SUSPENDED"
  | "MEMBERSHIP_LEFT"
  | "MEMBERSHIP_REVOKED"
  | "ACADEMY_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "ERROR";

interface AcademyContextType {
  settings: AcademySettings;
  updateSettings: (newSettings: Partial<AcademySettings>) => Promise<void>;
  loading: boolean;
  academyId: string | null;
  academy: AcademyDocument | null;
  membership: Membership | null;
  tenantRole: TenantRole | null;
  accessState: AcademyAccessState;
  error: Error | null;
  getAcademyCollection: (collectionName: string) => CollectionReference<DocumentData>;
}

const defaultSettings: AcademySettings = {
  name: "Academy",
  shortName: "Academy",
  logoUrl: null,
  squads: [],
};

const AcademyContext = createContext<AcademyContextType | undefined>(undefined);

const permissionDenied = (error: unknown) =>
  error instanceof FirebaseError && error.code === "permission-denied";

const normalizeError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

export function AcademyProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, actualUser } = useAuth();
  const supportContext = useSuperAdminSupport();

  const isSuperAdminActor = isExactActiveSuperAdmin(actualUser);
  const supportAcademyId = isSuperAdminActor ? supportContext.activeAcademyId : null;
  const supportSession = isSuperAdminActor ? supportContext.session : null;

  const [settings, setSettings] = useState<AcademySettings>(defaultSettings);
  const [academyId, setAcademyId] = useState<string | null>(null);
  const [academy, setAcademy] = useState<AcademyDocument | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [tenantRole, setTenantRole] = useState<TenantRole | null>(null);
  const [accessState, setAccessState] = useState<AcademyAccessState>("LOADING");
  const [authorizedScopeKey, setAuthorizedScopeKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const requestedUid = currentUser?.uid || currentUser?.id || null;
  const requestedAcademyId = currentUser?.activeAcademyId ?? null;
  const requestedScopeKey =
    isExactDocumentId(requestedUid) && isExactDocumentId(requestedAcademyId)
      ? JSON.stringify([requestedUid, requestedAcademyId])
      : null;

  useEffect(() => {
    let cancelled = false;
    let unsubscribeMembership: (() => void) | undefined;
    let unsubscribeAcademy: (() => void) | undefined;
    let resolutionVersion = 0;

    const clearTenantAccess = () => {
      setAuthorizedScopeKey(null);
      setAcademyId(null);
      setAcademy(null);
      setMembership(null);
      setTenantRole(null);
      setSettings(defaultSettings);
    };

    const stopAcademyListener = () => {
      unsubscribeAcademy?.();
      unsubscribeAcademy = undefined;
    };

    // PATH B: SuperAdmin Support Workspace Path (SuperAdmin never uses Path A)
    if (isSuperAdminActor) {
      clearTenantAccess();
      setError(null);

      if (!supportAcademyId) {
        setAccessState("NO_ACADEMY");
        setLoading(false);
        return;
      }

      if (!isExactDocumentId(supportAcademyId)) {
        setAccessState("ERROR");
        setError(new Error("supportAcademyId must be an exact Firestore document ID."));
        setLoading(false);
        return;
      }

      const scopeKey = JSON.stringify(["SUPERADMIN", supportAcademyId]);
      setAccessState("LOADING");
      setLoading(true);

      unsubscribeAcademy = onSnapshot(
        doc(db, "academies", supportAcademyId),
        { includeMetadataChanges: true },
        (academySnapshot) => {
          if (cancelled) return;

          if (academySnapshot.metadata.fromCache) {
            clearTenantAccess();
            setAccessState("ERROR");
            setError(new Error("Authoritative Academy data is unavailable."));
            setLoading(false);
            return;
          }

          if (academySnapshot.metadata.hasPendingWrites) {
            // Preserve the last server-authoritative Academy context.
            // Do not consume locally pending Academy data.
            return;
          }

          if (!academySnapshot.exists()) {
            clearTenantAccess();
            setAccessState("ACADEMY_NOT_FOUND");
            setError(null);
            setLoading(false);
            return;
          }

          const academyData = mapCanonicalSnapshot<AcademyDocument>(academySnapshot);
          const nextSettings = {
            ...defaultSettings,
            ...academySnapshot.data(),
          };

          setAuthorizedScopeKey(scopeKey);
          setAcademyId(supportAcademyId);
          setAcademy(academyData);
          setMembership(null); // SuperAdmin has no fake membership
          setTenantRole(null); // Effective role remains in SuperAdminSupportContext instead
          setSettings(nextSettings);
          setAccessState("SUPERADMIN_WORKSPACE");
          setError(null);
          setLoading(false);
        },
        (academySnapshotError) => {
          if (cancelled) return;
          clearTenantAccess();
          setError(normalizeError(academySnapshotError));
          setAccessState(
            permissionDenied(academySnapshotError)
              ? "PERMISSION_DENIED"
              : "ERROR",
          );
          setLoading(false);
        },
      );

      return () => {
        cancelled = true;
        stopAcademyListener();
      };
    }

    // PATH A: Normal Staff Membership Resolution
    if (!currentUser) {
      clearTenantAccess();
      setError(null);
      setAccessState("NO_ACADEMY");
      setLoading(false);
      return;
    }

    clearTenantAccess();
    setError(null);

    if (!isExactDocumentId(requestedUid)) {
      setAccessState("ERROR");
      setError(new Error("Authenticated UID is missing."));
      setLoading(false);
      return;
    }

    if (requestedAcademyId === null) {
      setAccessState("NO_ACADEMY");
      setLoading(false);
      return;
    }

    if (!isExactDocumentId(requestedAcademyId) || !requestedScopeKey) {
      setAccessState("ERROR");
      setError(new Error("activeAcademyId must be an exact Firestore document ID."));
      setLoading(false);
      return;
    }

    const uid = requestedUid;
    const activeAcademyId = requestedAcademyId;
    const scopeKey = requestedScopeKey;

    setAccessState("LOADING");
    setLoading(true);

    unsubscribeMembership = onSnapshot(
      doc(db, "academies", activeAcademyId, "members", uid),
      { includeMetadataChanges: true },
      (membershipSnapshot) => {
        if (cancelled) return;
        const currentVersion = ++resolutionVersion;
        stopAcademyListener();
        clearTenantAccess();

        if (
          membershipSnapshot.metadata.fromCache ||
          membershipSnapshot.metadata.hasPendingWrites
        ) {
          setAccessState("ERROR");
          setError(new Error("Authoritative Membership data is unavailable."));
          setLoading(false);
          return;
        }

        const membershipResolution = resolveExactMembershipSnapshot(
          membershipSnapshot.exists(),
          membershipSnapshot.exists() ? membershipSnapshot.data() : null,
          membershipSnapshot.id,
          uid,
          activeAcademyId,
        );
        if (membershipResolution.state !== "ACTIVE_MEMBERSHIP") {
          setAccessState(membershipResolution.state);
          setError(
            membershipResolution.state === "MEMBERSHIP_MISSING"
              ? new Error("Membership not found.")
              : membershipResolution.state === "ERROR"
                ? new Error("Membership data is invalid or unauthorized.")
                : null,
          );
          setLoading(false);
          return;
        }

        const membershipData = membershipResolution.membership;

        setAccessState("LOADING");
        setError(null);
        setLoading(true);

        unsubscribeAcademy = onSnapshot(
          doc(db, "academies", activeAcademyId),
          { includeMetadataChanges: true },
          (academySnapshot) => {
            if (cancelled || currentVersion !== resolutionVersion) return;

            if (academySnapshot.metadata.fromCache) {
              clearTenantAccess();
              setAccessState("ERROR");
              setError(new Error("Authoritative Academy data is unavailable."));
              setLoading(false);
              return;
            }

            if (academySnapshot.metadata.hasPendingWrites) {
              // Preserve the last server-authoritative Academy context.
              // Do not consume locally pending Academy data.
              return;
            }

            if (!academySnapshot.exists()) {
              clearTenantAccess();
              setAccessState("ACADEMY_NOT_FOUND");
              setError(null);
              setLoading(false);
              return;
            }

            const academyData = mapCanonicalSnapshot<AcademyDocument>(academySnapshot);
            const nextSettings = {
              ...defaultSettings,
              ...academySnapshot.data(),
            };

            setAuthorizedScopeKey(scopeKey);
            setAcademyId(activeAcademyId);
            setAcademy(academyData);
            setMembership(membershipData as Membership);
            setTenantRole(membershipData.role);
            setSettings(nextSettings);
            setAccessState("ACTIVE_MEMBERSHIP");
            setError(null);
            setLoading(false);
          },
          (academySnapshotError) => {
            if (cancelled || currentVersion !== resolutionVersion) return;
            clearTenantAccess();
            setError(normalizeError(academySnapshotError));
            setAccessState(
              permissionDenied(academySnapshotError)
                ? "PERMISSION_DENIED"
                : "ERROR",
            );
            setLoading(false);
          },
        );
      },
      (membershipSnapshotError) => {
        ++resolutionVersion;
        stopAcademyListener();
        if (cancelled) return;
        clearTenantAccess();
        setError(normalizeError(membershipSnapshotError));
        setAccessState(
          permissionDenied(membershipSnapshotError)
            ? "PERMISSION_DENIED"
            : "ERROR",
        );
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
      ++resolutionVersion;
      unsubscribeMembership?.();
      stopAcademyListener();
    };
  }, [
    currentUser,
    requestedAcademyId,
    requestedScopeKey,
    requestedUid,
    isSuperAdminActor,
    supportAcademyId,
    supportSession,
  ]);

  const isSuperAdminWorkspaceActive = Boolean(
    isSuperAdminActor &&
      supportAcademyId &&
      authorizedScopeKey === JSON.stringify(["SUPERADMIN", supportAcademyId]) &&
      academyId === supportAcademyId &&
      accessState === "SUPERADMIN_WORKSPACE",
  );

  const hasAuthorizedTenantContext = Boolean(
    isSuperAdminWorkspaceActive ||
      (!isSuperAdminActor &&
        requestedScopeKey &&
        authorizedScopeKey === requestedScopeKey &&
        academyId === requestedAcademyId &&
        isExactActiveMembership(
          membership,
          requestedUid,
          requestedUid,
          requestedAcademyId,
        )),
  );

  const effectiveAccessState: AcademyAccessState =
    accessState === "SUPERADMIN_WORKSPACE" && !isSuperAdminWorkspaceActive
      ? "LOADING"
      : accessState === "ACTIVE_MEMBERSHIP" && !hasAuthorizedTenantContext
        ? requestedScopeKey
          ? "LOADING"
          : requestedAcademyId === null
            ? "NO_ACADEMY"
            : "ERROR"
        : accessState;

  const updateSettings = async (newSettings: Partial<AcademySettings>) => {
    if (!hasAuthorizedTenantContext || !academyId) {
      throw new Error("An ACTIVE Membership or SuperAdmin Workspace is required.");
    }
    const isSupportActive = Boolean(isSuperAdminActor && supportAcademyId);
    if (
      !canUpdateAcademySettings(
        isSupportActive,
        supportContext.presentationRole,
        membership?.role,
      )
    ) {
      throw new Error(
        "Permission denied: tenant settings update is not permitted for your current role.",
      );
    }
    await setDoc(
      doc(db, "academies", academyId),
      {
        ...withoutCanonicalDocumentId(newSettings),
        id: deleteField(),
      },
      { merge: true },
    );
  };

  const getAcademyCollection = (collectionName: string) => {
    if (!hasAuthorizedTenantContext || !academyId) {
      throw new Error(`Cannot access ${collectionName} without an ACTIVE Membership or SuperAdmin Workspace.`);
    }
    return collection(db, "academies", academyId, collectionName);
  };

  return (
    <AcademyContext.Provider
      value={{
        settings: hasAuthorizedTenantContext ? settings : defaultSettings,
        updateSettings,
        loading: effectiveAccessState === "LOADING" ? true : loading,
        academyId: hasAuthorizedTenantContext ? academyId : null,
        academy: hasAuthorizedTenantContext ? academy : null,
        membership: hasAuthorizedTenantContext ? membership : null,
        tenantRole: hasAuthorizedTenantContext ? tenantRole : null,
        accessState: effectiveAccessState,
        error,
        getAcademyCollection,
      }}
    >
      {children}
    </AcademyContext.Provider>
  );
}

export function useAcademy() {
  const context = useContext(AcademyContext);
  if (context === undefined) {
    throw new Error("useAcademy must be used within an AcademyProvider");
  }
  return context;
}
