import { db } from "../lib/firebase";
import { collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, onSnapshot } from "firebase/firestore";

const COLLECTION_NAME = "players";

export const playerService = {
  getPlayers: async () => {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },
  
  getPlayerById: async (id: string) => {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  },
  
  createPlayer: async (data: any) => {
    return await addDoc(collection(db, COLLECTION_NAME), data);
  },
  
  updatePlayer: async (id: string, data: any) => {
    const docRef = doc(db, COLLECTION_NAME, id);
    return await updateDoc(docRef, data);
  },
  
  deletePlayer: async (id: string) => {
    const docRef = doc(db, COLLECTION_NAME, id);
    return await deleteDoc(docRef);
  },
};
