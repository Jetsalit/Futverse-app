import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, addDoc, updateDoc, deleteDoc, deleteField, doc, onSnapshot, query } from 'firebase/firestore';
import { withoutCanonicalDocumentId } from '../lib/firestore/canonicalDocument';
import { resolveAssistedRecordIdentity } from '../lib/assistedRecordIdentity';
import { normalizeDrillRecord } from '../lib/drillDataModel';
import type { Drill } from '../lib/drillDataModel';

export type { Drill } from '../lib/drillDataModel';

export function useDrillDatabase() {
  const [drills, setDrills] = useState<Drill[]>([]);
  const { actualUser, currentUser } = useAuth();
  const identity = resolveAssistedRecordIdentity(actualUser, currentUser);
  const authenticatedUid = identity.actorUid;
  const ownerUid = identity.ownerUid;

  useEffect(() => {
    const q = query(collection(db, 'drills'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const drillsData: Drill[] = [];
      snapshot.forEach((doc) => {
        drillsData.push(normalizeDrillRecord(doc.id, doc.data()));
      });
      setDrills(drillsData);
    });
    return () => unsubscribe();
  }, []);

  const saveDrill = async (
    newDrill: Omit<Drill, 'id' | 'created_by'>,
  ): Promise<boolean> => {
    if (!authenticatedUid || !ownerUid) {
      console.error('Cannot save drill without authenticated actor and owner UID');
      return false;
    }

    try {
      const drillData = {
        ...withoutCanonicalDocumentId(newDrill),
        created_by: ownerUid,
        createdAt: new Date().toISOString(),
        ...(identity.isAssisted
          ? {
              recorded_by: authenticatedUid,
              entry_mode: 'ASSISTED' as const,
            }
          : {}),
      };
      await addDoc(collection(db, 'drills'), drillData);
      return true;
    } catch (e) {
      console.error("Error saving drill: ", e);
      return false;
    }
  };

  const updateDrill = async (
    id: string,
    updates: Partial<Drill>,
  ): Promise<boolean> => {
    if (!authenticatedUid || !ownerUid) {
      console.error('Cannot update drill without authenticated actor and owner UID');
      return false;
    }

    const target = drills.find((drill) => drill.id === id);
    if (!target || target.created_by !== ownerUid) {
      console.error('Cannot update drill outside the presented owner scope.');
      return false;
    }

    try {
      if (Object.prototype.hasOwnProperty.call(updates, 'created_by')) {
        console.error('Drill ownership is immutable on client update.');
        return false;
      }

      const safeUpdates = withoutCanonicalDocumentId(updates) as Partial<Drill>;
      delete safeUpdates.created_by;
      delete safeUpdates.recorded_by;
      delete safeUpdates.entry_mode;
      delete safeUpdates.last_updated_by;

      const docRef = doc(db, 'drills', id);
      await updateDoc(docRef, {
        ...safeUpdates,
        ...(identity.isAssisted ? { last_updated_by: authenticatedUid } : {}),
        id: deleteField(),
      });
      return true;
    } catch (e) {
      console.error("Error updating drill: ", e);
      return false;
    }
  };

  const deleteDrill = async (id: string) => {
    if (!authenticatedUid || !ownerUid) {
      console.error('Cannot delete drill without authenticated actor and owner UID');
      return;
    }

    const target = drills.find((drill) => drill.id === id);
    if (!target || target.created_by !== ownerUid) {
      console.error('Cannot delete drill outside the presented owner scope.');
      return;
    }

    try {
      const docRef = doc(db, 'drills', id);
      await deleteDoc(docRef);
    } catch (e) {
      console.error("Error deleting drill: ", e);
    }
  };

  const myDrills = drills.filter(d => d.created_by === ownerUid);
  const academyDrills = drills.filter(d => d.is_shared === true);

  return {
    drills,
    myDrills,
    academyDrills,
    saveDrill,
    updateDrill,
    deleteDrill,
    currentUser: ownerUid,
    authenticatedActor: authenticatedUid,
    isAssisted: identity.isAssisted,
  };
}
