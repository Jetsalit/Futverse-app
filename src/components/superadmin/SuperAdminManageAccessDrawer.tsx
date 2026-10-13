import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocFromServer, getDocsFromServer } from "firebase/firestore";
import { CheckCircle, Loader2, ShieldAlert, X } from "lucide-react";
import type { User } from "../../contexts/AuthContext";
import { db } from "../../lib/firebase";
import {
  resolveAcademyAccessState,
  resolveProClubAccessState,
  type AcademyAccessAction,
  type AccessStateDecision,
  type ProClubAccessAction,
} from "../../lib/superAdminAccessControl";
import {
  mutateSuperAdminAccessAtomically,
  type AccessControlMutationInput,
  type AcademyExpectedState,
  type ProClubExpectedState,
} from "../../lib/firestore/superAdminAccessControlRepository";
import type { SuperAdminOrganizationRelationship } from "../../lib/superAdminRelationshipReadModel";
import type { TenantRole } from "../../types/Membership";
import type { ProClubStaffRole } from "../../types/ProClub";

export interface ManageAccessAcademyOption {
  id: string;
  name?: string;
  status?: string;
}

interface ProClubOption {
  id: string;
  name?: string;
  status?: string;
}

interface ProClubCurrentAccess {
  clubId: string;
  name: string;
  membership: string;
  staffRole: string;
  status: string;
}

interface AccessPreview {
  organizationName: string;
  decision: AccessStateDecision<ProClubAccessAction | AcademyAccessAction>;
  expectedState: ProClubExpectedState | AcademyExpectedState;
}

interface Props {
  target: User & { id: string };
  actorUid: string;
  academies: readonly ManageAccessAcademyOption[];
  currentAcademyRelationships: readonly SuperAdminOrganizationRelationship[];
  actualSuperAdmin: boolean;
  supportModeActive: boolean;
  onClose(): void;
  onMutationComplete(): void | Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The current access state is unavailable.";
}

function normalizeName(name: unknown, fallback: string): string {
  return typeof name === "string" && name.trim() ? name : fallback;
}

function proClubPointerIsCanonical(value: Record<string, unknown>, clubId: string): boolean {
  const keys = Object.keys(value);
  return keys.length === 2
    && keys.includes("schemaVersion")
    && keys.includes("clubId")
    && value.schemaVersion === 1
    && value.clubId === clubId;
}

function academyExpectedState(
  membership: Record<string, unknown> | null,
  specialty: Record<string, unknown> | null,
): AcademyExpectedState {
  return {
    membership: membership ? {
      role: String(membership.role),
      status: String(membership.status),
      source: String(membership.source),
      joinedBy: String(membership.joinedBy),
      ...(Object.hasOwn(membership, "approvalClaimId")
        ? { approvalClaimId: String(membership.approvalClaimId) }
        : {}),
    } : null,
    specialty: specialty ? {
      specialty: String(specialty.specialty),
      status: String(specialty.status),
    } : null,
  };
}

function formatDecision(decision: AccessStateDecision<string>): string {
  switch (decision.actionType) {
    case "ACCESS_ASSIGNED": return "Assign Access";
    case "STAFF_ROLE_ASSIGNED": return "Assign Staff Role";
    case "STAFF_ROLE_CHANGED": return "Change Staff Role";
    case "ACCESS_REACTIVATED": return "Reactivate Access";
    case "ACADEMY_MEMBERSHIP_ASSIGNED": return "Assign Academy Membership";
    case "ACADEMY_ROLE_CHANGED": return "Change Academy Role";
    case "ACADEMY_SPECIALTY_ASSIGNED": return "Assign Fitness Coach Specialty";
    case "ACADEMY_SPECIALTY_REACTIVATED": return "Reactivate Fitness Coach Specialty";
    default: return decision.state === "ALREADY_ACTIVE" ? "Already Active" : decision.state;
  }
}

export default function SuperAdminManageAccessDrawer({
  target,
  actorUid,
  academies,
  currentAcademyRelationships,
  actualSuperAdmin,
  supportModeActive,
  onClose,
  onMutationComplete,
}: Props) {
  const [organizationType, setOrganizationType] = useState<"PRO_CLUB" | "ACADEMY">("PRO_CLUB");
  const [organizationId, setOrganizationId] = useState("");
  const [desiredProClubRole, setDesiredProClubRole] = useState<ProClubStaffRole>("HEAD_COACH");
  const [desiredAcademyRole, setDesiredAcademyRole] = useState<TenantRole>("COACH");
  const [desiredFitnessCoach, setDesiredFitnessCoach] = useState(false);
  const [proClubs, setProClubs] = useState<ProClubOption[]>([]);
  const [proClubLoadState, setProClubLoadState] = useState<"loading" | "loaded" | "error">("loading");
  const [currentProClubAccess, setCurrentProClubAccess] = useState<ProClubCurrentAccess[]>([]);
  const [currentProClubLoadState, setCurrentProClubLoadState] = useState<"loading" | "loaded" | "error">("loading");
  const [preview, setPreview] = useState<AccessPreview | null>(null);
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [mutationState, setMutationState] = useState<"idle" | "saving" | "saved">("idle");
  const [mutationError, setMutationError] = useState<string | null>(null);

  const selectedAcademy = academies.find((academy) => academy.id === organizationId);
  const selectedProClub = proClubs.find((club) => club.id === organizationId);
  const selectedOrganization = organizationType === "ACADEMY" ? selectedAcademy : selectedProClub;
  const targetIsEligible = target.status === "ACTIVE" || target.status === "Active";
  const canWrite = actualSuperAdmin && !supportModeActive && targetIsEligible && target.role !== "SUPERADMIN";
  const currentStaffAcademyRelationships = useMemo(
    () => currentAcademyRelationships.filter((relationship) =>
      relationship.organizationType === "ACADEMY" && relationship.evidenceKind === "STAFF_MEMBERSHIP",
    ),
    [currentAcademyRelationships],
  );

  useEffect(() => {
    let cancelled = false;
    setProClubLoadState("loading");
    getDocsFromServer(collection(db, "proClubs"))
      .then((snapshot) => {
        if (cancelled) return;
        setProClubs(snapshot.docs.map((clubDoc) => {
          const data = clubDoc.data();
          return {
            id: clubDoc.id,
            name: typeof data.name === "string" ? data.name : undefined,
            status: typeof data.status === "string" ? data.status : undefined,
          };
        }));
        setProClubLoadState("loaded");
      })
      .catch(() => {
        if (!cancelled) {
          setProClubs([]);
          setProClubLoadState("error");
        }
      });
    return () => { cancelled = true; };
  }, [actorUid]);

  useEffect(() => {
    let cancelled = false;
    setCurrentProClubLoadState("loading");
    setCurrentProClubAccess([]);
    async function loadCurrentProClubAccess() {
      try {
        const pointerDocs = await getDocsFromServer(
          collection(db, "users", target.id, "proClubMemberships"),
        );
        const relationships = await Promise.all(pointerDocs.docs.map(async (pointerDoc) => {
          const pointer = pointerDoc.data();
          if (!proClubPointerIsCanonical(pointer, pointerDoc.id)) {
            return {
              clubId: pointerDoc.id,
              name: pointerDoc.id,
              membership: "REVIEW REQUIRED",
              staffRole: "REVIEW REQUIRED",
              status: "Malformed discovery pointer",
            };
          }
          const [membership, staff] = await Promise.all([
            getDocFromServer(doc(db, "proClubs", pointerDoc.id, "members", target.id)),
            getDocFromServer(doc(db, "proClubs", pointerDoc.id, "staff", target.id)),
          ]);
          const club = proClubs.find((candidate) => candidate.id === pointerDoc.id);
          const memberData = membership.exists() ? membership.data() : null;
          const staffData = staff.exists() ? staff.data() : null;
          return {
            clubId: pointerDoc.id,
            name: normalizeName(club?.name, pointerDoc.id),
            membership: memberData ? `${String(memberData.authorizationRole)} · ${String(memberData.status)}` : "MISSING",
            staffRole: staffData ? String(staffData.staffRole) : "MISSING",
            status: memberData && staffData ? "Canonical records found" : "REVIEW REQUIRED · partial access",
          };
        }));
        if (!cancelled) {
          setCurrentProClubAccess(relationships);
          setCurrentProClubLoadState("loaded");
        }
      } catch {
        if (!cancelled) {
          setCurrentProClubAccess([]);
          setCurrentProClubLoadState("error");
        }
      }
    }
    void loadCurrentProClubAccess();
    return () => { cancelled = true; };
  }, [actorUid, target.id, mutationState, proClubs]);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setPreviewError(null);
    setMutationError(null);
    setMutationState("idle");
    if (!organizationId || !selectedOrganization) {
      setPreviewState("idle");
      return;
    }
    setPreviewState("loading");
    async function loadPreview() {
      try {
        let organizationName = normalizeName(selectedOrganization?.name, organizationId);

        if (organizationType === "PRO_CLUB") {
          if (!selectedProClub || selectedProClub.status !== "ACTIVE") {
            throw new Error("The selected Pro Club is unavailable or inactive.");
          }
          const [membershipSnapshot, staffSnapshot, pointerSnapshot] = await Promise.all([
            getDocFromServer(doc(db, "proClubs", organizationId, "members", target.id)),
            getDocFromServer(doc(db, "proClubs", organizationId, "staff", target.id)),
            getDocFromServer(doc(db, "users", target.id, "proClubMemberships", organizationId)),
          ]);
          const membership = membershipSnapshot.exists() ? membershipSnapshot.data() : null;
          const staff = staffSnapshot.exists() ? staffSnapshot.data() : null;
          const pointer = pointerSnapshot.exists() ? pointerSnapshot.data() : null;
          let decision = resolveProClubAccessState(membership, staff, desiredProClubRole);
          if ((membership !== null || staff !== null) !== (pointer !== null)
            || (pointer !== null && !proClubPointerIsCanonical(pointer, organizationId))) {
            decision = { state: "MANUAL_REVIEW", actionType: null, requiresConfirmation: false, reason: "Membership, staff, and discovery pointer are incomplete or conflicting. Manual review is required." };
          }
          const expectedState: ProClubExpectedState = {
            membership: membership ? { authorizationRole: String(membership.authorizationRole), status: String(membership.status) } : null,
            staff: staff ? { staffRole: String(staff.staffRole), status: String(staff.status) } : null,
            pointerExists: pointerSnapshot.exists(),
          };
          if (!cancelled) {
            setPreview({ organizationName, decision, expectedState });
            setPreviewState("ready");
          }
          return;
        }

        const organizationSnapshot = await getDocFromServer(doc(db, "academies", organizationId));
        if (!organizationSnapshot.exists()) throw new Error("The selected Academy is unavailable.");
        organizationName = normalizeName(organizationSnapshot.data().name, organizationId);
        const [membershipSnapshot, specialtySnapshot] = await Promise.all([
          getDocFromServer(doc(db, "academies", organizationId, "members", target.id)),
          getDocFromServer(doc(db, "academies", organizationId, "staffSpecialties", target.id)),
        ]);
        const membership = membershipSnapshot.exists() ? membershipSnapshot.data() : null;
        const specialty = specialtySnapshot.exists() ? specialtySnapshot.data() : null;
        let decision = resolveAcademyAccessState(membership, specialty, desiredAcademyRole, desiredFitnessCoach);
        const academyStatus = organizationSnapshot.data().status;
        if (academyStatus !== undefined && academyStatus !== "ACTIVE" && academyStatus !== "Active") {
          decision = { state: "MANUAL_REVIEW", actionType: null, requiresConfirmation: false, reason: "Direct Academy access requires an ACTIVE organization." };
        }
        const expectedState = academyExpectedState(membership, specialty);
        if (!cancelled) {
          setPreview({ organizationName, decision, expectedState });
          setPreviewState("ready");
        }
      } catch (error) {
        if (!cancelled) {
          setPreviewError(errorMessage(error));
          setPreviewState("error");
        }
      }
    }
    void loadPreview();
    return () => { cancelled = true; };
  }, [
    actorUid,
    desiredAcademyRole,
    desiredFitnessCoach,
    desiredProClubRole,
    organizationId,
    organizationType,
    selectedProClub,
    selectedOrganization,
    target.id,
  ]);

  const targetName = target.name?.trim() || target.email || target.id;
  const canConfirm = Boolean(
    canWrite && preview?.decision.actionType && preview.decision.requiresConfirmation && mutationState === "idle",
  );

  async function confirmAccess() {
    if (!preview?.decision.actionType || !canConfirm || !organizationId) return;
    const actionType = preview.decision.actionType;
    setMutationState("saving");
    setMutationError(null);
    try {
      const base = {
        actorUid,
        targetUid: target.id,
        organizationId,
        organizationType,
        presentationModeActive: supportModeActive,
        expectedActionType: actionType,
        confirmedActionType: actionType,
        expectedState: preview.expectedState,
      };
      const mutationInput = organizationType === "PRO_CLUB"
        ? { ...base, organizationType: "PRO_CLUB" as const, desiredStaffRole: desiredProClubRole }
        : {
          ...base,
          organizationType: "ACADEMY" as const,
          desiredAcademyRole,
          desiredFitnessCoach,
        };
      await mutateSuperAdminAccessAtomically(mutationInput as AccessControlMutationInput);
      setMutationState("saved");
      await onMutationComplete();
    } catch (error) {
      setMutationState("idle");
      setMutationError(errorMessage(error));
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/45" role="presentation">
      <section
        aria-label="Manage organization access"
        aria-modal="true"
        role="dialog"
        className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-lg font-black text-slate-900">Manage Access</h2>
            <p className="mt-1 text-sm text-slate-500">Assign an existing account to an Academy or Pro Club.</p>
          </div>
          <button type="button" aria-label="Close Manage Access" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">User</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="block text-xs text-slate-500">Name</span><strong>{targetName}</strong></div>
              <div><span className="block text-xs text-slate-500">Email</span><strong className="break-all">{target.email || "Unavailable"}</strong></div>
              <div><span className="block text-xs text-slate-500">Account status</span><strong>{String(target.status || "UNKNOWN")}</strong></div>
              <div><span className="block text-xs text-slate-500">Account role</span><strong>{target.role || "UNKNOWN"}</strong></div>
            </div>
            {(!targetIsEligible || target.role === "SUPERADMIN") && (
              <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">Staff access requires an ACTIVE account that is not a SUPERADMIN.</p>
            )}
            {supportModeActive && (
              <p role="alert" className="mt-3 text-xs font-semibold text-amber-800">Exit Support or Work As mode before managing organization access.</p>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">Current access</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3">
                <h4 className="mb-2 text-sm font-bold text-slate-800">Academy</h4>
                {currentStaffAcademyRelationships.length === 0 ? (
                  <p className="text-xs text-slate-500">No canonical Academy staff relationship found.</p>
                ) : currentStaffAcademyRelationships.map((relationship) => (
                  <p key={`${relationship.organizationId}-${relationship.relationship}`} className="text-xs text-slate-700">
                    {relationship.organizationName || relationship.organizationId}: {relationship.relationship} · {relationship.relationshipStatus}
                  </p>
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <h4 className="mb-2 text-sm font-bold text-slate-800">Pro Club</h4>
                {currentProClubLoadState === "loading" ? <p className="text-xs text-slate-500">Loading canonical relationships…</p> : null}
                {currentProClubLoadState === "error" ? <p className="text-xs text-rose-700">Pro Club relationship inventory unavailable.</p> : null}
                {currentProClubLoadState === "loaded" && currentProClubAccess.length === 0 ? <p className="text-xs text-slate-500">Not connected.</p> : null}
                {currentProClubAccess.map((relationship) => (
                  <p key={relationship.clubId} className="mb-1 text-xs text-slate-700">
                    {relationship.name}: {relationship.membership} · {relationship.staffRole} <span className="text-slate-500">({relationship.status})</span>
                  </p>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">Manage access</h3>
            <label className="block text-sm font-semibold text-slate-700">
              Organization type
              <select
                value={organizationType}
                onChange={(event) => { setOrganizationType(event.target.value as "ACADEMY" | "PRO_CLUB"); setOrganizationId(""); }}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
              >
                <option value="PRO_CLUB">Pro Club</option>
                <option value="ACADEMY">Academy</option>
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Organization
              <select
                value={organizationId}
                onChange={(event) => setOrganizationId(event.target.value)}
                disabled={organizationType === "PRO_CLUB" && proClubLoadState !== "loaded"}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100"
              >
                <option value="">Select an organization…</option>
                {organizationType === "ACADEMY" ? academies.map((academy) => (
                  <option key={academy.id} value={academy.id} disabled={academy.status !== undefined && academy.status !== "ACTIVE" && academy.status !== "Active"}>
                    {normalizeName(academy.name, academy.id)}{academy.status && academy.status !== "ACTIVE" && academy.status !== "Active" ? ` · ${academy.status}` : ""}
                  </option>
                )) : proClubs.map((club) => (
                  <option key={club.id} value={club.id} disabled={club.status !== "ACTIVE"}>
                    {normalizeName(club.name, club.id)}{club.status !== "ACTIVE" ? " · INACTIVE" : ""}
                  </option>
                ))}
              </select>
              {organizationType === "PRO_CLUB" && proClubLoadState === "loading" && <span className="mt-1 block text-xs text-slate-500">Loading Pro Clubs…</span>}
              {organizationType === "PRO_CLUB" && proClubLoadState === "error" && <span className="mt-1 block text-xs text-rose-700">Pro Club inventory unavailable.</span>}
            </label>

            {organizationType === "PRO_CLUB" && (
              <label className="block text-sm font-semibold text-slate-700">
                Staff role
                <select value={desiredProClubRole} onChange={(event) => setDesiredProClubRole(event.target.value as ProClubStaffRole)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2">
                  <option value="TECHNICAL_DIRECTOR">Technical Director</option>
                  <option value="MANAGER">Manager</option>
                  <option value="HEAD_COACH">Head Coach</option>
                  <option value="ASSISTANT_COACH">Assistant Coach</option>
                  <option value="GK_COACH">GK Coach</option>
                  <option value="FITNESS_COACH">Fitness Coach</option>
                  <option value="ANALYST">Analyst</option>
                  <option value="PHYSIO">Physio</option>
                  <option value="TEAM_MANAGER">Team Manager</option>
                  <option value="STAFF">Staff</option>
                </select>
              </label>
            )}

            {organizationType === "ACADEMY" && (
              <>
                <label className="block text-sm font-semibold text-slate-700">
                  Academy role
                  <select value={desiredAcademyRole} onChange={(event) => setDesiredAcademyRole(event.target.value as TenantRole)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2">
                    <option value="ADMIN">Admin</option>
                    <option value="COACH">Coach</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={desiredFitnessCoach} onChange={(event) => setDesiredFitnessCoach(event.target.checked)} />
                  Fitness Coach specialty
                </label>
              </>
            )}
          </section>

          {previewState === "loading" && <div role="status" className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="animate-spin" size={16} /> Rechecking current access from Firestore…</div>}
          {previewState === "error" && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{previewError}</p>}
          {preview && (
            <section className="rounded-xl border border-slate-200 bg-white p-4" aria-live="polite">
              <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Review</h3>
              <p className="text-sm font-bold text-slate-900">{formatDecision(preview.decision)}</p>
              {preview.decision.state === "MANUAL_REVIEW" && (
                <p role="alert" className="mt-2 flex gap-2 text-sm text-amber-800"><ShieldAlert size={16} className="shrink-0" />{preview.decision.reason}</p>
              )}
              {preview.decision.state === "ALREADY_ACTIVE" && <p className="mt-2 text-sm text-emerald-700">The selected access is already active. No write will be made.</p>}
              {preview.decision.actionType && organizationType === "PRO_CLUB" && (
                <div className="mt-3 space-y-1 text-sm text-slate-700">
                  <p>User: <strong>{targetName}</strong></p>
                  <p>Organization: <strong>{preview.organizationName}</strong></p>
                  <p>Membership: <strong>MEMBER · ACTIVE</strong></p>
                  <p>Staff role: <strong>{preview.expectedState && "staff" in preview.expectedState ? preview.expectedState.staff?.staffRole || "None" : "None"} → {desiredProClubRole}</strong></p>
                  <p className="text-xs text-slate-500">Existing Academy access will not be changed.</p>
                </div>
              )}
              {preview.decision.actionType && organizationType === "ACADEMY" && (
                <div className="mt-3 space-y-1 text-sm text-slate-700">
                  <p>User: <strong>{targetName}</strong></p>
                  <p>Organization: <strong>{preview.organizationName}</strong></p>
                  <p>Academy role: <strong>{(preview.expectedState as AcademyExpectedState).membership?.role || "None"} → {desiredAcademyRole} · ACTIVE</strong></p>
                  <p>Fitness Coach: <strong>{desiredFitnessCoach ? "FITNESS_COACH · ACTIVE" : "No new specialty assignment"}</strong></p>
                  <p className="text-xs text-slate-500">Existing Pro Club access will not be changed.</p>
                </div>
              )}
              {mutationError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{mutationError}</p>}
              {mutationState === "saved" && <p role="status" className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle size={16} /> Access updated and audited.</p>}
              {preview.decision.actionType && (
                <button
                  type="button"
                  onClick={() => void confirmAccess()}
                  disabled={!canConfirm}
                  className="mt-4 w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {mutationState === "saving" ? "Saving…" : `${formatDecision(preview.decision)} · Confirm`}
                </button>
              )}
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
