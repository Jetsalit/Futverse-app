import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  Building2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  firestoreSuperAdminRelationshipReadOps,
  loadSuperAdminRelationshipInventory,
  type SuperAdminRelationshipInventory,
} from "../../lib/firestore/superAdminRelationshipReadAdapter";
import type {
  SuperAdminOrganizationRelationship,
  SuperAdminUserRelationshipRow,
} from "../../lib/superAdminRelationshipReadModel";

type RelationshipLoadState = "loading" | "ready" | "unavailable";

function sourceBadgeClass(source: SuperAdminUserRelationshipRow["source"]) {
  switch (source) {
    case "CANONICAL":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "LEGACY_COMPATIBLE":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function integrityBadgeClass(
  integrity: SuperAdminUserRelationshipRow["integrity"],
) {
  switch (integrity) {
    case "VERIFIED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "REVIEW_REQUIRED":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "CONFLICT":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function relationshipLabel(
  relationship: SuperAdminOrganizationRelationship,
): string {
  const organization =
    relationship.organizationName || relationship.organizationId;

  if (
    relationship.relationship === "PARENT" &&
    relationship.playerId
  ) {
    return `PARENT → Player ${relationship.playerId} → ${organization}`;
  }

  if (
    relationship.relationship === "PLAYER" &&
    relationship.playerId
  ) {
    return `PLAYER ${relationship.playerId} → ${organization}`;
  }

  return `${relationship.relationship} → ${organization}`;
}

function rowMatchesQuery(
  row: SuperAdminUserRelationshipRow,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) return true;

  const values = [
    row.userId,
    row.name,
    row.email,
    row.accountRole,
    row.accountStatus,
    row.source,
    row.integrity,
    ...row.organizations.flatMap((relationship) => [
      relationship.organizationId,
      relationship.organizationName,
      relationship.relationship,
      relationship.relationshipStatus,
      relationship.playerId,
    ]),
    ...row.issues,
  ];

  return values.some(
    (value) =>
      typeof value === "string" &&
      value.toLowerCase().includes(normalizedQuery),
  );
}

export default function SuperAdminUsersRelationships() {
  const [loadState, setLoadState] =
    useState<RelationshipLoadState>("loading");
  const [inventory, setInventory] =
    useState<SuperAdminRelationshipInventory | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const requestIdRef = useRef(0);

  const loadInventory = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    setLoadState("loading");
    setErrorMessage(null);

    const result = await loadSuperAdminRelationshipInventory(
      firestoreSuperAdminRelationshipReadOps,
    );

    if (requestId !== requestIdRef.current) return;

    if (result.state === "UNAVAILABLE") {
      setInventory(null);
      setErrorMessage(result.error.message);
      setLoadState("unavailable");
      return;
    }

    setInventory(result.inventory);
    setLoadState("ready");
  }, []);

  useEffect(() => {
    void loadInventory();

    return () => {
      requestIdRef.current += 1;
    };
  }, [loadInventory]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return (inventory?.rows ?? []).filter((row) =>
      rowMatchesQuery(row, normalizedQuery),
    );
  }, [inventory, searchQuery]);

  const reviewRequiredCount = useMemo(
    () =>
      (inventory?.rows ?? []).filter(
        (row) =>
          row.integrity === "REVIEW_REQUIRED" ||
          row.integrity === "CONFLICT",
      ).length,
    [inventory],
  );

  return (
    <section className="space-y-5" aria-labelledby="relationships-title">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <h2
              id="relationships-title"
              className="text-xl font-black tracking-tight text-slate-900"
            >
              Users & Relationships
            </h2>
          </div>

          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Read-only authoritative relationship inventory. Canonical
            Membership and player association evidence remains the authority;
            this view does not rewrite source records or grant access.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadInventory()}
          disabled={loadState === "loading"}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadState === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh authoritative inventory
        </button>
      </div>

      {loadState === "loading" && (
        <div
          className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm font-medium text-blue-800"
          role="status"
        >
          <Loader2 className="h-5 w-5 animate-spin" />
          Reading authoritative account and relationship sources from the
          server...
        </div>
      )}

      {loadState === "unavailable" && (
        <div
          className="rounded-2xl border border-rose-200 bg-rose-50 p-5"
          role="alert"
        >
          <div className="flex items-center gap-2 font-bold text-rose-800">
            <AlertTriangle className="h-5 w-5" />
            Relationship inventory unavailable
          </div>
          <p className="mt-2 text-sm text-rose-700">
            The inventory failed closed. No partial relationship inventory is
            being presented as complete.
          </p>
          {errorMessage && (
            <p className="mt-2 break-words text-xs text-rose-600">
              {errorMessage}
            </p>
          )}
        </div>
      )}

      {loadState === "ready" && inventory && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                <UserRound className="h-4 w-4" />
                Current Accounts
              </div>
              <div className="mt-2 text-3xl font-black text-slate-900">
                {inventory.rows.length}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                <Building2 className="h-4 w-4" />
                Inventory Coverage
              </div>
              <div className="mt-2 text-sm font-black text-emerald-700">
                {inventory.isCompleteForCurrentAccounts
                  ? "Complete for current accounts"
                  : "Partial / review required"}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                <AlertTriangle className="h-4 w-4" />
                Integrity Review
              </div>
              <div className="mt-2 text-3xl font-black text-amber-600">
                {reviewRequiredCount}
              </div>
            </div>
          </div>

          {inventory.warnings.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <div className="font-bold">Inventory warnings</div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {inventory.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <div className="relative max-w-xl">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search user, email, organization, role, player ID or integrity..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="p-4">Account</th>
                    <th className="p-4">Relationships</th>
                    <th className="p-4">Source</th>
                    <th className="p-4">Integrity</th>
                    <th className="p-4">Issues</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-10 text-center text-slate-500"
                      >
                        No relationship rows match the current search.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr
                        key={row.userId}
                        className="align-top hover:bg-slate-50/60"
                      >
                        <td className="p-4">
                          <div className="font-bold text-slate-900">
                            {row.name || row.email || row.userId}
                          </div>
                          {row.email && row.name && (
                            <div className="mt-1 text-xs text-slate-500">
                              {row.email}
                            </div>
                          )}
                          <div className="mt-1 break-all font-mono text-[10px] text-slate-400">
                            {row.userId}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {row.accountRole && (
                              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">
                                Account: {row.accountRole}
                              </span>
                            )}
                            {row.accountStatus && (
                              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">
                                {row.accountStatus}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="p-4">
                          {row.organizations.length === 0 ? (
                            <span className="text-slate-400">
                              No canonical organization relationship
                            </span>
                          ) : (
                            <div className="space-y-2">
                              {row.organizations.map(
                                (relationship, index) => (
                                  <div
                                    key={`${relationship.organizationId}-${relationship.relationship}-${relationship.playerId || "staff"}-${index}`}
                                    className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                                  >
                                    <div className="font-bold text-slate-800">
                                      {relationshipLabel(relationship)}
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-bold">
                                      <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-600">
                                        {relationship.relationshipStatus}
                                      </span>
                                      <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-600">
                                        {relationship.evidenceKind}
                                      </span>
                                      {!relationship.isCurrent && (
                                        <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-500">
                                          Historical
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ),
                              )}
                            </div>
                          )}
                        </td>

                        <td className="p-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${sourceBadgeClass(
                              row.source,
                            )}`}
                          >
                            {row.source}
                          </span>

                          {row.legacyEvidence && (
                            <div className="mt-2 max-w-xs text-xs text-slate-500">
                              Legacy compatibility evidence exists for review;
                              it is not authorization authority.
                            </div>
                          )}
                        </td>

                        <td className="p-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${integrityBadgeClass(
                              row.integrity,
                            )}`}
                          >
                            {row.integrity}
                          </span>
                        </td>

                        <td className="p-4">
                          {row.issues.length === 0 ? (
                            <span className="text-slate-400">None</span>
                          ) : (
                            <ul className="max-w-sm list-disc space-y-1 pl-4 text-xs text-amber-800">
                              {row.issues.map((issue) => (
                                <li key={issue}>{issue}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
