# FutVerse Alpha Release Notes

## Overview
FutVerse is now prepared for its Alpha deployment. The production build has been generated successfully, and Firebase Hosting configuration (`firebase.json`) has been created to serve the application properly as a single-page app (SPA).

## Verified Features
- **Login**: Email and password authentication is fully operational.
- **Email Signup**: Users can successfully register new accounts.
- **Google Login**: OAuth integration with Google is configured and active.
- **Firestore Read/Write**: Core database operations are functioning, supported by secure baseline rules.
- **User Profile Creation**: Automatically provisions user profiles in the `users` Firestore collection upon signup, handling role assignments securely.

## Deployment Details
The production build artifacts are located in the `dist/` directory and are ready for deployment to the project `futverse-d7872`.

### Manual Deployment Instructions
Because the agent environment cannot securely authenticate via the Firebase CLI for direct hosting deployment, you must complete the final step locally using your Google account credentials:

1. Ensure you have the Firebase CLI installed:
   ```bash
   npm install -g firebase-tools
   ```
2. Log in to your Firebase account:
   ```bash
   firebase login
   ```
3. Deploy the application:
   ```bash
   firebase deploy --only hosting --project futverse-d7872
   ```

**Expected Hosting URLs after deployment:**
- `https://futverse-d7872.web.app`
- `https://futverse-d7872.firebaseapp.com`
