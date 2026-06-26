import React, { createContext, useContext, useState, useEffect } from "react";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

export interface AcademySettings {
  name: string;
  shortName: string;
  logoUrl: string | null;
  squads: string[];
}

interface AcademyContextType {
  settings: AcademySettings;
  updateSettings: (newSettings: Partial<AcademySettings>) => Promise<void>;
  loading: boolean;
}

const defaultSettings: AcademySettings = {
  name: "Buriram United Academy",
  shortName: "Buriram U.",
  logoUrl: null,
  squads: ["U11", "U13", "U15", "PRO"],
};

const AcademyContext = createContext<AcademyContextType | undefined>(undefined);

export function AcademyProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AcademySettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const docRef = doc(db, "settings", "general");
    
    // Listen for real-time updates
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Partial<AcademySettings>;
        setSettings((prev) => ({ ...prev, ...data }));
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching academy settings:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const updateSettings = async (newSettings: Partial<AcademySettings>) => {
    try {
      const docRef = doc(db, "settings", "general");
      await setDoc(docRef, newSettings, { merge: true });
    } catch (error) {
      console.error("Error updating academy settings:", error);
      throw error;
    }
  };

  return (
    <AcademyContext.Provider value={{ settings, updateSettings, loading }}>
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
