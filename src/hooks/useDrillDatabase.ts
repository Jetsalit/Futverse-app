import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query } from 'firebase/firestore';

export interface Drill {
  id: string;
  title: string;
  category: string;
  canvas_data: {
    elements: any[];
    lines: any[];
    fieldType: string;
  };
  created_by: string;
  is_shared: boolean;
  duration?: string;
  description?: string;
  previewImage?: string;
  ageGroup?: string;
  phase?: string;
  trainingMethod?: string;
  coachingPoints?: string;
  date?: string;
}

export function useDrillDatabase() {
  const [drills, setDrills] = useState<Drill[]>([]);
  const { actualUser } = useAuth();
  const authenticatedUid = actualUser?.uid || actualUser?.id || null;

  useEffect(() => {
    const q = query(collection(db, 'drills'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const drillsData: Drill[] = [];
      snapshot.forEach((doc) => {
        drillsData.push({ id: doc.id, ...doc.data() } as Drill);
      });
      setDrills(drillsData);
    });
    return () => unsubscribe();
  }, []);

  const saveDrill = async (newDrill: Omit<Drill, 'id' | 'created_by'>) => {
    if (!authenticatedUid) {
      console.error('Cannot save drill without authenticated UID');
      return;
    }

    try {
      const drillData = {
        ...newDrill,
        created_by: authenticatedUid,
        createdAt: new Date().toISOString(),
      };
      await addDoc(collection(db, 'drills'), drillData);
    } catch (e) {
      console.error("Error saving drill: ", e);
    }
  };

  const updateDrill = async (id: string, updates: Partial<Drill>) => {
    if (!authenticatedUid) {
      console.error('Cannot update drill without authenticated UID');
      return;
    }

    try {
      if (Object.prototype.hasOwnProperty.call(updates, 'created_by')) {
        console.error('Drill ownership is immutable on client update.');
        return;
      }

      const safeUpdates: Partial<Drill> = { ...updates };
      delete safeUpdates.created_by;

      const docRef = doc(db, 'drills', id);
      await updateDoc(docRef, safeUpdates);
    } catch (e) {
      console.error("Error updating drill: ", e);
    }
  };

  const deleteDrill = async (id: string) => {
    if (!authenticatedUid) {
      console.error('Cannot delete drill without authenticated UID');
      return;
    }

    try {
      const docRef = doc(db, 'drills', id);
      await deleteDoc(docRef);
    } catch (e) {
      console.error("Error deleting drill: ", e);
    }
  };

  const myDrills = drills.filter(d => d.created_by === authenticatedUid);
  const academyDrills = drills.filter(d => d.is_shared === true);

  return { drills, myDrills, academyDrills, saveDrill, updateDrill, deleteDrill, currentUser: authenticatedUid };
}
