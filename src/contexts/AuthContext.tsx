import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { mapCanonicalSnapshot } from "../lib/firestore/canonicalDocument";
import type { TenantRole } from "../types/Membership";
import { hasClientPermission } from "../lib/privilegedAuthorization";

export type UserRole =
  | "SUPERADMIN"
  | "ADMIN"
  | "COACH"
  | "SCOUT"
  | "USER"
  | "DATA_ADMIN"
  | "PLAYER"
  | "PARENT";

export interface User {
  id?: string;
  uid?: string;
  name: string;
  email?: string;
  role: UserRole;
  requestedRole?: unknown;
  status?: "ACTIVE" | "INACTIVE" | "PENDING" | "REJECTED" | "Active" | "Inactive" | "Pending";
  country?: string;
  phone?: string;
  // Legacy/routing metadata only. None of these fields grants tenant or player access.
  academyId?: string | null;
  activeAcademyId?: string | null;
  linkedPlayerId?: string | null;
  requestedAcademyName?: string;
  tenantRole?: TenantRole;
  createdAt?: string;
  updatedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  lastLogin?: string;
  subscriptionPlan?: "monthly" | "yearly";
  paymentDetails?: {
    date: string;
    time: string;
    slipUrl: string;
  };
  rejectionReason?: string;
  assignedClients?: string[]; // Array of User IDs they can manage
}

interface AuthContextType {
  currentUser: User | null;
  actualUser: User | null;
  isLoading: boolean;
  logout: () => void;
  hasPermission: (allowedRoles: UserRole[]) => boolean;
  submitSubscription: (
    plan: "monthly" | "yearly",
    date: string,
    time: string,
    slipUrl: string,
  ) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [actualUser, setActualUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | undefined;
    let authResolutionVersion = 0;
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      const resolutionVersion = ++authResolutionVersion;
      unsubscribeUserDoc?.();
      unsubscribeUserDoc = undefined;
      setActualUser(null);
      setCurrentUser(null);
      setIsLoading(true);

      if (firebaseUser) {
        const userRef = doc(db, "users", firebaseUser.uid);
        unsubscribeUserDoc = onSnapshot(userRef, { includeMetadataChanges: true }, (userDoc) => {
          if (resolutionVersion !== authResolutionVersion) return;

          if (userDoc.metadata.fromCache || userDoc.metadata.hasPendingWrites) {
            setActualUser(null);
            setCurrentUser(null);
            setIsLoading(false);
            return;
          }

          if (userDoc.exists()) {
            const userData = userDoc.data() as User;

            const fullUser = {
              ...userData,
              ...mapCanonicalSnapshot<User>(userDoc),
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              email: firebaseUser.email || undefined,
            };
            setActualUser(fullUser);
            setCurrentUser(fullUser);
          } else {
            // Default user fallback if document not created yet
            const defaultUser: User = {
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || "User",
              email: firebaseUser.email || undefined,
              role: "USER",
              academyId: null,
              activeAcademyId: null,
            };
            setActualUser(defaultUser);
            setCurrentUser(defaultUser);
          }
          setIsLoading(false);
        }, (error) => {
          if (resolutionVersion !== authResolutionVersion) return;
          console.error("Error fetching user data:", error);
          setActualUser(null);
          setCurrentUser(null);
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    });
    return () => {
      ++authResolutionVersion;
      unsubscribeUserDoc?.();
      unsubscribeAuth();
    };
  }, []);

  const logout = async () => {
    await signOut(auth);
    setActualUser(null);
    setCurrentUser(null);
  };

  const submitSubscription = (
    plan: "monthly" | "yearly",
    date: string,
    time: string,
    slipUrl: string,
  ) => {
    if (currentUser) {
      const updatedUser = {
        ...currentUser,
        status: "Pending" as const,
        subscriptionPlan: plan,
        paymentDetails: { date, time, slipUrl },
      };
      setCurrentUser(updatedUser);
      if (actualUser?.id === currentUser.id) {
        setActualUser(updatedUser);
      }
    }
  };

  const hasPermission = (allowedRoles: UserRole[]) => {
    return hasClientPermission(actualUser, currentUser, allowedRoles);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        actualUser,
        isLoading,
        logout,
        hasPermission,
        submitSubscription,
      }}
    >
      {!isLoading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
