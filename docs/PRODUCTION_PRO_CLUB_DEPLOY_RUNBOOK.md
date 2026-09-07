# FutVerse Pro Club — Controlled Production Deploy Runbook V1

## Purpose
This runbook bridges the merged source-readiness gates and a future explicitly authorized Firebase production deployment for the Pro Club trusted control plane.

It does **not** authorize a deployment by itself. The real production Firebase App Check/reCAPTCHA site key stays outside Git, and no production credential belongs in this document or in source control.

## Current production source baseline
Start from an exact, clean `main` commit selected for deployment. Record the exact SHA before any environment configuration or deploy command. If `main` moves after review, stop and re-run the deploy-candidate gate on the new exact SHA.

## Phase A — Read-only deploy-candidate gate
From the exact deploy-candidate checkout:

1. `npm ci`
2. `npm --prefix functions ci`
3. Configure the real `VITE_RECAPTCHA_SITE_KEY` only in the approved production environment/shell.
4. Ensure `VITE_APP_CHECK_DEBUG_TOKEN` is absent/empty.
5. `npm run test:production-deploy-readiness`
6. `npm run verify:production-deploy-readiness`
7. `npm run lint`
8. `npm --prefix functions run build`
9. `npm run build`
10. `git diff --check`
11. confirm the working tree is clean.

`verify:production-deploy-readiness` must preserve three ordered layers:

1. canonical production App Check environment guard;
2. canonical Pro Club App Check source-boundary contract;
3. structural production deploy-readiness gate.

Any failure is a hard stop. Do not bypass a failed gate with a manual Firebase deploy.

## Phase B — External production configuration gate
Before deployment, verify outside Git that:

- the production web app is registered for Firebase App Check/reCAPTCHA;
- the configured site key is the real production key for the approved web origin;
- no App Check debug token is present in the production build environment;
- the Firebase project is exactly `futverse-d7872`;
- the operator identity and Firebase CLI context are intentionally targeting production.

Do not paste the real site key, Firebase ID tokens, App Check tokens, service-account keys, or other credentials into PRs, issues, logs, screenshots, or this runbook.

## Phase C — Owner deployment gate
A production deployment is a separate write action. Require explicit owner authorization tied to the exact deploy-candidate SHA. General instructions to continue development, review, merge, or prepare production are not deployment authorization.

After authorization, use only the approved Firebase deployment scope and re-check the exact SHA immediately before execution. If the branch, SHA, project, or working tree differs from the approved candidate, stop.

## Phase D — Immediate credential-free boundary smoke
After a production deployment, first run the non-destructive public-boundary smoke harness. It intentionally sends **no Firebase ID token and no App Check token** and therefore cannot create a Pro Club. Even if the App Check layer were unexpectedly absent, the provisioning service verifies authorization before request validation or Firestore writes.

PowerShell example:

```powershell
$env:FUTVERSE_PRODUCTION_ORIGIN = "https://<approved-production-origin>"
$env:FUTVERSE_PRODUCTION_SMOKE_ACK = "READ_ONLY_NO_CREDENTIALS"
Remove-Item Env:FUTVERSE_PRODUCTION_ID_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:FUTVERSE_PRODUCTION_APP_CHECK_TOKEN -ErrorAction SilentlyContinue
npm run smoke:production-pro-club-boundary
```

Expected result for both protected paths:

- HTTP `401`;
- JSON response;
- `error.code = ERROR_APP_CHECK_REQUIRED`;
- no redirect to the SPA;
- no credentials sent;
- no Firestore write path reached.

The harness checks:

- `/api/pro-club/provision-v1`
- `/api/pro-club/verify-audit-v1`

A PASS proves only the public fail-closed App Check boundary and Hosting routing. It does **not** prove successful authenticated SuperAdmin provisioning or authenticated audit verification.

## Phase E — Authenticated production smoke (separate controlled action)
Only after the credential-free smoke passes should a separately authorized authenticated smoke be performed. That later check must use a known ACTIVE SUPERADMIN, a valid App Check token from the approved production app, deterministic test identities, and an explicitly reviewed non-destructive/idempotent plan.

Do not improvise a real Pro Club creation as a smoke test. Successful production provisioning should use the approved operational workflow and recorded audit evidence.

## Stop conditions
Stop immediately if any of the following occurs:

- exact deploy-candidate SHA changed;
- readiness gate fails;
- real production site key is missing, placeholder-like, padded, or paired with a debug token;
- Firebase project is not exactly `futverse-d7872`;
- production origin is not the approved HTTPS origin;
- credential-free smoke returns anything other than the privacy-safe App Check `401` contract;
- authenticated verification would require exposing credentials or bypassing the normal SuperAdmin control plane.

## Current status
Source readiness is merged. Production deployment remains blocked until the external App Check production configuration is verified and the owner explicitly authorizes the exact deployment action.
