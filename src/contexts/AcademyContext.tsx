import React, { createContext, useContext, useState, useEffect } from "react";
import { doc, setDoc, onSnapshot, collection, CollectionReference, DocumentData } from "firebase/firestore";
import { db } from "../lib/firebase";
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

interface AcademyContextType {
  settings: AcademySettings;
  updateSettings: (newSettings: Partial<AcademySettings>) => Promise<void>;
  loading: boolean;
  academyId: string | null;
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

export function AcademyProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState<AcademySettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [activeSeason, setActiveSeason] = useState<string>("2026");

  // If the user doesn't have an academyId, we use a fallback or wait.
  // In a real multi-tenant app, a user must have an academyId to fetch data.
  const academyId = currentUser?.role === "SUPERADMIN" 
    ? "superadmin_system" 
    : (currentUser?.academyId || currentUser?.id || "default_academy");

  useEffect(() => {
    if (!currentUser) return; // Wait until auth is resolved

    const fetchAcademyData = async () => {
      const docRef = doc(db, "academies", academyId);
      
      const unsubscribe = onSnapshot(docRef, async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as Partial<AcademySettings>;
          const newSettings = { ...defaultSettings, ...data };
          setSettings(newSettings);
          if (newSettings.currentSeason && !data.currentSeason) {
             setActiveSeason(newSettings.currentSeason);
          } else if (data.currentSeason) {
             setActiveSeason(data.currentSeason);
          }
        } else {
          // Fallback: If academyId was saved as a raw name (e.g. "talumball"), try to find it by name
          try {
            const { query, where, getDocs, collection } = await import("firebase/firestore");
            const q = query(collection(db, "academies"), where("name", "==", academyId));
            const nameSnap = await getDocs(q);
            if (!nameSnap.empty) {
              const data = nameSnap.docs[0].data() as Partial<AcademySettings>;
              const newSettings = { ...defaultSettings, ...data };
              setSettings(newSettings);
              if (newSettings.currentSeason && !data.currentSeason) {
                 setActiveSeason(newSettings.currentSeason);
              } else if (data.currentSeason) {
                 setActiveSeason(data.currentSeason);
              }
            } else {
              setSettings(defaultSettings);
            }
          } catch (err) {
            console.error("Error fetching fallback academy by name:", err);
            setSettings(defaultSettings);
          }
        }
        setLoading(false);
      }, (error) => {
        console.error("Error fetching settings:", error);
        setLoading(false);
      });

      return () => unsubscribe();
    };

    fetchAcademyData();
  }, [academyId, currentUser]);

  const updateSettings = async (newSettings: Partial<AcademySettings>) => {
    try {
      const docRef = doc(db, "academies", academyId);
      await setDoc(docRef, newSettings, { merge: true });

    } catch (error) {
      console.error("Error updating academy settings:", error);
      throw error;
    }
  };

  const getAcademyCollection = (collectionName: string) => {
    if (academyId === "default_academy") {
       console.warn(`Accessing collection ${collectionName} with default_academy`);
    }
    return collection(db, "academies", academyId, collectionName);
  };

  return (
    <AcademyContext.Provider value={{ settings, updateSettings, loading, academyId, getAcademyCollection, activeSeason, setActiveSeason }}>
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
