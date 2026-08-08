import { db } from "../../../lib/firebase";
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  writeBatch
} from "firebase/firestore";
import { 
  ParentObservationMetric, 
  ParentMatchObservation,
  ObservationMetric,
  ObservationTemplate,
  ObservationSession,
  ObservationLiveEvent,
  ObservationReflection,
  ObservationAuditLog,
  ObservationProfile
} from "../types";

// ============================================================================
// LEGACY API (PRESERVED FOR BACKWARD COMPATIBILITY)
// ============================================================================
const METRICS_COLLECTION = "parent_observation_metrics";
const OBSERVATIONS_COLLECTION = "parent_match_observations";

export const getObservationMetrics = async (): Promise<ParentObservationMetric[]> => {
  const q = query(collection(db, METRICS_COLLECTION), orderBy("sortOrder", "asc"));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    const defaultMetrics = [
      { name: "Goal", icon: "svg-goal", category: "Attack", displayType: "Counter", playerPosition: "Field", enabled: true, sortOrder: 0, color: "bg-emerald-50 text-emerald-600 border-emerald-200" },
      { name: "Assist", icon: "svg-assist", category: "Attack", displayType: "Counter", playerPosition: "Field", enabled: true, sortOrder: 1, color: "bg-blue-50 text-blue-600 border-blue-200" },
      { name: "Shot on Target", icon: "⚽", category: "Attack", displayType: "Counter", playerPosition: "Field", enabled: true, sortOrder: 2, color: "bg-indigo-50 text-indigo-600 border-indigo-200" },
      { name: "Good Movement", icon: "🏃", category: "Attack", displayType: "Counter", playerPosition: "Field", enabled: true, sortOrder: 3, color: "bg-sky-50 text-sky-600 border-sky-200" },
      { name: "Dribbling", icon: "⚡", category: "Attack", displayType: "Counter", playerPosition: "Field", enabled: true, sortOrder: 4, color: "bg-purple-50 text-purple-600 border-purple-200" },
      
      { name: "Tackle", icon: "🛡️", category: "Defense", displayType: "Counter", playerPosition: "Field", enabled: true, sortOrder: 5, color: "bg-rose-50 text-rose-600 border-rose-200" },
      { name: "Block", icon: "🛑", category: "Defense", displayType: "Counter", playerPosition: "Both", enabled: true, sortOrder: 6, color: "bg-orange-50 text-orange-600 border-orange-200" },
      { name: "Recovery", icon: "🔄", category: "Defense", displayType: "Counter", playerPosition: "Both", enabled: true, sortOrder: 7, color: "bg-amber-50 text-amber-600 border-amber-200" },
      { name: "Interception", icon: "✂️", category: "Defense", displayType: "Counter", playerPosition: "Both", enabled: true, sortOrder: 8, color: "bg-red-50 text-red-600 border-red-200" },
      
      { name: "Save", icon: "🧤", category: "Goalkeeper", displayType: "Counter", playerPosition: "Goalkeeper", enabled: true, sortOrder: 9, color: "bg-teal-50 text-teal-600 border-teal-200" },
      { name: "Catch", icon: "🤲", category: "Goalkeeper", displayType: "Counter", playerPosition: "Goalkeeper", enabled: true, sortOrder: 10, color: "bg-cyan-50 text-cyan-600 border-cyan-200" },
      { name: "Punch", icon: "🥊", category: "Goalkeeper", displayType: "Counter", playerPosition: "Goalkeeper", enabled: true, sortOrder: 11, color: "bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200" },
      { name: "Distribution", icon: "🎯", category: "Goalkeeper", displayType: "Counter", playerPosition: "Goalkeeper", enabled: true, sortOrder: 12, color: "bg-blue-50 text-blue-600 border-blue-200" },
      { name: "1v1 Save", icon: "🛡️", category: "Goalkeeper", displayType: "Counter", playerPosition: "Goalkeeper", enabled: true, sortOrder: 13, color: "bg-indigo-50 text-indigo-600 border-indigo-200" },
      { name: "Quick Throw", icon: "⚾", category: "Goalkeeper", displayType: "Counter", playerPosition: "Goalkeeper", enabled: true, sortOrder: 14, color: "bg-sky-50 text-sky-600 border-sky-200" },
      
      { name: "Teamwork", icon: "🤝", category: "Behaviour", displayType: "Toggle", playerPosition: "Both", enabled: true, sortOrder: 15, color: "bg-emerald-50 text-emerald-600 border-emerald-200" },
      { name: "Communication", icon: "🗣️", category: "Behaviour", displayType: "Toggle", playerPosition: "Both", enabled: true, sortOrder: 16, color: "bg-blue-50 text-blue-600 border-blue-200" },
      { name: "Leadership", icon: "svg-captain", category: "Behaviour", displayType: "Toggle", playerPosition: "Both", enabled: true, sortOrder: 17, color: "bg-amber-50 text-amber-600 border-amber-200" },
      { name: "Positive Attitude", icon: "⭐", category: "Behaviour", displayType: "Toggle", playerPosition: "Both", enabled: true, sortOrder: 18, color: "bg-rose-50 text-rose-600 border-rose-200" },
      { name: "Confidence", icon: "🔥", category: "Behaviour", displayType: "Toggle", playerPosition: "Both", enabled: true, sortOrder: 19, color: "bg-orange-50 text-orange-600 border-orange-200" },
      { name: "Sportsmanship", icon: "👏", category: "Behaviour", displayType: "Toggle", playerPosition: "Both", enabled: true, sortOrder: 20, color: "bg-teal-50 text-teal-600 border-teal-200" }
    ];
    
    for (const metric of defaultMetrics) {
      await addDoc(collection(db, METRICS_COLLECTION), {
        ...metric,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    const seededSnapshot = await getDocs(q);
    return seededSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as ParentObservationMetric));
  }
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ParentObservationMetric));
};

export const createObservationMetric = async (data: Omit<ParentObservationMetric, "id" | "createdAt" | "updatedAt">): Promise<string> => {
  const docRef = await addDoc(collection(db, METRICS_COLLECTION), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
};

export const updateObservationMetric = async (id: string, data: Partial<ParentObservationMetric>): Promise<void> => {
  const docRef = doc(db, METRICS_COLLECTION, id);
  await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() });
};

export const deleteObservationMetric = async (id: string): Promise<void> => {
  const docRef = doc(db, METRICS_COLLECTION, id);
  await deleteDoc(docRef);
};

export const getParentObservation = async (matchId: string, playerId: string, parentId: string): Promise<ParentMatchObservation | null> => {
  const q = query(
    collection(db, OBSERVATIONS_COLLECTION),
    where("matchId", "==", matchId),
    where("playerId", "==", playerId),
    where("parentId", "==", parentId)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as ParentMatchObservation;
};

export const getObservationsByMatchAndPlayer = async (matchId: string, playerId: string): Promise<ParentMatchObservation[]> => {
  const q = query(
    collection(db, OBSERVATIONS_COLLECTION),
    where("matchId", "==", matchId),
    where("playerId", "==", playerId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ParentMatchObservation));
};

export const saveParentObservation = async (
  observation: Omit<ParentMatchObservation, "id" | "createdAt" | "updatedAt">,
  existingId?: string
): Promise<string> => {
  if (existingId) {
    const docRef = doc(db, OBSERVATIONS_COLLECTION, existingId);
    await updateDoc(docRef, { ...observation, updatedAt: serverTimestamp() });
    return existingId;
  } else {
    const docRef = await addDoc(collection(db, OBSERVATIONS_COLLECTION), {
      ...observation,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }
};


// ============================================================================
// NEW OBSERVATION ENGINE API (REVISION 3.8 / 3.9)
// ============================================================================

export const getActiveObservationProfile = async (academyId: string): Promise<ObservationProfile | null> => {
  try {
    const q = query(
      collection(db, `academies/${academyId}/observation_profiles`),
      where("status", "==", "ACTIVE")
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ObservationProfile));
    return docs[0];
  } catch (error) {
    console.error("Error fetching active observation profile", error);
    return null;
  }
};

export const getObservationProfiles = async (academyId: string): Promise<ObservationProfile[]> => {
  const q = query(
    collection(db, `academies/${academyId}/observation_profiles`),
    orderBy("updatedAt", "desc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ObservationProfile));
};

export const checkProfileUsedInSession = async (academyId: string, profileId: string, profileVersion: string): Promise<boolean> => {
  const q = query(
    collection(db, `academies/${academyId}/observation_sessions`),
    where("profileId", "==", profileId),
    where("profileVersion", "==", profileVersion)
  );
  const snapshot = await getDocs(q);
  return !snapshot.empty;
};

// Recursively removes all undefined values from an object so Firestore never gets 'undefined' fields
const cleanUndefined = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(cleanUndefined);
  if (typeof obj === 'object' && !(obj instanceof Date) && !('toMillis' in obj)) {
    const cleaned: any = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val !== undefined) {
        cleaned[key] = cleanUndefined(val);
      }
    }
    return cleaned;
  }
  return obj;
};

export const createObservationProfile = async (
  academyId: string,
  data: Omit<ObservationProfile, "id" | "createdAt" | "updatedAt">
): Promise<string> => {
  const cleanData = cleanUndefined(data);
  delete cleanData.id;
  delete cleanData.createdAt;
  delete cleanData.updatedAt;
  const docRef = await addDoc(collection(db, `academies/${academyId}/observation_profiles`), {
    ...cleanData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return docRef.id;
};

export const updateObservationProfile = async (
  academyId: string,
  docId: string,
  profileId: string,
  profileVersion: string,
  data: Partial<ObservationProfile>,
  options?: { skipLockCheck?: boolean }
): Promise<void> => {
  if (!options?.skipLockCheck) {
    const isUsed = await checkProfileUsedInSession(academyId, profileId, profileVersion);
    if (isUsed) {
      throw new Error("PROFILE_LOCKED: This profile version has already been used in a session. You must create a new version to modify it.");
    }
  }
  const cleanData = cleanUndefined(data);
  delete cleanData.id;
  const docRef = doc(db, `academies/${academyId}/observation_profiles`, docId);
  await updateDoc(docRef, { ...cleanData, updatedAt: serverTimestamp() });
};

const SYSTEM_METRICS_COLLECTION = "observation_metrics";

export const getSystemMetrics = async (): Promise<ObservationMetric[]> => {
  const q = query(collection(db, SYSTEM_METRICS_COLLECTION));
  const snapshot = await getDocs(q);
  
  const defaultMetrics: Omit<ObservationMetric, "id">[] = [
    { metricCode: "goal", metricName: "Goal", allowedSource: ["PARENT", "COACH", "SCOUT", "AI"], evaluationCategories: ["Attacking"], learningObjectives: ["Finishing"], positionType: "FIELD_PLAYER", metricDifficulty: 5, status: "ACTIVE", weights: { technical: 1.0, tactical: 0.5, mental: 0.8, physical: 0.2, social: 0 }, icon: "svg-goal", category: "Attack", color: "bg-emerald-50 text-emerald-600 border-emerald-200", displayType: "Counter" },
    { metricCode: "assist", metricName: "Assist", allowedSource: ["PARENT", "COACH", "SCOUT", "AI"], evaluationCategories: ["Attacking", "Vision"], learningObjectives: ["Passing"], positionType: "FIELD_PLAYER", metricDifficulty: 4, status: "ACTIVE", weights: { technical: 0.8, tactical: 0.9, mental: 0.6, physical: 0.1, social: 0.5 }, icon: "svg-assist", category: "Attack", color: "bg-blue-50 text-blue-600 border-blue-200", displayType: "Counter" },
    { metricCode: "dribble_win", metricName: "Dribble Win", allowedSource: ["PARENT", "COACH", "SCOUT", "AI"], evaluationCategories: ["Attacking", "1v1"], learningObjectives: ["Dribbling"], positionType: "FIELD_PLAYER", metricDifficulty: 3, status: "ACTIVE", weights: { technical: 0.9, tactical: 0.4, mental: 0.6, physical: 0.6, social: 0 }, icon: "⚡", category: "Attack", color: "bg-purple-50 text-purple-600 border-purple-200", displayType: "Counter" },
    { metricCode: "tackle_win", metricName: "Tackle Win", allowedSource: ["PARENT", "COACH", "SCOUT", "AI"], evaluationCategories: ["Defending", "1v1"], learningObjectives: ["Tackling"], positionType: "FIELD_PLAYER", metricDifficulty: 3, status: "ACTIVE", weights: { technical: 0.7, tactical: 0.6, mental: 0.8, physical: 0.7, social: 0 }, icon: "🛡️", category: "Defense", color: "bg-rose-50 text-rose-600 border-rose-200", displayType: "Counter" },
    { metricCode: "interception", metricName: "Interception", allowedSource: ["PARENT", "COACH", "SCOUT", "AI"], evaluationCategories: ["Defending", "Reading Game"], learningObjectives: ["Positioning"], positionType: "ALL", metricDifficulty: 4, status: "ACTIVE", weights: { technical: 0.4, tactical: 0.9, mental: 0.7, physical: 0.4, social: 0 }, icon: "✂️", category: "Defense", color: "bg-red-50 text-red-600 border-red-200", displayType: "Counter" },
    { metricCode: "save", metricName: "Shot Save", allowedSource: ["PARENT", "COACH", "SCOUT", "AI"], evaluationCategories: ["Goalkeeping"], learningObjectives: ["Shot Stopping"], positionType: "GOALKEEPER", metricDifficulty: 4, status: "ACTIVE", weights: { technical: 0.9, tactical: 0.3, mental: 0.8, physical: 0.7, social: 0 }, icon: "🧤", category: "Goalkeeper", color: "bg-teal-50 text-teal-600 border-teal-200", displayType: "Counter" },
    { metricCode: "punch", metricName: "Punch Clearance", allowedSource: ["PARENT", "COACH", "SCOUT", "AI"], evaluationCategories: ["Goalkeeping"], learningObjectives: ["High Ball"], positionType: "GOALKEEPER", metricDifficulty: 3, status: "ACTIVE", weights: { technical: 0.8, tactical: 0.5, mental: 0.7, physical: 0.6, social: 0 }, icon: "🥊", category: "Goalkeeper", color: "bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200", displayType: "Counter" },
    { metricCode: "catch", metricName: "High Catch", allowedSource: ["PARENT", "COACH", "SCOUT", "AI"], evaluationCategories: ["Goalkeeping"], learningObjectives: ["High Ball"], positionType: "GOALKEEPER", metricDifficulty: 3, status: "ACTIVE", weights: { technical: 0.8, tactical: 0.6, mental: 0.7, physical: 0.5, social: 0 }, icon: "🤲", category: "Goalkeeper", color: "bg-cyan-50 text-cyan-600 border-cyan-200", displayType: "Counter" },
    { metricCode: "gk_distribution", metricName: "GK Distribution", allowedSource: ["PARENT", "COACH", "SCOUT", "AI"], evaluationCategories: ["Goalkeeping", "Passing"], learningObjectives: ["Distribution"], positionType: "GOALKEEPER", metricDifficulty: 3, status: "ACTIVE", weights: { technical: 0.8, tactical: 0.8, mental: 0.6, physical: 0.4, social: 0 }, icon: "🎯", category: "Goalkeeper", color: "bg-sky-50 text-sky-600 border-sky-200", displayType: "Counter" },
    { metricCode: "one_on_one_save", metricName: "1v1 Save", allowedSource: ["PARENT", "COACH", "SCOUT", "AI"], evaluationCategories: ["Goalkeeping"], learningObjectives: ["1v1 Blocking"], positionType: "GOALKEEPER", metricDifficulty: 5, status: "ACTIVE", weights: { technical: 0.9, tactical: 0.7, mental: 0.9, physical: 0.8, social: 0 }, icon: "🛡️", category: "Goalkeeper", color: "bg-indigo-50 text-indigo-600 border-indigo-200", displayType: "Counter" },
    { metricCode: "teamwork", metricName: "Teamwork", allowedSource: ["PARENT", "COACH", "SCOUT"], evaluationCategories: ["Behaviour", "Social"], learningObjectives: ["Communication"], positionType: "ALL", metricDifficulty: 2, status: "ACTIVE", weights: { technical: 0, tactical: 0, mental: 0.6, physical: 0, social: 1.0 }, icon: "🤝", category: "Behaviour", color: "bg-emerald-50 text-emerald-600 border-emerald-200", displayType: "Toggle" },
  ];

  if (snapshot.empty) {
    for (const metric of defaultMetrics) {
      await addDoc(collection(db, SYSTEM_METRICS_COLLECTION), metric);
    }
    const seeded = await getDocs(q);
    return seeded.docs.map(d => ({ id: d.id, ...d.data() } as ObservationMetric));
  }

  const existingMetrics = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ObservationMetric));
  const existingCodes = new Set(existingMetrics.map(m => m.metricCode));
  const missingDefaults = defaultMetrics.filter(m => !existingCodes.has(m.metricCode)).map((m, idx) => ({ id: `default-${m.metricCode}`, ...m } as ObservationMetric));

  return [...existingMetrics, ...missingDefaults];
};

export const createSystemMetric = async (
  data: Omit<ObservationMetric, "id">
): Promise<string> => {
  const docRef = await addDoc(collection(db, SYSTEM_METRICS_COLLECTION), data);
  return docRef.id;
};

export const updateSystemMetric = async (
  id: string,
  data: Partial<ObservationMetric>
): Promise<void> => {
  // Strip id from update payload to avoid Firestore issues
  const cleanData = { ...data };
  delete (cleanData as any).id;

  // Handle synthetic default- IDs: these metrics exist only in code defaults,
  // not in Firestore. We need to create a real doc for them first.
  if (id.startsWith('default-')) {
    const metricCode = id.replace('default-', '');
    // Create a real Firestore doc with the metric data
    const docRef = await addDoc(collection(db, SYSTEM_METRICS_COLLECTION), {
      metricCode,
      ...cleanData
    });
    return;
  }

  const docRef = doc(db, SYSTEM_METRICS_COLLECTION, id);
  await updateDoc(docRef, cleanData);
};

export const archiveSystemMetric = async (id: string): Promise<void> => {
  // Synthetic default- IDs don't exist in Firestore, skip them
  if (id.startsWith('default-')) return;
  const docRef = doc(db, SYSTEM_METRICS_COLLECTION, id);
  // No Hard Delete Rule
  await updateDoc(docRef, { status: "ARCHIVED" });
};

export const getObservationSession = async (
  academyId: string,
  contextId: string,
  creatorId: string,
  playerId: string,
): Promise<ObservationSession | null> => {
  const q = query(
    collection(db, `academies/${academyId}/observation_sessions`),
    where("academyId", "==", academyId),
    where("contextId", "==", contextId),
    where("creatorId", "==", creatorId),
    where("playerId", "==", playerId),
    where("source", "==", "PARENT"),
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  
  // Sort manually to get the latest one
  const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ObservationSession));
  docs.sort((a, b) => {
    const timeA = a.startedAt?.toMillis ? a.startedAt.toMillis() : 0;
    const timeB = b.startedAt?.toMillis ? b.startedAt.toMillis() : 0;
    return timeB - timeA;
  });
  
  return docs[0];
};

export const getObservationLiveEvents = async (
  academyId: string,
  sessionId: string,
  playerId: string,
  creatorId: string,
): Promise<ObservationLiveEvent[]> => {
  const q = query(
    collection(db, `academies/${academyId}/observation_live_events`),
    where("academyId", "==", academyId),
    where("sessionId", "==", sessionId),
    where("playerId", "==", playerId),
    where("creatorId", "==", creatorId),
    where("source", "==", "PARENT"),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ObservationLiveEvent));
};

export const getObservationReflection = async (
  academyId: string,
  sessionId: string,
  playerId: string,
  creatorId: string,
): Promise<ObservationReflection | null> => {
  const q = query(
    collection(db, `academies/${academyId}/observation_reflections`),
    where("academyId", "==", academyId),
    where("sessionId", "==", sessionId),
    where("playerId", "==", playerId),
    where("creatorId", "==", creatorId),
    where("source", "==", "PARENT"),
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as ObservationReflection;
};

export const getObservationLiveEventsByMatch = async (
  academyId: string,
  matchId: string,
  playerId: string
): Promise<ObservationLiveEvent[]> => {
  const q = query(
    collection(db, `academies/${academyId}/observation_live_events`),
    where("matchId", "==", matchId),
    where("playerId", "==", playerId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ObservationLiveEvent));
};

export const getObservationReflectionsByMatch = async (
  academyId: string,
  matchId: string,
  playerId: string
): Promise<ObservationReflection[]> => {
  const q = query(
    collection(db, `academies/${academyId}/observation_reflections`),
    where("matchId", "==", matchId),
    where("playerId", "==", playerId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ObservationReflection));
};

export const createObservationSession = async (
  academyId: string, 
  data: Omit<ObservationSession, "id" | "startedAt" | "immutableMetricSnapshot"> & { immutableMetricSnapshot?: ObservationMetric[] }
): Promise<string> => {
  
  // 1. Identify active Observation Profile
  const activeProfile = await getActiveObservationProfile(academyId);
  
  let finalSnapshot: ObservationMetric[] = [];
  
  if (activeProfile) {
    // Load Global Metrics
    const globalMetrics = await getSystemMetrics();
    
    // Apply Academy Profile configuration
    finalSnapshot = activeProfile.metrics
      .filter(pm => pm.enabled)
      .map(pm => {
        const gm = globalMetrics.find(m => m.metricCode === pm.metricCode);
        if (gm) {
          return {
            ...gm,
            category: pm.categoryDisplay || gm.category,
            metricName: pm.buttonLabel || gm.metricName
          };
        }
        // Fallback for custom metricCodes (e.g. ballrecovery) not present in system metrics list
        return {
          id: `profile-${pm.metricCode}`,
          metricCode: pm.metricCode,
          metricName: pm.buttonLabel || pm.metricCode,
          allowedSource: ["PARENT", "COACH", "SCOUT", "AI"],
          evaluationCategories: [pm.categoryDisplay || "General"],
          learningObjectives: [],
          positionType: "ALL",
          metricDifficulty: 3,
          status: "ACTIVE",
          weights: { technical: 0.5, tactical: 0.5, mental: 0.5, physical: 0.5, social: 0 },
          icon: "⚡",
          category: pm.categoryDisplay || "General",
          color: "bg-blue-50 text-blue-600 border-blue-200",
          displayType: "Counter"
        } as ObservationMetric;
      })
      .filter(Boolean) as ObservationMetric[];
      
    // Apply displayOrder
    finalSnapshot.sort((a, b) => {
      const pmA = activeProfile.metrics.find(m => m.metricCode === a.metricCode);
      const pmB = activeProfile.metrics.find(m => m.metricCode === b.metricCode);
      return (pmA?.displayOrder || 0) - (pmB?.displayOrder || 0);
    });
    
    // Store profileId and profileVersion
    data.profileId = activeProfile.profileId || activeProfile.id;
    data.profileVersion = activeProfile.profileVersion;
  } else {
    // Backward compatible fallback
    if (data.immutableMetricSnapshot && data.immutableMetricSnapshot.length > 0) {
      finalSnapshot = data.immutableMetricSnapshot;
    } else {
      const globalMetrics = await getSystemMetrics();
      finalSnapshot = globalMetrics.filter(m => m.status === "ACTIVE");
    }
  }

  // Sanitize data before write to avoid overriding immutableMetricSnapshot unexpectedly
  const { immutableMetricSnapshot: _legacySnapshot, ...cleanData } = data;

  const sessionData = {
    ...cleanData,
    immutableMetricSnapshot: finalSnapshot,
    startedAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, `academies/${academyId}/observation_sessions`), sessionData);
  return docRef.id;
};

export const updateObservationSession = async (
  academyId: string,
  sessionId: string,
  data: Partial<ObservationSession>
): Promise<void> => {
  const docRef = doc(db, `academies/${academyId}/observation_sessions`, sessionId);
  await updateDoc(docRef, data);
};

export const saveObservationLiveEvent = async (
  academyId: string,
  data: Omit<ObservationLiveEvent, "id">
): Promise<string> => {
  const docRef = await addDoc(collection(db, `academies/${academyId}/observation_live_events`), data);
  return docRef.id;
};

export const saveObservationReflection = async (
  academyId: string,
  data: Omit<ObservationReflection, "id">
): Promise<string> => {
  const docRef = await addDoc(collection(db, `academies/${academyId}/observation_reflections`), data);
  return docRef.id;
};

export const logObservationAudit = async (
  academyId: string,
  data: Omit<ObservationAuditLog, "id" | "timestamp">
): Promise<string> => {
  const docRef = await addDoc(collection(db, `academies/${academyId}/observation_audit_logs`), {
    ...data,
    timestamp: serverTimestamp()
  });
  return docRef.id;
};

export const batchSaveObservationLiveEvents = async (
  academyId: string,
  events: Omit<ObservationLiveEvent, "id">[]
): Promise<void> => {
  if (events.length === 0) return;
  
  const batch = writeBatch(db);
  const eventsRef = collection(db, `academies/${academyId}/observation_live_events`);
  
  events.forEach(event => {
    const newDocRef = doc(eventsRef);
    batch.set(newDocRef, event);
  });
  
  await batch.commit();
};
