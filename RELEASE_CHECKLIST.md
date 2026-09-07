# FutVerse Release Readiness Audit

## Environment & Build
- [x] **TypeScript**: Verified. Building successfully with no compilation errors (`tsc --noEmit` passes).
- [x] **Build**: Verified. Vite build completes successfully, producing production assets in `dist/`.
- [x] **Hosting source configuration**: Verified. Firebase Hosting is configured and Pro Club control-plane rewrites are declared before the SPA catch-all.
- [x] **Firebase production project identity**: Verified in source configuration as `futverse-d7872` via `.firebaserc` and `firebase-applet-config.json`.
- [ ] **Firebase App Check production site key**: Pending external production configuration.
  - Required variable: `VITE_RECAPTCHA_SITE_KEY`.
  - The real value must be configured outside source control for the FutVerse production web app.
  - `VITE_APP_CHECK_DEBUG_TOKEN` must be absent from production.
  - Run `npm run verify:production-deploy-readiness` in the exact production build environment before any deployment.

## Authentication & Authorization
- [x] **Firebase Auth Configuration**: Verified. Configured via `src/lib/firebase.ts` and `firebase-applet-config.json` pointing to `futverse-d7872`.
- [x] **Login**: Verified. Standard Email/Password login is implemented in `Login.tsx`.
- [x] **Signup**: Verified. Signup flow exists.
- [x] **Google Login**: Verified. OAuth provider is integrated.
- [x] **User Roles**: Verified. RBAC system is implemented (`SUPERADMIN`, `ADMIN`, `COACH`, `SCOUT`, `PLAYER`, etc.) with route-based protection in `App.tsx`.
- [x] **Pro Club staff candidate App Check enforcement**: Source contract preserves `enforceAppCheck: true` on `resolveProClubStaffCandidateV1`.

## Pro Club Trusted Control Plane
- [x] **Provisioning backend**: Trusted Gen2 HTTP service exists in `asia-southeast1`.
- [x] **Provisioning audit verification**: Trusted read-only verification service exists in `asia-southeast1`.
- [x] **Privileged SuperAdmin UI**: Merged under SuperAdmin → Organizations.
- [x] **Same-origin Hosting routes**: `/api/pro-club/provision-v1` and `/api/pro-club/verify-audit-v1` are mapped to the exact trusted Functions before the SPA catch-all.
- [x] **No client Pro Club write path**: UI integration does not write Pro Clubs, OWNER membership, or provisioning audits directly through Firestore.
- [ ] **Production deployment**: Not yet authorized or executed.
- [ ] **Post-deploy production smoke test**: Must verify authenticated SuperAdmin access, unauthorized denial, exact-ID audit verification, App Check-protected staff candidate lookup, and no unintended tenant/client write path.

## Database & Firebase
- [x] **Firestore Connection**: Core database connection established.
- [x] **Security Rules (`firestore.rules`)**: Verified for the current merged production baseline and Pro Club boundaries covered by the relevant regression suites.
- [ ] **All product data domains fully production-backed**: Still incomplete for the broader FutVerse application.
  - Features such as some drills, scouting reports, fitness tests, players/matches/teams flows may still rely on local/mock/state-backed implementations and require dedicated production slices.

## Production Deploy Gate
A production deployment is blocked unless all of the following are true on the exact deploy candidate:
1. `main` / deploy candidate provenance is verified.
2. `npm run test:production-deploy-readiness` passes.
3. `VITE_RECAPTCHA_SITE_KEY` is present and not a placeholder.
4. `VITE_APP_CHECK_DEBUG_TOKEN` is absent.
5. `.firebaserc` and web Firebase config both resolve to `futverse-d7872`.
6. Functions runtime remains Node.js 22.
7. Pro Club Hosting rewrites remain exact and ordered before the SPA catch-all.
8. `resolveProClubStaffCandidateV1` still enforces App Check.
9. Root TypeScript/build and Functions build pass.
10. Production deployment has separate explicit authorization.

## Final Verdict
The **Pro Club provisioning/control-plane code path is source-ready but not yet production-deploy-ready** because the real Firebase App Check web site key has not been verified in the production environment. The new readiness guard is intentionally fail-closed and does not contain or invent the production key. Broader full-product readiness remains separate from the Pro Club pilot path.
