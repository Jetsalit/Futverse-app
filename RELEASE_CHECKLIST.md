# FutVerse Release Readiness Audit

## Environment & Build
- [x] **TypeScript source gate**: Current merged baseline has passed `tsc --noEmit` / root lint gates in the relevant exact-head reviews.
- [x] **Production build source gate**: Current merged Pro Club baseline has passed the Vite production build.
- [x] **Hosting source configuration**: Pro Club control-plane rewrites are declared before the SPA catch-all.
- [x] **Firebase production project identity**: Source configuration points to `futverse-d7872` through `.firebaserc` and `firebase-applet-config.json`.
- [ ] **Firebase App Check production site key**: Pending external production configuration.
  - Required variable: `VITE_RECAPTCHA_SITE_KEY`.
  - The real value must remain outside source control.
  - `VITE_APP_CHECK_DEBUG_TOKEN` must be absent in production.
  - `scripts/verifyProductionAppCheck.mjs` is the canonical App Check environment guard.

## Authentication & Authorization
- [x] **Firebase Auth**: Email/password and Google authentication are implemented.
- [x] **Account-status boundary**: Pro Club privileged flows preserve the canonical ACTIVE-account checks added in predecessor slices.
- [x] **Pro Club staff candidate App Check enforcement**: `resolveProClubStaffCandidateV1` preserves `enforceAppCheck: true`.
- [x] **Privileged HTTP App Check enforcement**: Pro Club provisioning and audit-verification HTTP endpoints verify App Check before business handlers.
- [x] **Production web-app binding**: Privileged HTTP App Check verification is restricted to the exact FutVerse production web App ID.

## Pro Club Trusted Control Plane
- [x] **Provisioning backend**: Trusted Gen2 HTTP service exists in `asia-southeast1`.
- [x] **Provisioning audit verification**: Trusted read-only verification service exists in `asia-southeast1`.
- [x] **Privileged SuperAdmin UI**: Available under the SuperAdmin organization control plane.
- [x] **Same-origin Hosting routes**: `/api/pro-club/provision-v1` and `/api/pro-club/verify-audit-v1` target the exact trusted Functions before the SPA catch-all.
- [x] **Same-origin CORS boundary**: Both privileged HTTP Functions preserve `cors: false`.
- [ ] **Production deployment**: Not yet authorized or executed.
- [ ] **Post-deploy production smoke test**: Must verify authenticated SuperAdmin access, unauthorized denial, exact-ID audit verification, App Check-protected staff candidate lookup, and no unintended tenant/client write path.

## Database & Firebase
- [x] **Firestore connection**: Core database connection is established.
- [x] **Security Rules**: Current Pro Club boundaries are covered by the merged regression suites relevant to those slices.
- [ ] **All FutVerse product data domains fully production-backed**: Still incomplete for the broader application.
  - Some drills, scouting, fitness, player/match/team flows may still depend on local/mock/state-backed implementations and require dedicated production slices.

## Production Deploy Readiness Gate V2
`npm run verify:production-deploy-readiness` is the operator-facing gate. It deliberately has two layers with one App Check source of truth:

1. It runs `node scripts/verifyProductionAppCheck.mjs` first. This is the canonical PR #72 guard for the exact production App Check environment.
2. Only after that passes, `scripts/verifyProductionDeployReadiness.ts` validates structural deployment contracts without re-implementing site-key parsing.

The structural gate blocks deployment if any of these drift:
- Firebase default project or web project ID is not exactly `futverse-d7872`;
- default Functions codebase is not `functions` on Node.js 22;
- Hosting or Functions predeploy no longer runs the canonical App Check guard first;
- protected Pro Club Hosting rewrites are missing, moved behind a broader rewrite, or target the wrong Function/region;
- protected Function regions are no longer `asia-southeast1`;
- protected Function options use spreads instead of explicit security-relevant properties;
- privileged HTTP endpoints no longer preserve `cors: false`;
- `resolveProClubStaffCandidateV1` no longer preserves `enforceAppCheck: true`;
- the operator-facing readiness command no longer chains the canonical App Check guard first.

Before any production deployment, also require:
1. exact deploy-candidate provenance verification;
2. `npm run test:production-deploy-readiness` PASS;
3. `npm run verify:production-deploy-readiness` PASS in the exact production build environment;
4. root TypeScript gate, production Vite build, and Functions build PASS;
5. separate explicit production-deployment authorization.

## Final Verdict
The **Pro Club provisioning/control-plane code path is source-ready but not yet production-deploy-ready** because the real Firebase App Check/reCAPTCHA site key has not yet been verified in the production environment and no production deployment has been authorized. Broader full-product readiness remains separate from the Pro Club pilot path.
