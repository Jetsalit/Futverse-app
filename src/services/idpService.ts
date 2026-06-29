import { db } from "../lib/firebase";
import { collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where } from "firebase/firestore";

const COLLECTION_NAME = "idps";

export const idpService = {
  getIdps: async () => {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },
  
  getIdpById: async (id: string) => {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  },
  
  getIdpsByPlayerId: async (playerId: string) => {
    const q = query(collection(db, COLLECTION_NAME), where("playerId", "==", playerId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },
  
  createIdp: async (data: any) => {
    return await addDoc(collection(db, COLLECTION_NAME), data);
  },
  
  updateIdp: async (id: string, data: any) => {
    const docRef = doc(db, COLLECTION_NAME, id);
    return await updateDoc(docRef, data);
  },
  
  deleteIdp: async (id: string) => {
    const docRef = doc(db, COLLECTION_NAME, id);
    return await deleteDoc(docRef);
  }
};
