# FutVerse Pro Club — Controlled Production Deploy Runbook V1

## Purpose
This runbook bridges the merged source-readiness gates and a future explicitly authorized Firebase production deployment for the Pro Club trusted control plane.

It does **not** authorize a deployment by itself. The real production Firebase App Check/reCAPTCHA site key stays outside Git, and no production credential belongs in this document or in source control.

## Current production source baseline
Start from an exact, clean `main` commit selected for deployment. Record the exact SHA before any environment configuration or deploy command. If `main` moves after review, stop and re-run the deploy-candidate gate on the new exact SHA.

## Reviewed production smoke targets
The credential-free smoke harness accepts only origins committed in `config/productionProClubSmokeTargets.json`. The config is pinned to Firebase project `futverse-d7872` and must retain the project-default Hosting origins:

- `https://futverse-d7872.web.app`
- `https://futverse-d7872.firebaseapp.com`

Do not point the smoke harness at an arbitrary HTTPS URL. If FutVerse adopts a custom production domain, add that exact origin to the target config through a reviewed PR before using it as production smoke evidence. Operator environment variables cannot extend the allowlist.

## Phase A — Read-only deploy-candidate gate
From the exact deploy-candidate checkout:

1. `npm ci`
2. `npm --prefix functions ci`
3. Configure the real `VITE_RECAPTCHA_SITE_KEY` only in the approved production environment/shell.
4. Ensure `VITE_APP_CHECK_DEBUG_TOKEN` is absent/empty.
5. `npm run test:production-deploy-readiness`
6. `npm run verify:production-deploy-readiness`
7. `npm run test:production-spark-hosting-boundary-smoke`
8. `npm run test:production-pro-club-boundary-smoke`
9. `npm run lint`
10. `npm --prefix functions run build`
11. `npm run build`
12. `git diff --check`
13. confirm the working tree is clean.

For a Spark Hosting-only candidate, also run
`npm run test:spark-production-readiness` and
`npm run verify:spark-production-readiness`. The latter verifies the reviewed
Hosting-only deployment config while preserving the future server rewrites in
`firebase.json`.

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
- the intended smoke/deploy origin is present in `config/productionProClubSmokeTargets.json`;
- the operator identity and Firebase CLI context are intentionally targeting production.

Do not paste the real site key, Firebase ID tokens, App Check tokens, service-account keys, or other credentials into PRs, issues, logs, screenshots, or this runbook.

## Phase C — Owner deployment gate
A production deployment is a separate write action. Require explicit owner authorization tied to the exact deploy-candidate SHA. General instructions to continue development, review, merge, or prepare production are not deployment authorization.

After authorization, use only the approved Firebase deployment scope and re-check the exact SHA immediately before execution. If the branch, SHA, project, or working tree differs from the approved candidate, stop.

## Phase D1 — Spark Hosting-only verification
Run this mode after an explicitly authorized deployment using
`firebase deploy --config firebase.spark.json --only hosting`. The reviewed Spark
configuration exposes only the SPA catch-all rewrite to `/index.html`; it does not
expose Cloud Functions, Cloud Run, or a protected Pro Club business API.

Choose exactly one origin from `config/productionProClubSmokeTargets.json`. The
smoke sends an empty JSON POST with **no Firebase ID token and no App Check token**
to all three protected path names:

- `/api/pro-club/provision-v1`
- `/api/pro-club/verify-audit-v1`
- `/api/pro-club/rename-v1`

PowerShell example using the project-default Hosting origin:

```powershell
$env:FUTVERSE_PRODUCTION_ORIGIN = "https://futverse-d7872.web.app"
$env:FUTVERSE_PRODUCTION_SMOKE_ACK = "READ_ONLY_NO_CREDENTIALS"
Remove-Item Env:FUTVERSE_PRODUCTION_ID_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:FUTVERSE_PRODUCTION_APP_CHECK_TOKEN -ErrorAction SilentlyContinue
npm run smoke:production-spark-hosting-boundary
```

Expected result in Spark Hosting-only mode:

- the reviewed HTTPS origin is used without credentials;
- no redirect or external location is followed;
- each protected path returns the exact reviewed Hosting behavior: HTTP `200`,
  `text/html`, and the recognizable built FutVerse SPA shell;
- no JSON success, JSON business error, or other evidence of a Pro Club handler
  executing is accepted;
- arbitrary or malformed HTML does not pass.

A PASS proves that the deployed Spark Hosting boundary matches the reviewed
Hosting-only architecture. It does not prove App Check enforcement by a server,
because no production server control-plane route is exposed in this mode.

## Phase D2 — Server control-plane credential-free smoke
Run this mode only after the future Functions/server control plane in
`firebase.json` has been deployed through a separate, explicit authorization. Do
not run D2 after a Spark Hosting-only deployment.

```powershell
$env:FUTVERSE_PRODUCTION_ORIGIN = "https://futverse-d7872.web.app"
$env:FUTVERSE_PRODUCTION_SMOKE_ACK = "READ_ONLY_NO_CREDENTIALS"
Remove-Item Env:FUTVERSE_PRODUCTION_ID_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:FUTVERSE_PRODUCTION_APP_CHECK_TOKEN -ErrorAction SilentlyContinue
npm run smoke:production-pro-club-boundary
```

Expected result for all three protected server routes:

- HTTP `401`;
- JSON response;
- `error.code = ERROR_APP_CHECK_REQUIRED`;
- no redirect;
- no credentials sent;
- no Firestore write path reached.

In server-control-plane mode, App Check is verified before the business handler.
On the rename path, Firebase authentication occurs before request validation, and
ACTIVE SUPERADMIN authority is transactionally revalidated before any Firestore
write. A PASS proves only this public fail-closed boundary for the reviewed
production origin; it does not prove a successful authenticated operation.

## Phase E — Authenticated production smoke (separate controlled action)
Only after the credential-free smoke passes should a separately authorized authenticated smoke be performed. That later check must cover the rename endpoint, use a known ACTIVE SUPERADMIN, a valid App Check token from the approved production app, deterministic test identities, and an explicitly reviewed non-destructive/idempotent plan.

Do not improvise a real Pro Club creation or rename a real Pro Club as a smoke test. Authenticated rename verification must use either a separately reviewed non-destructive failure path or a dedicated disposable fixture plan. Successful production provisioning should use the approved operational workflow and recorded audit evidence. Nothing in this runbook authorizes deployment.

## Stop conditions
Stop immediately if any of the following occurs:

- exact deploy-candidate SHA changed;
- readiness gate fails;
- real production site key is missing, placeholder-like, padded, or paired with a debug token;
- Firebase project is not exactly `futverse-d7872`;
- production origin is absent from the reviewed production smoke target config;
- the D1 Spark smoke returns anything other than the reviewed FutVerse SPA
  Hosting fallback, exposes a JSON business response, or redirects;
- the D2 server smoke returns anything other than the privacy-safe App Check
  `401` contract;
- D2 is selected after a Spark Hosting-only deployment;
- authenticated verification would require exposing credentials or bypassing the normal SuperAdmin control plane.

## Current status
The current production architecture is Spark Hosting-only. Its deployed boundary
must be verified with Phase D1. The future server control-plane rewrites remain
preserved in `firebase.json`, but Phase D2 is deferred until that server scope is
separately reviewed, authorized, and deployed. Nothing in this runbook authorizes
either deployment mode.
