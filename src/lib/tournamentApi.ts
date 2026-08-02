import { db } from "./firebase";
import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, setDoc, query, orderBy, serverTimestamp } from "firebase/firestore";
import { Tournament, TournamentSquad } from "../types/Tournament";

const getTournamentsCollection = (academyId: string) => collection(db, "academies", academyId, "tournaments");
const getTournamentSquadsCollection = (academyId: string) => collection(db, "academies", academyId, "tournament_squads");

export const getTournaments = async (academyId: string): Promise<Tournament[]> => {
  const tournamentsRef = getTournamentsCollection(academyId);
  const q = query(tournamentsRef);
  const snapshot = await getDocs(q);
  
  const tournaments = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Tournament));

  return tournaments.sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return bTime - aTime;
  });
};

export const addTournament = async (academyId: string, data: Omit<Tournament, "id" | "createdAt" | "updatedAt">): Promise<string> => {
  const tournamentsRef = getTournamentsCollection(academyId);
  const docRef = await addDoc(tournamentsRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return docRef.id;
};

export const updateTournament = async (academyId: string, tournamentId: string, data: Partial<Tournament>): Promise<void> => {
  const docRef = doc(db, "academies", academyId, "tournaments", tournamentId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp()
  });
};

export const deleteTournament = async (academyId: string, tournamentId: string): Promise<void> => {
  const docRef = doc(db, "academies", academyId, "tournaments", tournamentId);
  await deleteDoc(docRef);
};

export const getTournamentSquad = async (academyId: string, tournamentId: string): Promise<TournamentSquad | null> => {
  const docRef = doc(db, "academies", academyId, "tournament_squads", tournamentId);
  const snapshot = await getDoc(docRef);
  
  if (snapshot.exists()) {
    return {
      id: snapshot.id,
      ...snapshot.data()
    } as TournamentSquad;
  }
  return null;
};

export const updateTournamentSquad = async (academyId: string, tournamentId: string, playerIds: string[]): Promise<void> => {
  const docRef = doc(db, "academies", academyId, "tournament_squads", tournamentId);
  await setDoc(docRef, {
    tournamentId,
    playerIds,
    updatedAt: serverTimestamp()
  }, { merge: true });
};
