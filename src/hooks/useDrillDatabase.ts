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
  const { currentUser } = useAuth();
  const currentUserId = currentUser?.id || 'unknown_user';

  useEffect(() => {
    const q = query(collection(db, 'drills'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedDrills = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Drill[];
      setDrills(loadedDrills);
    });

    return () => unsubscribe();
  }, []);

  const saveDrill = async (newDrill: Omit<Drill, 'id' | 'created_by'>) => {
    try {
      const drillData = {
        ...newDrill,
        created_by: currentUserId,
      };
      await addDoc(collection(db, 'drills'), drillData);
    } catch (e) {
      console.error("Error saving drill: ", e);
    }
  };

  const updateDrill = async (id: string, updates: Partial<Drill>) => {
    try {
      const docRef = doc(db, 'drills', id);
      await updateDoc(docRef, updates);
    } catch (e) {
      console.error("Error updating drill: ", e);
    }
  };

  const deleteDrill = async (id: string) => {
    try {
      const docRef = doc(db, 'drills', id);
      await deleteDoc(docRef);
    } catch (e) {
      console.error("Error deleting drill: ", e);
    }
  };

  const myDrills = drills.filter(d => d.created_by === currentUserId);
  const academyDrills = drills.filter(d => d.is_shared === true);

  return { drills, myDrills, academyDrills, saveDrill, updateDrill, deleteDrill, currentUser: currentUserId };
}
