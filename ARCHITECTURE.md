# FutVerse Architecture Document

## Overview

FutVerse is a modern React web application built with TypeScript, Vite, and Tailwind CSS. It serves as an intelligence platform for elite football academies to manage talents, analyze performance, and optimize tactics.

## Folder Structure

The project follows a modular, feature-based structure within the `src` directory:

```text
/
├── assets/                  # Static assets
├── src/                     
│   ├── components/          # React components and page views
│   ├── contexts/            # React Context providers (Auth, Language)
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utility libraries and third-party integrations (Firebase)
│   ├── types/               # TypeScript interfaces and type definitions
│   ├── App.tsx              # Main application layout and routing entry point
│   ├── main.tsx             # React DOM rendering entry point
│   └── index.css            # Global Tailwind CSS styles
├── package.json             # Project dependencies and scripts
├── vite.config.ts           # Vite bundler configuration
└── firestore.rules          # Firebase Firestore security rules
```

## Components and Pages

The UI is primarily composed of large-scale page components that simulate a multi-page application.

**Core Pages:**
- `Dashboard.tsx`: Primary view for staff (Admin, Coach, Scout).
- `PlayerDashboard.tsx`: Primary view tailored for Player roles.
- `SuperadminPortal.tsx`: Global system settings and user management.
- `Login.tsx`: User authentication view with email/password and Google Sign-In.

**Feature Modules:**
- **Management:** `CoachManagement.tsx`, `ProPlayerManager.tsx`, `YouthPlayerManager.tsx`
- **Analytics & Reports:** `IDPDashboard.tsx`, `YouthDevelopmentReport.tsx`, `FitnessTesting.tsx`, `RecoveryDashboard.tsx`
- **Tactics:** `TacticBoard.tsx`, `StartingXIBuilder.tsx`, `DrillLibrary.tsx`
- **Profiles:** `ProPlayerCV.tsx`, `YouthPlayerCV.tsx`, `IDPProfile.tsx`
- **Other:** `ConciergeDashboard.tsx`, `PostMatchStatsEntry.tsx`, `ScoutDashboard.tsx`, `Settings.tsx`

**Shared Components:**
- `NotificationDrawer.tsx`: Global notification sidebar.
- `SubscriptionPaywall.tsx`: Displays paywall for pending/inactive users.
- `AccessDenied.tsx`: Fallback view for unauthorized access.

## Routing

FutVerse uses a custom client-side state-based routing system managed within `App.tsx` instead of a traditional router like `react-router-dom`. The current page is determined by the `currentPage` state variable.

**Available Routes / Pages:**
- `dashboard`
- `superadmin`
- `concierge`
- `settings`
- `idp_dashboard`
- `fitness`
- `coaches`
- `periodization`
- `starting_xi`
- `youth`, `youth_cv`
- `tactic`, `drills`
- `scout`
- `recovery`
- `pro`, `pro_cv`
- `post_match`, `/coach/match-evaluation`
- `/player/peer-voting`
- `/report`

Navigation is handled via a `navigateTo(pageId)` function passed down as props to components.

## Authentication and User Roles

Authentication is managed via **Firebase Auth** and wrapped in a custom `AuthContext` (`src/contexts/AuthContext.tsx`).

### User Roles
The platform implements a Role-Based Access Control (RBAC) system with the following roles:
- `SUPERADMIN`
- `ADMIN`
- `DATA_ADMIN`
- `COACH`
- `SCOUT`
- `PLAYER`
- `USER`
- `PARENT`

Access to specific routes (e.g., settings, fitness, scout) is guarded by a `hasPermission` function in `App.tsx`. The application also supports an **impersonation** feature, allowing admins to view the app as another user.

## Firebase Usage

Firebase is configured in `src/lib/firebase.ts` and integrated primarily for Authentication and User Profile storage.

**Firebase Auth:**
- Used in `Login.tsx` for Email/Password sign-up/in and Google OAuth (`GoogleAuthProvider`).
- State observation is handled via `onAuthStateChanged` inside `AuthContext`.

**Firestore Collections:**
- `users`: Stores user profile data.
  - **Document ID:** Matches the Firebase Auth UID.
  - **Fields:** `name`, `email`, `role`, `status`, `subscriptionPlan`, `paymentDetails`, `updatedAt`, `assignedClients`.
  - Accessed directly via `doc()` and `getDoc()` / `setDoc()` in `Login.tsx` and `AuthContext.tsx`.

Currently, core feature data (drills, players, tactics) relies primarily on local component state or mock data for rapid prototyping, and is not yet fully persisted to Firestore.

## Data Flow

1. **Authentication:** The user logs in via `Login.tsx`. Firebase Auth resolves the credential.
2. **Profile Hydration:** `AuthContext` listens for the auth state, fetches the corresponding user document from the `users` Firestore collection, and sets `currentUser` in state.
3. **Authorization:** `App.tsx` checks `currentUser.role` and `currentUser.status`. If the user is `Pending` or `Inactive`, they are shown the `SubscriptionPaywall`. Otherwise, the Sidebar dynamically renders allowed navigation items.
4. **Navigation & Rendering:** The user clicks a sidebar item, updating `currentPage`. `App.tsx` conditionally renders the corresponding feature component based on the active route.
5. **State Management:** The majority of application state is managed locally within the top-level components or via the mock data hooks (`useDrillDatabase`), flowing downwards via props. Network status is globally tracked via `useNetworkStatus`.
