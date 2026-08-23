import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  X,
} from "lucide-react";

import {
  mutateMembershipStatusAtomically,
  type SuperAdminControlledMembershipMutationResult,
} from "../../lib/firestore/superAdminControlledMembershipMutations";

import {
  isExactActiveSuperAdmin,
  isExactDocumentId,
} from "../../lib/superAdminSupportModel";

import { useAuth } from "../../contexts/AuthContext";
import { useSuperAdminSupport } from "../../contexts/SuperAdminSupportContext";
import { useSuperAdminNonStaffSupport } from "../../contexts/SuperAdminNonStaffSupportContext";

import type {
  SuperAdminControlledMembershipActionPresentation,
  SuperAdminControlledMembershipActionPresentationModel,
} from "./superAdminControlledMembershipActionPresentation";

interface SuperAdminControlledMembershipActionsProps {
  model: SuperAdminControlledMembershipActionPresentationModel;

  onAuthoritativeRefresh:
    () => Promise<void>;
}

function actionButtonClass(
  action: SuperAdminControlledMembershipActionPresentation,
): string {
  switch (action.tone) {
    case "POSITIVE":
      return [
        "border-emerald-200",
        "bg-emerald-50",
        "text-emerald-800",
        "hover:bg-emerald-100",
      ].join(" ");

    case "CAUTION":
      return [
        "border-amber-200",
        "bg-amber-50",
        "text-amber-900",
        "hover:bg-amber-100",
      ].join(" ");

    case "DANGER":
      return [
        "border-rose-200",
        "bg-rose-50",
        "text-rose-800",
        "hover:bg-rose-100",
      ].join(" ");
  }
}

function confirmationButtonClass(
  action: SuperAdminControlledMembershipActionPresentation,
): string {
  switch (action.tone) {
    case "POSITIVE":
      return "bg-emerald-600 text-white hover:bg-emerald-700";

    case "CAUTION":
      return "bg-amber-500 text-slate-950 hover:bg-amber-400";

    case "DANGER":
      return "bg-rose-600 text-white hover:bg-rose-700";
  }
}

function mutationErrorMessage(
  error: unknown,
): string {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message;
  }

  return "Unable to complete this controlled Membership action.";
}

export default function SuperAdminControlledMembershipActions({
  model,
  onAuthoritativeRefresh,
}: SuperAdminControlledMembershipActionsProps) {
  const { actualUser } = useAuth();

  const staffSupport =
    useSuperAdminSupport();

  const nonStaffSupport =
    useSuperAdminNonStaffSupport();

  const [
    selectedAction,
    setSelectedAction,
  ] =
    useState<
      SuperAdminControlledMembershipActionPresentation | null
    >(null);

  const [
    isSubmitting,
    setIsSubmitting,
  ] =
    useState(false);

  const [
    mutationError,
    setMutationError,
  ] =
    useState<string | null>(null);

  const [
    mutationNotice,
    setMutationNotice,
  ] =
    useState<string | null>(null);

  const [
    refreshWarning,
    setRefreshWarning,
  ] =
    useState<string | null>(null);

  const [
    postCommitLocked,
    setPostCommitLocked,
  ] =
    useState(false);

  const inFlightRef =
    useRef(false);

  const actorUid =
    actualUser?.uid ||
    actualUser?.id ||
    null;

  const actorIsActiveSuperAdmin =
    isExactActiveSuperAdmin(
      actualUser,
    );

  const actorUidIsExact =
    isExactDocumentId(
      actorUid,
    );

  const supportModeActive =
    staffSupport.isSupportActive ||
    nonStaffSupport.isActive;

  const actionsEnabled =
    model.availability === "AVAILABLE" &&
    actorIsActiveSuperAdmin &&
    actorUidIsExact &&
    !supportModeActive &&
    !postCommitLocked;

  useEffect(() => {
    setSelectedAction(null);
    setMutationError(null);
    setMutationNotice(null);
    setRefreshWarning(null);
    setPostCommitLocked(false);
    inFlightRef.current = false;
  }, [
    model.userId,
    model.academyId,
    model.role,
    model.status,
    model.membershipSource,
    model.availability,
  ]);

  useEffect(() => {
    if (
      supportModeActive ||
      !actorIsActiveSuperAdmin ||
      !actorUidIsExact
    ) {
      setSelectedAction(null);
    }
  }, [
    supportModeActive,
    actorIsActiveSuperAdmin,
    actorUidIsExact,
  ]);

  const openConfirmation = (
    action:
      SuperAdminControlledMembershipActionPresentation,
  ) => {
    if (
      !actionsEnabled ||
      isSubmitting ||
      inFlightRef.current
    ) {
      return;
    }

    setMutationError(null);
    setMutationNotice(null);
    setRefreshWarning(null);
    setSelectedAction(action);
  };

  const cancelConfirmation = () => {
    if (
      isSubmitting ||
      inFlightRef.current
    ) {
      return;
    }

    setSelectedAction(null);
    setMutationError(null);
  };

  const confirmAction = async () => {
    const action =
      selectedAction;

    if (
      !action ||
      isSubmitting ||
      inFlightRef.current
    ) {
      return;
    }

    const liveActorUid =
      actualUser?.uid ||
      actualUser?.id ||
      null;

    if (
      !isExactActiveSuperAdmin(actualUser) ||
      !isExactDocumentId(liveActorUid)
    ) {
      setSelectedAction(null);
      setMutationError(
        "The authenticated SuperAdmin actor is no longer valid. Refresh before trying again.",
      );
      return;
    }

    if (
      staffSupport.isSupportActive ||
      nonStaffSupport.isActive
    ) {
      setSelectedAction(null);
      setMutationError(
        "Controlled Membership actions are unavailable while Work As / support mode is active.",
      );
      return;
    }

    if (
      model.availability !== "AVAILABLE"
    ) {
      setSelectedAction(null);
      setMutationError(
        "The inspected Membership is no longer eligible for controlled actions.",
      );
      return;
    }

    const stillPresented =
      model.actions.some(
        (candidate) =>
          candidate.action ===
            action.action &&
          candidate.targetUid ===
            action.targetUid &&
          candidate.academyId ===
            action.academyId &&
          candidate.expectedStatus ===
            action.expectedStatus &&
          candidate.expectedRole ===
            action.expectedRole &&
          candidate.expectedSource ===
            action.expectedSource,
      );

    if (!stillPresented) {
      setSelectedAction(null);
      setMutationError(
        "The reviewed Membership action is stale. Refresh authoritative evidence before continuing.",
      );
      return;
    }

    inFlightRef.current = true;
    setIsSubmitting(true);
    setMutationError(null);
    setMutationNotice(null);
    setRefreshWarning(null);

    let committedResult:
      SuperAdminControlledMembershipMutationResult;

    try {
      committedResult =
        await mutateMembershipStatusAtomically({
          actorUid:
            liveActorUid,

          targetUid:
            action.targetUid,

          academyId:
            action.academyId,

          action:
            action.action,

          expectedStatus:
            action.expectedStatus,

          expectedRole:
            action.expectedRole,

          expectedSource:
            action.expectedSource,
        });
    } catch (error) {
      setMutationError(
        mutationErrorMessage(
          error,
        ),
      );

      return;
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }

    setSelectedAction(null);

    setPostCommitLocked(true);

    setMutationNotice(
      `Membership changed from ${committedResult.previousStatus} to ${committedResult.newStatus}.`,
    );

    try {
      await onAuthoritativeRefresh();
    } catch (error) {
      console.error(
        "Membership mutation committed but authoritative relationship refresh failed:",
        error,
      );

      setRefreshWarning(
        "The Membership update was committed, but fresh relationship evidence could not be loaded. Actions remain locked until authoritative evidence changes or this view is reopened.",
      );
    }
  };

  if (
    model.availability === "BLOCKED"
  ) {
    return (
      <div
        data-controlled-membership-actions="blocked"
        className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
      >
        <div className="flex items-start gap-2">
          <ShieldAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-slate-500"
          />

          <div>
            <div className="text-xs font-bold text-slate-700">
              Controlled actions unavailable
            </div>

            <div className="mt-1 text-xs leading-relaxed text-slate-500">
              {model.blockedReason ||
                "This relationship evidence is not eligible for controlled Membership mutation."}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-controlled-membership-actions="available"
      className="mt-3 space-y-3 border-t border-slate-200 pt-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-700">
            <ShieldAlert className="h-4 w-4" />
            Controlled Membership Actions
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="max-w-full truncate rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-black text-white">
              {model.organizationName || model.academyId}
            </span>

            <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">
              {model.role}
            </span>
          </div>

          <div className="mt-1 break-all text-[10px] text-slate-400">
            Academy ID: {model.academyId}
          </div>

          <div className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Changes this exact Academy Membership status only.
            Account role and other Academy Memberships are not changed.
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600">
          {model.status}
        </div>
      </div>

      {supportModeActive && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
        >
          Exit Work As / support mode before changing Membership authority.
        </div>
      )}

      {(
        !actorIsActiveSuperAdmin ||
        !actorUidIsExact
      ) && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
        >
          An exact active SuperAdmin actor is required.
        </div>
      )}

      {mutationError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800"
        >
          {mutationError}
        </div>
      )}

      {mutationNotice && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{mutationNotice}</span>
        </div>
      )}

      {refreshWarning && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{refreshWarning}</span>
        </div>
      )}

      {!postCommitLocked && (
        <div className="flex flex-wrap gap-2">
          {model.actions.map(
            (action) => (
              <button
                type="button"
                key={[
                  action.action,
                  action.targetUid,
                  action.academyId,
                  action.expectedStatus,
                ].join(":")}
                onClick={() =>
                  openConfirmation(
                    action,
                  )
                }
                disabled={
                  !actionsEnabled ||
                  isSubmitting
                }
                className={[
                  "rounded-lg",
                  "border",
                  "px-3",
                  "py-2",
                  "text-xs",
                  "font-bold",
                  "transition",
                  "disabled:cursor-not-allowed",
                  "disabled:opacity-40",
                  actionButtonClass(
                    action,
                  ),
                ].join(" ")}
              >
                {action.label}
              </button>
            ),
          )}
        </div>
      )}

      {selectedAction && (
        <div
          data-membership-action-confirmation={
            selectedAction.action
          }
          className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-black text-slate-900">
                {
                  selectedAction.confirmationTitle
                }
              </div>

              <div className="mt-1 text-xs leading-relaxed text-slate-600">
                {
                  selectedAction.confirmationMessage
                }
              </div>
            </div>

            <button
              type="button"
              aria-label="Cancel controlled Membership action"
              onClick={
                cancelConfirmation
              }
              disabled={
                isSubmitting
              }
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="font-semibold text-slate-500">
                Academy
              </div>
              <div className="mt-1 break-words font-bold text-slate-900">
                {model.organizationName ||
                  model.academyId}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <div className="font-semibold text-slate-500">
                Membership Role
              </div>
              <div className="mt-1 font-bold text-slate-900">
                {
                  selectedAction.expectedRole
                }
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <div className="font-semibold text-slate-500">
                Current Status
              </div>
              <div className="mt-1 font-bold text-slate-900">
                {
                  selectedAction.expectedStatus
                }
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <div className="font-semibold text-slate-500">
                Target Status
              </div>
              <div className="mt-1 font-bold text-slate-900">
                {
                  selectedAction.targetStatus
                }
              </div>
            </div>
          </div>

          {(
            selectedAction.targetStatus ===
              "LEFT" ||
            selectedAction.targetStatus ===
              "REVOKED"
          ) && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

              <span>
                {selectedAction.targetStatus} is terminal in this controlled workflow.
                It cannot be reactivated through these actions.
              </span>
            </div>
          )}

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={
                cancelConfirmation
              }
              disabled={
                isSubmitting
              }
              className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() =>
                void confirmAction()
              }
              disabled={
                isSubmitting ||
                !actionsEnabled
              }
              className={[
                "inline-flex",
                "items-center",
                "gap-2",
                "rounded-xl",
                "px-4",
                "py-2",
                "text-xs",
                "font-black",
                "transition",
                "disabled:cursor-not-allowed",
                "disabled:opacity-40",
                confirmationButtonClass(
                  selectedAction,
                ),
              ].join(" ")}
            >
              {isSubmitting && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}

              {isSubmitting
                ? "Verifying authoritative Membership..."
                : `Confirm ${selectedAction.label}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}