import { Timestamp } from "firebase/firestore";

// Governance Enums
export type MetricStatus = "DRAFT" | "ACTIVE" | "DEPRECATED" | "ARCHIVED";
export type AllowedSource = "PARENT" | "COACH" | "SCOUT" | "VIDEO" | "AI" | "SYSTEM";
export type PositionType = "FIELD_PLAYER" | "GOALKEEPER" | "ALL";
export type ContextType = "MATCH" | "TRAINING" | "TEST" | "TRIAL" | "SCOUT" | "CAMP" | "CUSTOM";
export type EventStatus = "ACTIVE" | "INVALID" | "DELETED" | "MERGED";
export type MatchSegment = "1H" | "2H" | "ET1" | "ET2" | "PEN" | "SESSION1" | "SESSION2";
export type SessionStatus = "IN_PROGRESS" | "COMPLETED" | "ABANDONED";

export interface MetricWeights {
  technical: number;
  tactical: number;
  mental: number;
  physical: number;
  social: number;
}

export interface ObservationMetric {
  id: string; // The doc ID
  metricCode: string; // IMMUTABLE
  metricName: string;
  allowedSource: AllowedSource[];
  evaluationCategories: string[]; // Maps to Evaluation Criteria categories
  learningObjectives: string[];
  positionType: PositionType;
  metricDifficulty: number; // 1-5
  status: MetricStatus;
  weights: MetricWeights;
  icon: string;
  category: string; // e.g., 'Attacking', 'Defending'
  color: string;
  displayType: "Counter" | "Toggle";
}

export interface ObservationTemplate {
  id: string;
  templateVersion: string; // e.g., THFA-2026-v1
  name: string;
  region: string;
  metricIds: string[]; // Normalized references to ObservationMetric
}

export interface ObservationProfileMetric {
  metricCode: string;
  enabled: boolean;
  displayOrder: number;
  categoryDisplay?: string;
  buttonLabel?: string;
}

export interface ObservationProfile {
  id?: string;
  academyId: string;
  profileId: string;
  profileName: string;
  profileVersion: string;
  templateId: string;
  status: "ACTIVE" | "ARCHIVED" | "DRAFT";
  metrics: ObservationProfileMetric[];
  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
}

export interface ObservationSession {
  id: string;
  academyId: string;
  profileId?: string; // Configured profile reference
  profileVersion?: string;
  contextType: ContextType;
  contextId: string;
  matchId?: string; // Legacy support
  seasonId: string;
  source: AllowedSource;
  creatorId: string; // The observer (Parent, Coach, AI, etc.)
  sessionStatus: SessionStatus;
  startedAt: Timestamp | any;
  completedAt?: Timestamp | any;
  immutableMetricSnapshot: ObservationMetric[]; // Frozen metrics for this session
}

export interface MatchContext {
  competitionType: string; // League, Tournament, Friendly
  importance: string; // Final, Normal, etc.
}

export interface ObservationLiveEvent {
  id: string;
  academyId: string;
  sessionId: string;
  observationSchemaVersion: string; // e.g., v1
  contextType: ContextType;
  contextId: string;
  matchId?: string;
  playerId: string;
  futId: string; // Global ID bonding
  seasonId: string;
  source: AllowedSource;
  creatorId: string;
  metricId: string;
  metricCode: string; // IMMUTABLE
  evaluationCriteriaVersion: string;
  matchContext?: MatchContext;
  eventStatus: EventStatus;
  matchSegment: MatchSegment;
  evidence: string; // MANUAL_TAP, VIDEO_ANALYSIS, WEARABLE
  eventTimestamp: Timestamp | any;
  eventSequence: number;
  weights: MetricWeights; // Snapshot
  metricDifficulty: number; // Snapshot
  confidenceWeight: number; // Based on Parent Reliability
}

export interface ReflectionItem {
  metricCode: string;
  evaluationCategories: string[];
  learningObjectives: string[];
  freeText: string;
  snapshotVersion: string;
}

export interface ObservationReflection {
  id: string;
  academyId: string;
  sessionId: string;
  observationSchemaVersion: string;
  contextType: ContextType;
  contextId: string;
  matchId?: string;
  playerId: string;
  futId: string;
  seasonId: string;
  source: AllowedSource;
  creatorId: string;
  evaluationCriteriaVersion: string;
  matchContext?: MatchContext;
  strengths: ReflectionItem[];
  improvements: ReflectionItem[];
  nextGoals: ReflectionItem[];
  evidence: string;
  comment: string;
  version: number;
  editedBy: string;
  editedAt: Timestamp | any;
  eventStatus: EventStatus;
}

export interface ObservationAuditLog {
  id: string;
  academyId: string;
  targetCollection: "observation_live_events" | "observation_reflections" | "observation_sessions";
  targetId: string;
  action: "CREATED" | "STATUS_CHANGED" | "VERIFIED" | "INVALIDATED";
  previousState: any;
  newState: any;
  performedBy: string;
  timestamp: Timestamp | any;
}

// --------------------------------------------------------------------------
// LEGACY TYPES (Preserved strictly for Backward Compatibility)
// DO NOT MODIFY OR REMOVE THESE UNTIL ALL LEGACY DEPENDENCIES ARE MIGRATED
// --------------------------------------------------------------------------
export interface ParentObservationMetric {
  id: string;
  name: string;
  icon: string;
  category: string;
  enabled: boolean;
  sortOrder: number;
  color: string;
  displayType: "Counter" | "Toggle";
  playerPosition: "Field" | "Goalkeeper" | "Both";
  createdAt: Timestamp | any;
  updatedAt: Timestamp | any;
}

export interface ParentMatchObservation {
  id: string;
  matchId: string;
  playerId: string;
  parentId: string;
  academyId: string;
  seasonId: string;
  createdAt: Timestamp | any;
  updatedAt: Timestamp | any;
  metrics: Record<string, number>;
  comment: string;
  submitted: boolean;
}
