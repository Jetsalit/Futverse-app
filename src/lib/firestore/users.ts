import { collection, doc, onSnapshot, updateDoc, getFirestore } from "firebase/firestore";
import { db } from "../firebase";

export const subscribeToUsers = (callback: (users: any[]) => void) => {
  const usersRef = collection(db, "users");
  const unsubscribe = onSnapshot(usersRef, (snapshot) => {
    const usersList = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(usersList);
  });
  return unsubscribe;
};

export const updateUserStatus = async (userId: string, status: string, additionalData?: any) => {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    status,
    ...additionalData
  });
};
