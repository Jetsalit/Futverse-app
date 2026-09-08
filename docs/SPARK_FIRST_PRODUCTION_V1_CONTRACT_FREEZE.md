# FutVerse Spark-First Production V1 — Contract Freeze

## Status and non-negotiable constraint

FutVerse remains on the Firebase **Spark (no-cost) plan until the product has revenue**.

This is a hard product and architecture constraint, not a temporary deployment suggestion. During this phase:

- do not upgrade the Firebase project to Blaze merely to enable Cloud Functions;
- do not bypass security boundaries by moving privileged Admin SDK logic into the browser;
- do not weaken Firestore Rules, account-status gates, organization authority, App Check, or identity verification;
- do not force-push, destructively reset, or overwrite frozen contracts;
- do not deploy production without a separately recorded owner authorization tied to an exact reviewed SHA.

The reviewed source baseline for this contract is:

`c76d728bc4c79825a0c2f317bd22c22d8c82d428`

## Why a separate Spark deployment boundary exists

The reviewed `firebase.json` contains the future Pro Club server control plane: Firebase Functions plus same-origin Hosting rewrites for privileged Pro Club operations. That configuration is preserved unchanged for the later revenue/Blaze phase.

Spark cannot deploy that Functions control plane. Therefore Spark production uses a separate configuration file, `firebase.spark.json`, whose deploy surface is intentionally restricted to Firebase Hosting only.

`firebase.spark.json` must:

1. contain `hosting` as its only top-level deploy resource;
2. serve the production Vite build from `dist`;
3. run the canonical production App Check environment guard before `npm run build`;
4. expose only the SPA catch-all rewrite to `/index.html`;
5. contain no Cloud Functions, Cloud Run, Firestore Rules, Storage, or other deploy resources;
6. contain no `/api/pro-club/*` rewrite pretending that a server control plane exists on Spark.

## Security architecture during the Spark phase

### Browser/client responsibilities

The browser may perform only operations already authorized by Firebase Authentication, App Check where enabled, and Firestore Security Rules.

Client presentation state is never authority. Existing canonical user status, organization membership, Pro Club authority, invitation/claim, and reviewer checks remain authoritative.

### Privileged Pro Club operations

Privileged operations must not be reimplemented as direct browser writes merely because Cloud Functions are unavailable on Spark.

The repository already contains a trusted local operator foundation:

- `scripts/lib/localTrustedOperatorVerifier.ts`
- `scripts/provisionProClubLocal.ts`

The local provisioning adapter reuses the production provisioning service, pins the Firebase project to `futverse-d7872`, binds operator identity to `FUTVERSE_LOCAL_OPERATOR_UID`, rejects caller/CLI requester overrides, revalidates ACTIVE SUPERADMIN authority inside the provisioning transaction, supports dry-run, and preserves idempotency.

This existing local path is the approved foundation for **operator-side provisioning development**, but this contract does not by itself authorize a production write.

Other Function-backed capabilities — including production audit verification, rename, and staff-candidate resolution — remain unavailable through the public Spark web app until a separately reviewed trusted-local adapter or another equally strong non-browser boundary is implemented.

### Staff onboarding split

The Firestore Rules-backed invitation, claim, membership, and reviewer flows remain valid architecture on Spark. The email-to-account candidate lookup currently depends on `resolveProClubStaffCandidateV1` and therefore must be presentation-gated while that callable is unavailable. It must not be replaced by a client-side user-directory search.

## Preservation of the future server control plane

The original `firebase.json`, Functions source, App Check server gates, privileged HTTP contracts, and same-origin API rewrites are preserved for the post-revenue phase.

Spark-first work must be additive and capability-gated. It must not regress or delete the reviewed Functions implementation simply because it cannot currently be deployed on Spark.

## Slice plan

### Slice 1 — Contract and deployment boundary

Scope:

- add `firebase.spark.json`;
- add structural Spark production readiness verification;
- add unit tests for fail-closed deployment boundaries;
- add this contract;
- add operator readiness scripts.

Explicitly out of scope:

- UI/runtime changes;
- Firestore Rules changes;
- Functions source changes;
- production deployment;
- production data writes.

### Slice 2 — Spark runtime capability gating

The web UI must clearly disable or replace Function-dependent controls while preserving Firestore Rules-backed Pro Club workflows. No request should be sent to a knowingly unavailable Function endpoint in Spark production.

### Slice 3 — Trusted local operator extensions

Where operationally required before revenue, implement narrowly scoped local trusted adapters for capabilities that currently require Functions. Every adapter must preserve canonical authority revalidation, project pinning, fail-closed identity, audit integrity, dry-run/read-only gates where applicable, and deterministic tests.

### Slice 4 — Full regression and independent review

Run relevant unit, contract, Firestore Rules, TypeScript, and production-build suites. Perform an independent preservation/security review before merge.

### Slice 5 — Separately authorized Spark Hosting deployment

Only after all earlier slices pass may the owner explicitly authorize a Hosting-only production deployment tied to an exact SHA. The deployment must use `firebase.spark.json` and `--only hosting`. It must not invoke Functions or expand the deployment scope.

## Mandatory readiness command

The canonical Slice 1 structural gate is:

```text
npm run verify:spark-production-readiness
```

It must preserve this ordered chain:

1. canonical production App Check environment validation;
2. Spark boundary unit tests;
3. structural Spark deployment verification.

Any failure is a hard stop.

## Stop conditions

Stop immediately if any of the following occurs:

- local or remote baseline drifts unexpectedly;
- Firebase project is not exactly `futverse-d7872`;
- Spark config contains Functions, Cloud Run, Firestore, Storage, or another deploy resource;
- Spark Hosting routes any request to a Function/Run service;
- App Check guard is absent, reordered, or bypassed;
- the reviewed future `firebase.json` Functions control plane is removed or altered by this slice;
- a proposal requires a privileged browser bypass;
- a production write would occur without exact owner authorization;
- any step requires upgrading from Spark before FutVerse has revenue.

## Current deployment status

This contract does not deploy anything.

`SPARK_PLAN=LOCKED`

`PRODUCTION_DEPLOY_AUTHORIZED_BY_THIS_CONTRACT=NO`

`PRODUCTION_DATA_WRITE_AUTHORIZED_BY_THIS_CONTRACT=NO`
