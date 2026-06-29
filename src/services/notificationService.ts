import { db } from "../lib/firebase";
import { collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where } from "firebase/firestore";

const COLLECTION_NAME = "notifications";

export const notificationService = {
  getNotificationsByUserId: async (userId: string) => {
    const q = query(collection(db, COLLECTION_NAME), where("userId", "==", userId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },
  
  createNotification: async (data: any) => {
    return await addDoc(collection(db, COLLECTION_NAME), data);
  },
  
  markAsRead: async (id: string) => {
    const docRef = doc(db, COLLECTION_NAME, id);
    return await updateDoc(docRef, { isRead: true });
  },
  
  deleteNotification: async (id: string) => {
    const docRef = doc(db, COLLECTION_NAME, id);
    return await deleteDoc(docRef);
  }
};
