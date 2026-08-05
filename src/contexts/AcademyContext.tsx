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

export interface CustomMetric {
  id: string;
  name: string;
  target: string;
}

export interface FitnessMetric {
  key: string;
  label: string;
  unit: string;
  max: number;
  readonly?: boolean;
  invert?: boolean;
}

export interface AcademySettings {
  name: string;
  shortName: string;
  logoUrl: string | null;
  squads: string[];
  inviteCode?: string;
  performanceMetrics?: CustomMetric[];
  fitnessMetrics?: FitnessMetric[];
  seasons?: string[];
  currentSeason?: string;
  licenseLevel?: "Gold" | "Silver" | "Bronze" | "None";
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
  activeSeason: string;
  setActiveSeason: (season: string) => void;
}

const defaultSettings: AcademySettings = {
  name: "My Academy",
  shortName: "Academy",
  logoUrl: null,
  squads: ["U11", "U13", "U15", "PRO"],
  performanceMetrics: [
    { id: "passAccuracy", name: "Passing (%)", target: "80" },
    { id: "shotsOnTarget", name: "Shots on Target", target: "1" },
    { id: "duelsWon", name: "Duels Won (%)", target: "50" },
  ],
  fitnessMetrics: [
    { key: "beep_level", label: "Beep Test", unit: "Level", max: 20 },
    { key: "calculated_vo2max", label: "VO2 Max (Auto)", unit: "ml/kg/min", max: 80, readonly: true },
    { key: "speed_10m", label: "10m Sprint", unit: "Sec", max: 3, invert: true },
    { key: "speed_30m", label: "30m Sprint", unit: "Sec", max: 6, invert: true },
    { key: "vertical_jump", label: "Vertical Jump", unit: "cm", max: 80 },
  ],
  seasons: ["2026"],
  currentSeason: "2026",
  licenseLevel: "None",
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
  const [activeSeason, setActiveSeason] = useState<string>("2026");

  useEffect(() => {
    let cancelled = false;
    let unsubscribeMembership: (() => void) | undefined;

    const clearTenantAccess = () => {
      setAcademyId(null);
      setMembership(null);
      setTenantRole(null);
      setSettings(defaultSettings);
      setIsLegacyCompatibility(false);
    };

    if (!currentUser) {
      clearTenantAccess();
      setAcademy(null);
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
    setAcademy(null);
    setError(null);

    if (!exactAcademyId) {
      setAccessState("NO_ACADEMY");
      setLoading(false);
      return;
    }

    setAccessState("LOADING");
    setLoading(true);

    const resolveAcademy = async () => {
      try {
        const academySnapshot = await getDoc(doc(db, "academies", exactAcademyId));
        if (cancelled) return;

        if (!academySnapshot.exists()) {
          setAccessState("ACADEMY_NOT_FOUND");
          setLoading(false);
          return;
        }

        const academyData = {
          id: academySnapshot.id,
          ...academySnapshot.data(),
        } as AcademyDocument;
        setAcademy(academyData);

        if (legacyAcademyId) {
          const legacyRole = currentUser.tenantRole ||
            (currentUser.role === "ADMIN" || currentUser.role === "COACH"
              ? currentUser.role
              : null);
          const nextSettings = { ...defaultSettings, ...academySnapshot.data() };
          setAcademyId(legacyAcademyId);
          setSettings(nextSettings);
          setActiveSeason(nextSettings.currentSeason || "2026");
          setTenantRole(legacyRole);
          setIsLegacyCompatibility(true);
          setAccessState("LEGACY_COMPATIBILITY");
          setLoading(false);
          return;
        }

        if (!uid) {
          throw new Error("Authenticated user UID is missing.");
        }

        unsubscribeMembership = onSnapshot(
          doc(db, "academies", activeAcademyId!, "members", uid),
          (membershipSnapshot) => {
            if (cancelled) return;
            if (!membershipSnapshot.exists()) {
              clearTenantAccess();
              setAcademy(academyData);
              setAccessState("MEMBERSHIP_MISSING");
              setLoading(false);
              return;
            }

            const membershipData = membershipSnapshot.data() as Membership;
            setMembership(membershipData);
            setAcademyId(null);
            setTenantRole(null);
            setIsLegacyCompatibility(false);
            setSettings(defaultSettings);

            const inactiveStates: Record<string, AcademyAccessState> = {
              PENDING: "MEMBERSHIP_PENDING",
              SUSPENDED: "MEMBERSHIP_SUSPENDED",
              LEFT: "MEMBERSHIP_LEFT",
              REVOKED: "MEMBERSHIP_REVOKED",
            };

            if (membershipData.userId !== uid || membershipData.academyId !== activeAcademyId) {
              setAccessState("ERROR");
              setError(new Error("Membership identity does not match the active Academy pointer."));
              setLoading(false);
              return;
            }

            if (membershipData.status !== "ACTIVE") {
              setAccessState(inactiveStates[membershipData.status] || "ERROR");
              setError(
                inactiveStates[membershipData.status]
                  ? null
                  : new Error("Unknown Membership status."),
              );
              setLoading(false);
              return;
            }
            if (membershipData.role !== "ADMIN" && membershipData.role !== "COACH") {
              setAccessState("ERROR");
              setError(new Error("Membership has an invalid tenant role."));
              setLoading(false);
              return;
            }

            const nextSettings = { ...defaultSettings, ...academySnapshot.data() };
            setAcademyId(activeAcademyId);
            setSettings(nextSettings);
            setActiveSeason(nextSettings.currentSeason || "2026");
            setTenantRole(membershipData.role);
            setAccessState("ACTIVE_MEMBERSHIP");
            setError(null);
            setLoading(false);
          },
          (snapshotError) => {
            if (cancelled) return;
            clearTenantAccess();
            setAcademy(academyData);
            setError(normalizeError(snapshotError));
            setAccessState(permissionDenied(snapshotError) ? "PERMISSION_DENIED" : "ERROR");
            setLoading(false);
          },
        );
      } catch (resolutionError) {
        if (cancelled) return;
        clearTenantAccess();
        setAcademy(null);
        setError(normalizeError(resolutionError));
        setAccessState(permissionDenied(resolutionError) ? "PERMISSION_DENIED" : "ERROR");
        setLoading(false);
      }
    };

    void resolveAcademy();
    return () => {
      cancelled = true;
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
    if (!academyId || (accessState !== "ACTIVE_MEMBERSHIP" && accessState !== "LEGACY_COMPATIBILITY")) {
      throw new Error("Active or legacy-compatible Academy access is required.");
    }
    await setDoc(doc(db, "academies", academyId), newSettings, { merge: true });
  };

  const getAcademyCollection = (collectionName: string) => {
    if (!academyId || (accessState !== "ACTIVE_MEMBERSHIP" && accessState !== "LEGACY_COMPATIBILITY")) {
      throw new Error(`Cannot access ${collectionName} without resolved Academy access.`);
    }
    return collection(db, "academies", academyId, collectionName);
  };

  return (
    <AcademyContext.Provider value={{
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
      activeSeason,
      setActiveSeason,
    }}>
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
