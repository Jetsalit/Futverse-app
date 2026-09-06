# FutVerse Pro Club V1 — Live Staging Runbook

This runbook is for the isolated `integration/pro-club-v1` lane only.

## Non-negotiable boundary

- Production Firebase project `futverse-d7872` is never a staging target.
- Production branch `main` is not changed by this procedure.
- Firebase Hosting is not deployed by this procedure; frontend staging remains Vercel Preview.
- Backend deployment scope is exactly `firestore:rules,functions`.
- The repository `.firebaserc` may remain on the fail-closed sentinel. A real staging project must be supplied explicitly through `FIREBASE_STAGING_PROJECT_ID`.
- `FIREBASE_STAGING_PROJECT_ID` must equal `VITE_FIREBASE_PROJECT_ID` and must start with `futverse-staging-`.
- App Check configuration is required before live staging backend deployment.
- Functions deployment requires the staging project to use the Firebase Blaze plan. Enabling billing is an external account-side decision and is never automated by repository scripts.

## One-time bootstrap planner

Before creating any cloud resource, choose an explicit Firestore location and run the plan-only bootstrap helper:

```powershell
$env:FIREBASE_STAGING_PROJECT_ID = "futverse-staging-<unique-name>"
$env:FIREBASE_STAGING_FIRESTORE_LOCATION = "<chosen-supported-location>"
npm run plan:firebase-staging-bootstrap
```

The planner must report:

```text
FIREBASE_STAGING_BOOTSTRAP_PLAN=PASS
MUTATION_EXECUTED=NO
PRODUCTION_TARGET_ALLOWED=NO
FIREBASE_HOSTING_SETUP=NO
BLAZE_PLAN_REQUIRED_FOR_FUNCTIONS=YES
NEXT_PHASE=REVIEW_EXTERNAL_SETUP_PLAN_BEFORE_ANY_RESOURCE_CREATION
```

It only prints the reviewed setup sequence. It does not create a Firebase project, enable billing, create Firestore, register a Web App, enable Authentication, configure App Check or write Vercel settings.

Do not guess the Firestore location. Review supported locations and choose it deliberately before database creation. The planner includes Firestore delete protection in the planned database creation command.

## One-time external setup

After reviewing the bootstrap plan, create a separate Firebase project whose project id starts with `futverse-staging-`.

The setup sequence is:

1. Confirm the project id is not the production project.
2. Create the staging Firebase project.
3. Upgrade the staging project to Blaze and configure appropriate budget alerts before Functions deployment.
4. Create the default Firestore database in the explicitly selected location with delete protection enabled.
5. Create a staging Web App and retrieve its Firebase Web SDK configuration.
6. Enable only the Authentication providers needed for staging test users.
7. Register the staging Web App with Firebase App Check and configure a staging-only provider/site key.
8. Configure Vercel **Preview** environment values for branch `integration/pro-club-v1` only.
9. Use fake/test identities and data only.

Do not add staging values to Vercel Production and do not point any staging variable at production Firebase.

## Local environment

Copy `.env.staging.example` to an ignored local env file and replace all `CHANGE_ME` values with the real staging values. Never commit that file.

Required staging values:

- `VITE_FUTVERSE_ENV=staging`
- `FIREBASE_STAGING_PROJECT_ID`
- `FIREBASE_STAGING_FIRESTORE_LOCATION` for bootstrap planning only
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_RECAPTCHA_SITE_KEY`

The deployment guard additionally requires the exact staging Git SHA in `EXPECTED_STAGING_HEAD`.

## Readiness and plan-only gate

From `integration/pro-club-v1` with a clean working tree:

```powershell
$env:EXPECTED_STAGING_HEAD = (git rev-parse HEAD).Trim()
npm run verify:staging-live:app-check
npm run plan:staging-live-deploy
```

A valid plan must report:

```text
LIVE_STAGING_READINESS_GATE=PASS:APP_CHECK
LIVE_STAGING_DEPLOY_GATE=PASS
DEPLOY_SCOPE=firestore:rules,functions
FIREBASE_HOSTING_DEPLOY=NO
PRODUCTION_TARGET_ALLOWED=NO
LIVE_STAGING_DEPLOY_MODE=PLAN_ONLY
```

If any gate reports `BLOCKED`, do not deploy. Fix the reported staging issue and rerun the full gate.

## Controlled staging backend deployment

Only after the plan is reviewed and the exact HEAD is still unchanged:

```powershell
$env:STAGING_DEPLOY_CONFIRM = "DEPLOY_STAGING_ONLY"
npm run deploy:staging-live
```

The guard rechecks branch, exact HEAD, clean worktree, App Check readiness, project prefix, production collisions and project identity before executing Firebase CLI.

The only generated deployment command is equivalent to:

```text
firebase deploy --project <futverse-staging-...> --only firestore:rules,functions
```

It never deploys Firebase Hosting and never uses the repository default project as an implicit production fallback.

## Post-deploy live E2E

Use staging-only test accounts/data and verify at minimum:

1. OWNER/ADMIN reviewer access.
2. Active Staff Roster load.
3. Change Role.
4. Deactivate -> active roster removal.
5. Inactive lifecycle read.
6. Reactivate -> active roster return.
7. Mark Left -> terminal lifecycle state.
8. Reactivate after LEFT is rejected.
9. History remains append-only.
10. Client direct access to `staffManagementHistory` remains denied.
11. Cross-tenant/self/OWNER-target protections remain enforced.
12. Rate limiting and App Check rejection behavior.

Do not promote or merge to production as part of this runbook. Production promotion requires a separate impact/damage assessment and explicit authorization.
