import { useMemo, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, ShieldCheck, X } from "lucide-react";
import {
  ProClubControlPlaneApiError,
  provisionProClubFromControlPlane,
  verifyProClubProvisioningAuditFromControlPlane,
  type ProClubLevel,
  type ProvisionProClubControlPlaneResult,
  type VerifyProvisioningAuditResult,
} from "../../lib/proClubProvisioningControlPlaneApi";

interface ProClubProvisioningControlPlaneProps {
  onClose: () => void;
}

function generateProvisioningId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `pcp_${crypto.randomUUID()}`;
  }
  return `pcp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function ProClubProvisioningControlPlane({
  onClose,
}: ProClubProvisioningControlPlaneProps) {
  const [provisioningId, setProvisioningId] = useState(generateProvisioningId);
  const [clubId, setClubId] = useState("");
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [level, setLevel] = useState<ProClubLevel>("T3");
  const [country, setCountry] = useState("TH");
  const [logoUrl, setLogoUrl] = useState("");
  const [initialOwnerUid, setInitialOwnerUid] = useState("");
  const [verifyId, setVerifyId] = useState("");
  const [busy, setBusy] = useState<"provision" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provisionResult, setProvisionResult] =
    useState<ProvisionProClubControlPlaneResult | null>(null);
  const [verificationResult, setVerificationResult] =
    useState<VerifyProvisioningAuditResult | null>(null);

  const canSubmitProvision = useMemo(
    () =>
      provisioningId.trim().length > 0 &&
      clubId.trim().length > 0 &&
      name.trim().length > 0 &&
      initialOwnerUid.trim().length > 0 &&
      busy === null,
    [provisioningId, clubId, name, initialOwnerUid, busy],
  );

  const presentError = (caught: unknown, fallback: string) => {
    if (caught instanceof ProClubControlPlaneApiError) {
      setError(`${caught.code}: ${caught.message}`);
      return;
    }
    setError(fallback);
  };

  const handleProvision = async () => {
    if (!canSubmitProvision) return;
    setBusy("provision");
    setError(null);
    setProvisionResult(null);
    setVerificationResult(null);

    try {
      const result = await provisionProClubFromControlPlane({
        provisioningId,
        clubId,
        name,
        shortName,
        level,
        country,
        logoUrl,
        initialOwnerUid,
      });
      setProvisionResult(result);
      setVerifyId(result.provisioningId);
    } catch (caught) {
      presentError(caught, "Unable to provision Pro Club.");
    } finally {
      setBusy(null);
    }
  };

  const handleVerify = async () => {
    setBusy("verify");
    setError(null);
    setVerificationResult(null);

    try {
      const result =
        await verifyProClubProvisioningAuditFromControlPlane(verifyId);
      setVerificationResult(result);
    } catch (caught) {
      presentError(caught, "Unable to verify provisioning audit.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-7">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-700">
              <ShieldCheck size={16} />
              Privileged Control Plane
            </div>
            <h1 className="text-xl font-black text-slate-950 sm:text-2xl">
              Pro Club Provisioning V1
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              This interface calls trusted server endpoints only. It never writes Pro Club,
              OWNER membership, or provisioning-audit documents directly from the browser.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={busy !== null}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Close Pro Club control plane"
          >
            <X size={20} />
          </button>
        </header>

        <div className="grid flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[1.35fr_0.8fr] lg:p-7">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5">
              <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                Create only
              </div>
              <h2 className="mt-1 text-lg font-black text-slate-900">
                Provision a canonical Pro Club
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                The server re-verifies the authenticated ACTIVE SUPERADMIN, the initial owner,
                exact schemas, and 3-way atomicity before any write can commit.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="text-xs font-bold text-slate-600">Provisioning ID</span>
                <div className="mt-1 flex gap-2">
                  <input
                    value={provisioningId}
                    onChange={(event) => setProvisioningId(event.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                  <button
                    type="button"
                    onClick={() => setProvisioningId(generateProvisioningId())}
                    disabled={busy !== null}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  >
                    New ID
                  </button>
                </div>
              </label>

              <label>
                <span className="text-xs font-bold text-slate-600">Club ID</span>
                <input
                  value={clubId}
                  onChange={(event) => setClubId(event.target.value)}
                  placeholder="lampang-fc"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label>
                <span className="text-xs font-bold text-slate-600">Initial OWNER UID</span>
                <input
                  value={initialOwnerUid}
                  onChange={(event) => setInitialOwnerUid(event.target.value)}
                  placeholder="Firebase UID"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="sm:col-span-2">
                <span className="text-xs font-bold text-slate-600">Club name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Lampang Football Club"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label>
                <span className="text-xs font-bold text-slate-600">Short name</span>
                <input
                  value={shortName}
                  onChange={(event) => setShortName(event.target.value)}
                  placeholder="LAMPANG"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label>
                <span className="text-xs font-bold text-slate-600">Level</span>
                <select
                  value={level}
                  onChange={(event) => setLevel(event.target.value as ProClubLevel)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="T1">T1</option>
                  <option value="T2">T2</option>
                  <option value="T3">T3</option>
                </select>
              </label>

              <label>
                <span className="text-xs font-bold text-slate-600">Country</span>
                <input
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  placeholder="TH"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label>
                <span className="text-xs font-bold text-slate-600">Logo URL (optional)</span>
                <input
                  value={logoUrl}
                  onChange={(event) => setLogoUrl(event.target.value)}
                  placeholder="https://..."
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={handleProvision}
              disabled={!canSubmitProvision}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "provision" ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <KeyRound size={17} />
              )}
              Execute trusted provisioning
            </button>

            {provisionResult && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="flex items-center gap-2 font-black">
                  <CheckCircle2 size={17} />
                  {provisionResult.isReplay ? "Verified idempotent replay" : "Provisioning completed"}
                </div>
                <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <div><dt className="font-bold text-emerald-700">Club</dt><dd>{provisionResult.clubId}</dd></div>
                  <div><dt className="font-bold text-emerald-700">Owner UID</dt><dd className="break-all">{provisionResult.ownerUid}</dd></div>
                  <div><dt className="font-bold text-emerald-700">Provisioning ID</dt><dd className="break-all">{provisionResult.provisioningId}</dd></div>
                  <div><dt className="font-bold text-emerald-700">Created</dt><dd>{provisionResult.createdAt}</dd></div>
                </dl>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
              Independent verification
            </div>
            <h2 className="mt-1 text-lg font-black text-slate-900">
              Verify provisioning audit
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Exact-get only. The trusted backend validates the stored audit, fingerprint,
              canonical ACTIVE club, and exact ACTIVE OWNER in one consistent snapshot.
            </p>

            <label className="mt-5 block">
              <span className="text-xs font-bold text-slate-600">Provisioning ID</span>
              <input
                value={verifyId}
                onChange={(event) => setVerifyId(event.target.value)}
                placeholder="pcp_..."
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <button
              type="button"
              onClick={handleVerify}
              disabled={!verifyId.trim() || busy !== null}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "verify" ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />}
              Verify trusted audit
            </button>

            {verificationResult && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="flex items-center gap-2 font-black">
                  <CheckCircle2 size={17} /> Audit VERIFIED
                </div>
                <dl className="mt-3 space-y-2 text-xs">
                  <div><dt className="font-bold text-emerald-700">Club ID</dt><dd>{verificationResult.clubId}</dd></div>
                  <div><dt className="font-bold text-emerald-700">OWNER UID</dt><dd className="break-all">{verificationResult.ownerUid}</dd></div>
                  <div><dt className="font-bold text-emerald-700">Created</dt><dd>{verificationResult.createdAt}</dd></div>
                </dl>
              </div>
            )}

            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
              <strong>Boundary:</strong> UI visibility is presentation only. Server-side token verification
              and canonical ACTIVE SUPERADMIN authorization remain mandatory for every request.
            </div>
          </section>
        </div>

        {error && (
          <div className="border-t border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-800 sm:px-7" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
