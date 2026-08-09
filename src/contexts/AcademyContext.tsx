import React, { createContext, useContext, useEffect, useState } from "react";
import { FirebaseError } from "firebase/app";
import {
  collection,
  CollectionReference,
  doc,
  DocumentData,
  getDoc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Membership, TenantRole } from "../types/Membership";
import { useAuth } from "./AuthContext";

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
  | "LEGACY_COMPATIBILITY"
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
  isLegacyCompatibility: boolean;
  error: Error | null;
  getAcademyCollection: (collectionName: string) => CollectionReference<DocumentData>;
}

const defaultSettings: AcademySettings = {
  name: "Buriram United Academy",
  shortName: "Buriram U.",
  logoUrl: null,
  squads: ["U11", "U13", "U15", "PRO"],
};

const AcademyContext = createContext<AcademyContextType | undefined>(undefined);

const permissionDenied = (error: unknown) =>
  error instanceof FirebaseError && error.code === "permission-denied";

const normalizeError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

export function AcademyProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState<AcademySettings>(defaultSettings);
  const [academyId, setAcademyId] = useState<string | null>(null);
  const [academy, setAcademy] = useState<AcademyDocument | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [tenantRole, setTenantRole] = useState<TenantRole | null>(null);
  const [accessState, setAccessState] = useState<AcademyAccessState>("LOADING");
  const [isLegacyCompatibility, setIsLegacyCompatibility] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribeMembership: (() => void) | undefined;
    let resolutionVersion = 0;

    const clearTenantAccess = () => {
      setAcademyId(null);
      setAcademy(null);
      setMembership(null);
      setTenantRole(null);
      setSettings(defaultSettings);
      setIsLegacyCompatibility(false);
    };

    if (!currentUser) {
      clearTenantAccess();
      setError(null);
      setAccessState("NO_ACADEMY");
      setLoading(false);
      return;
    }

    const uid = currentUser.uid || currentUser.id;
    const activeAcademyId = currentUser.activeAcademyId || null;
    const legacyAcademyId = activeAcademyId ? null : currentUser.academyId || null;
    const exactAcademyId = activeAcademyId || legacyAcademyId;

    clearTenantAccess();
    setError(null);

    if (!uid) {
      setAccessState("ERROR");
      setError(new Error("Authenticated UID is missing."));
      setLoading(false);
      return;
    }

    if (!exactAcademyId) {
      setAccessState("NO_ACADEMY");
      setLoading(false);
      return;
    }

    setAccessState("LOADING");
    setLoading(true);

    const resolveAcademy = async () => {
      const currentVersion = ++resolutionVersion;

      // 2. Read academies/{exactAcademyId} FIRST
      try {
        const academySnapshot = await getDoc(doc(db, "academies", exactAcademyId));
        if (cancelled || currentVersion !== resolutionVersion) return;

        // 3. If Academy missing -> ACADEMY_NOT_FOUND
        if (!academySnapshot.exists()) {
          setAccessState("ACADEMY_NOT_FOUND");
          setError(null);
          setLoading(false);
          return;
        }

        const academyData = {
          id: academySnapshot.id,
          ...academySnapshot.data(),
        } as AcademyDocument;
        const nextSettings = { ...defaultSettings, ...academySnapshot.data() };

        // 4. If using legacy academyId: DO NOT query Membership, resolve LEGACY_COMPATIBILITY
        if (legacyAcademyId) {
          const legacyRole =
            currentUser.tenantRole ||
            (currentUser.role === "ADMIN" || currentUser.role === "COACH"
              ? currentUser.role
              : null);
          setAcademy(academyData);
          setAcademyId(exactAcademyId);
          setSettings(nextSettings);
          setMembership(null);
          setTenantRole(legacyRole);
          setIsLegacyCompatibility(true);
          setAccessState("LEGACY_COMPATIBILITY");
          setError(null);
          setLoading(false);
          return;
        }

        // 5. If using activeAcademyId: subscribe academies/{activeAcademyId}/members/{uid}
        if (activeAcademyId) {
          unsubscribeMembership = onSnapshot(
            doc(db, "academies", activeAcademyId, "members", uid),
            (membershipSnapshot) => {
              if (cancelled || currentVersion !== resolutionVersion) return;

              if (!membershipSnapshot.exists()) {
                setAccessState("MEMBERSHIP_MISSING");
                setError(new Error("Membership not found."));
                setLoading(false);
                return;
              }

              const membershipData = membershipSnapshot.data() as Membership;
              setMembership(membershipData);

              // 6. Validate membership fields
              const isValidMembership =
                membershipData.userId === uid &&
                membershipData.academyId === activeAcademyId &&
                (membershipData.role === "ADMIN" || membershipData.role === "COACH");

              if (!isValidMembership) {
                setAccessState("ERROR");
                setError(new Error("Membership data is invalid or unauthorized role."));
                setLoading(false);
                return;
              }

              // 7. Map inactive Membership statuses fail-closed
              if (membershipData.status !== "ACTIVE") {
                const inactiveStates: Record<string, AcademyAccessState> = {
                  PENDING: "MEMBERSHIP_PENDING",
                  SUSPENDED: "MEMBERSHIP_SUSPENDED",
                  LEFT: "MEMBERSHIP_LEFT",
                  REVOKED: "MEMBERSHIP_REVOKED",
                };

                setAccessState(inactiveStates[membershipData.status] || "ERROR");
                setError(
                  inactiveStates[membershipData.status]
                    ? null
                    : new Error("Membership status is invalid.")
                );
                setLoading(false);
                return;
              }

              // Active Membership valid
              setAcademy(academyData);
              setAcademyId(exactAcademyId);
              setSettings(nextSettings);
              setTenantRole(membershipData.role);
              setIsLegacyCompatibility(false);
              setAccessState("ACTIVE_MEMBERSHIP");
              setError(null);
              setLoading(false);
            },
            (snapshotError) => {
              if (cancelled || currentVersion !== resolutionVersion) return;
              clearTenantAccess();
              setError(normalizeError(snapshotError));
              setAccessState(
                permissionDenied(snapshotError) ? "PERMISSION_DENIED" : "ERROR"
              );
              setLoading(false);
            }
          );
        }
      } catch (resolutionError) {
        if (cancelled || currentVersion !== resolutionVersion) return;
        clearTenantAccess();
        setError(normalizeError(resolutionError));
        setAccessState(
          permissionDenied(resolutionError) ? "PERMISSION_DENIED" : "ERROR"
        );
        setLoading(false);
      }
    };

    resolveAcademy();

    return () => {
      cancelled = true;
      ++resolutionVersion;
      unsubscribeMembership?.();
    };
  }, [
    currentUser?.uid,
    currentUser?.id,
    currentUser?.activeAcademyId,
    currentUser?.academyId,
    currentUser?.tenantRole,
    currentUser?.role,
  ]);

  const updateSettings = async (newSettings: Partial<AcademySettings>) => {
    if (
      !academyId ||
      (accessState !== "ACTIVE_MEMBERSHIP" && accessState !== "LEGACY_COMPATIBILITY")
    ) {
      throw new Error("An ACTIVE Membership is required.");
    }
    await setDoc(doc(db, "academies", academyId), newSettings, { merge: true });
  };

  const getAcademyCollection = (collectionName: string) => {
    if (
      !academyId ||
      (accessState !== "ACTIVE_MEMBERSHIP" && accessState !== "LEGACY_COMPATIBILITY")
    ) {
      throw new Error(`Cannot access ${collectionName} without an ACTIVE Membership.`);
    }
    return collection(db, "academies", academyId, collectionName);
  };

  return (
    <AcademyContext.Provider
      value={{
        settings,
        updateSettings,
        loading,
        academyId,
        academy,
        membership,
        tenantRole,
        accessState,
        isLegacyCompatibility,
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
