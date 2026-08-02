import { db } from "./firebase";
import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, query, orderBy, serverTimestamp } from "firebase/firestore";
import { Match } from "../types/Match";

const getMatchesCollection = (academyId: string) => collection(db, "academies", academyId, "matches");

export const getMatches = async (academyId: string): Promise<Match[]> => {
  const matchesRef = getMatchesCollection(academyId);
  const q = query(matchesRef); // Removed orderBy to prevent potential index errors
  const snapshot = await getDocs(q);
  
  const matches = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Match));

  // Sort in memory (descending by date)
  return matches.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const addMatch = async (academyId: string, matchData: Omit<Match, "id" | "createdAt" | "updatedAt">): Promise<string> => {
  const matchesRef = getMatchesCollection(academyId);
  const docRef = await addDoc(matchesRef, {
    ...matchData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
};

export const updateMatch = async (academyId: string, matchId: string, matchData: Partial<Match>): Promise<void> => {
  const matchRef = doc(db, "academies", academyId, "matches", matchId);
  await updateDoc(matchRef, {
    ...matchData,
    updatedAt: serverTimestamp(),
  });
};

export const deleteMatch = async (academyId: string, matchId: string): Promise<void> => {
  const matchRef = doc(db, "academies", academyId, "matches", matchId);
  await deleteDoc(matchRef);
};
