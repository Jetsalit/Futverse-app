import { collection, doc, onSnapshot, updateDoc, getFirestore } from "firebase/firestore";
import { db } from "../firebase";

export const subscribeToUsers = (callback: (users: any[]) => void) => {
  return onSnapshot(collection(db, "users"), (snapshot) => {
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(users);
  });
};

export const updateUserStatus = async (userId: string, status: string, additionalData?: any) => {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    status,
    ...additionalData
  });
};
