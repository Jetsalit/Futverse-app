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
import {
  classifyStaffMembership,
  isStaffTenantRole,
} from "./academyAccessModel";

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
  | "NON_STAFF_ACCESS"
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
    let membershipResolutionVersion = 0;

    const clearTenantAccess = () => {
      setAcademyId(null);
      setAcademy(null);
      setMembership(null);
      setTenantRole(null);
      setSettings(defaultSettings);
      setIsLegacyCompatibility(false);
    };

    const clearResolvedAcademy = () => {
      setAcademyId(null);
      setAcademy(null);
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

    const effectiveRole = currentUser.role;
    if (!isStaffTenantRole(effectiveRole)) {
      clearTenantAccess();
      setError(null);
      setAccessState("NON_STAFF_ACCESS");
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
      setError(new Error("Authenticated staff UID is missing."));
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

    unsubscribeMembership = onSnapshot(
      doc(db, "academies", exactAcademyId, "members", uid),
      async (membershipSnapshot) => {
        const resolutionVersion = ++membershipResolutionVersion;
        if (cancelled) return;

        const membershipData = membershipSnapshot.exists()
          ? membershipSnapshot.data() as Membership
          : null;
        setMembership(membershipData);
        clearResolvedAcademy();

        const membershipState = classifyStaffMembership(
          uid,
          exactAcademyId,
          effectiveRole,
          membershipData,
        );
        const inactiveStates: Record<string, AcademyAccessState> = {
          MISSING: "MEMBERSHIP_MISSING",
          PENDING: "MEMBERSHIP_PENDING",
          SUSPENDED: "MEMBERSHIP_SUSPENDED",
          LEFT: "MEMBERSHIP_LEFT",
          REVOKED: "MEMBERSHIP_REVOKED",
        };

        if (membershipState !== "ACTIVE") {
          setAccessState(inactiveStates[membershipState] || "ERROR");
          setError(
            inactiveStates[membershipState]
              ? null
              : new Error("Membership identity or role does not match the staff account."),
          );
          setLoading(false);
          return;
        }

        try {
          const academySnapshot = await getDoc(doc(db, "academies", exactAcademyId));
          if (cancelled || resolutionVersion !== membershipResolutionVersion) return;
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
          setAcademy(academyData);
          setAcademyId(exactAcademyId);
          setSettings(nextSettings);
          setActiveSeason(nextSettings.currentSeason || "2026");
          setTenantRole(membershipData!.role);
          setIsLegacyCompatibility(Boolean(legacyAcademyId));
          setAccessState(legacyAcademyId ? "LEGACY_COMPATIBILITY" : "ACTIVE_MEMBERSHIP");
          setError(null);
          setLoading(false);
        } catch (resolutionError) {
          if (cancelled || resolutionVersion !== membershipResolutionVersion) return;
          clearResolvedAcademy();
          setError(normalizeError(resolutionError));
          setAccessState(permissionDenied(resolutionError) ? "PERMISSION_DENIED" : "ERROR");
          setLoading(false);
        }
      },
      (snapshotError) => {
        if (cancelled) return;
        ++membershipResolutionVersion;
        clearTenantAccess();
        setError(normalizeError(snapshotError));
        setAccessState(permissionDenied(snapshotError) ? "PERMISSION_DENIED" : "ERROR");
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
      ++membershipResolutionVersion;
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
      throw new Error("An ACTIVE staff Membership is required.");
    }
    await setDoc(doc(db, "academies", academyId), newSettings, { merge: true });
  };

  const getAcademyCollection = (collectionName: string) => {
    if (!academyId || (accessState !== "ACTIVE_MEMBERSHIP" && accessState !== "LEGACY_COMPATIBILITY")) {
      throw new Error(`Cannot access ${collectionName} without an ACTIVE staff Membership.`);
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
