import { collection, doc, onSnapshot, updateDoc, getFirestore } from "firebase/firestore";
import { db } from "../firebase";

export const subscribeToUsers = (callback: (users: any[]) => void) => {
  // Mock data
  callback([
    { id: "1", name: "Super Admin", role: "SUPERADMIN" },
    { id: "2", name: "Coach John", role: "COACH" }
  ]);
  return () => {}; // mock unsubscribe
};

export const updateUserStatus = async (userId: string, status: string, additionalData?: any) => {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    status,
    ...additionalData
  });
};
