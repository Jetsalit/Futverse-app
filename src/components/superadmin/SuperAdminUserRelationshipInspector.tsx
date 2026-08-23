import type {
  SuperAdminAccountOrganizationContext,
} from "./superAdminAccountOrganizationContext";

import {
  buildSuperAdminUserRelationshipInspectorModel,
} from "./superAdminUserRelationshipInspectorModel";

import SuperAdminControlledMembershipActions from "./SuperAdminControlledMembershipActions";

import {
  buildSuperAdminControlledMembershipActionPresentation,
} from "./superAdminControlledMembershipActionPresentation";

import { useAuth } from "../../contexts/AuthContext";

import {
  isExactActiveSuperAdmin,
} from "../../lib/superAdminSupportModel";

import type {
  SuperAdminUserRelationshipRow,
} from "../../lib/superAdminRelationshipReadModel";

interface SuperAdminUserRelationshipInspectorProps {
  userId: string;
  context: SuperAdminAccountOrganizationContext;
  row?: SuperAdminUserRelationshipRow;
  onRefresh: () => Promise<void>;
  onMutationRefresh: () => Promise<void>;
}

type InspectorModel =
  ReturnType<typeof buildSuperAdminUserRelationshipInspectorModel>;

type RelationshipItem =
  InspectorModel["currentEvidence"][number];

function valueOrFallback(
  value: unknown,
  fallback = "Not recorded",
): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if (Array.isArray(value) && value.length > 0) {
    return value.map(String).join(" · ");
  }

  if (value && typeof value === "object") {
    return "Recorded";
  }

  return fallback;
}

function RelationshipCard({
  item,
}: {
  item: RelationshipItem;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-900">
            {item.organizationName || item.organizationId}
          </div>
          <div className="mt-1 break-all text-[11px] text-slate-500">
            {item.organizationId}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">
            {item.organizationType}
          </span>
          <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">
            {item.role}
          </span>
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
            {item.status}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div>
          <div className="font-semibold text-slate-500">
            Evidence
          </div>
          <div className="mt-0.5 text-slate-800">
            {item.evidenceKind}
          </div>
        </div>

        <div>
          <div className="font-semibold text-slate-500">
            Membership Source
          </div>
          <div className="mt-0.5 break-all text-slate-800">
            {valueOrFallback(item.membershipSource)}
          </div>
        </div>

        {item.playerId ? (
          <div>
            <div className="font-semibold text-slate-500">
              Player ID
            </div>
            <div className="mt-0.5 break-all text-slate-800">
              {item.playerId}
            </div>
          </div>
        ) : null}

        {item.futId ? (
          <div>
            <div className="font-semibold text-slate-500">
              FUTID
            </div>
            <div className="mt-0.5 break-all text-slate-800">
              {item.futId}
            </div>
          </div>
        ) : null}

        {item.playerName ? (
          <div className="sm:col-span-2">
            <div className="font-semibold text-slate-500">
              Player
            </div>
            <div className="mt-0.5 text-slate-800">
              {item.playerName}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RelationshipList({
  items,
  emptyMessage,
}: {
  items: RelationshipItem[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <RelationshipCard
          key={[
            item.organizationId,
            item.role,
            item.status,
            item.playerId || "",
            index,
          ].join(":")}
          item={item}
        />
      ))}
    </div>
  );
}

export default function SuperAdminUserRelationshipInspector({
  userId,
  context,
  row,
  onRefresh,
  onMutationRefresh,
}: SuperAdminUserRelationshipInspectorProps) {
  const { actualUser } = useAuth();

  const model =
    buildSuperAdminUserRelationshipInspectorModel({
      userId,
      context,
      row,
    });

  const actorIsActiveSuperAdmin =
    isExactActiveSuperAdmin(actualUser);

  const controlledMembershipActionModels =
    model.currentEvidence
      .map((item) =>
        buildSuperAdminControlledMembershipActionPresentation({
          actorIsActiveSuperAdmin,
          userId: model.userId,
          relationshipSource: model.source,
          integrity: model.integrity,
          item,
        }),
      )
      .filter(
        (candidate) =>
          candidate.availability === "AVAILABLE",
      );

  const refreshButton = (
    <button
      type="button"
      onClick={() => void onRefresh()}
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
    >
      Refresh relationship evidence
    </button>
  );

  if (model.state === "LOADING") {
    return (
      <section
        data-state="LOADING"
        className="mt-4 rounded-2xl border border-slate-200 bg-white p-4"
      >
        <div className="text-sm font-bold text-slate-900">
          Organization Relationships
        </div>
        <div className="mt-2 text-xs text-slate-500">
          Loading authoritative relationship evidence…
        </div>
      </section>
    );
  }

  if (model.state === "UNAVAILABLE") {
    return (
      <section
        data-state="UNAVAILABLE"
        className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"
      >
        <div className="text-sm font-bold text-amber-900">
          Relationship evidence unavailable
        </div>
        <div className="mt-2 text-xs text-amber-800">
          No organization authority is asserted while authoritative evidence is unavailable.
        </div>
        <div className="mt-3">
          {refreshButton}
        </div>
      </section>
    );
  }

  if (model.state === "OUT_OF_SYNC") {
    return (
      <section
        data-state="OUT_OF_SYNC"
        className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"
      >
        <div className="text-sm font-bold text-amber-900">
          Relationship evidence needs refresh
        </div>
        <div className="mt-2 text-xs text-amber-800">
          {model.reason ||
            "The selected account does not match the relationship snapshot."}
        </div>
        <div className="mt-3">
          {refreshButton}
        </div>
      </section>
    );
  }

  if (model.state === "READY") {
    return (
      <section
        data-state="READY"
        className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-900">
              Organization Relationships
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Read-only relationship and authority evidence for this exact account.
            </div>
          </div>
          {refreshButton}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="font-semibold text-slate-500">
              Source
            </div>
            <div className="mt-1 font-bold text-slate-800">
              {model.source || "UNASSIGNED"}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <div className="font-semibold text-slate-500">
              Integrity
            </div>
            <div className="mt-1 font-bold text-slate-800">
              {model.integrity || "UNASSIGNED"}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="font-bold text-slate-800">
            Authority Coverage
          </div>
          <div className="mt-2">
            Academy:{" "}
            <strong>{model.coverage.academyAuthority}</strong>
          </div>
          <div className="mt-1">
            Pro Club:{" "}
            <strong>{model.coverage.proClubAuthority}</strong>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">
            Current Authority
          </div>

          {model.authorityState === "UNRESOLVED_CONFLICT" ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <div className="text-sm font-bold text-red-800">
                Authority unresolved
              </div>
              <div className="mt-1 text-xs text-red-700">
                Conflicting canonical evidence remains inspectable, but no organization authority is asserted as resolved.
              </div>
            </div>
          ) : (
            <RelationshipList
              items={model.resolvedAuthority}
              emptyMessage="No resolved current organization authority."
            />
          )}
        </div>

        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">
            Current Evidence
          </div>
          <RelationshipList
            items={model.currentEvidence}
            emptyMessage="No current canonical relationship evidence."
          />
        </div>

        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">
            Controlled Membership Actions
          </div>

          {controlledMembershipActionModels.length > 0 ? (
            <div className="space-y-3">
              {controlledMembershipActionModels.map(
                (actionModel) => (
                  <SuperAdminControlledMembershipActions
                    key={[
                      actionModel.academyId,
                      actionModel.role,
                      actionModel.status,
                      actionModel.membershipSource || "",
                    ].join(":")}
                    model={actionModel}
                    onAuthoritativeRefresh={onMutationRefresh}
                  />
                ),
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              No controlled Membership actions are available from the current verified canonical Academy staff Membership evidence.
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">
            Historical Relationships
          </div>
          <RelationshipList
            items={model.historical}
            emptyMessage="No historical organization relationships."
          />
        </div>

        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">
            Legacy Evidence
          </div>

          {model.legacyEvidence ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
              <div>
                academyId: {valueOrFallback(model.legacyEvidence.academyId)}
              </div>
              <div>
                activeAcademyId: {valueOrFallback(model.legacyEvidence.activeAcademyId)}
              </div>
              <div>
                tenantRole: {valueOrFallback(model.legacyEvidence.tenantRole)}
              </div>
              <div>
                linkedPlayerId: {valueOrFallback(model.legacyEvidence.linkedPlayerId)}
              </div>
              <div>
                assignedClients: {valueOrFallback(model.legacyEvidence.assignedClients)}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              No legacy relationship evidence.
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">
            Integrity Issues
          </div>

          {model.issues.length ? (
            <div className="space-y-2">
              {model.issues.map((issue) => (
                <div
                  key={issue}
                  className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
                >
                  {issue}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              No integrity issues recorded.
            </div>
          )}
        </div>

        <div className="rounded-xl bg-slate-50 p-3 text-xs">
          <div className="font-semibold text-slate-500">
            Last known account activity
          </div>
          <div className="mt-1 text-slate-800">
            {valueOrFallback(model.lastKnownAccountActivity)}
          </div>
        </div>
      </section>
    );
  }

  return null;
}