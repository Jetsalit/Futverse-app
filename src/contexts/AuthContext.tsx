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
import type { TenantRole } from "../types/Membership";

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
  requestedRole?: UserRole;
  status?: "ACTIVE" | "INACTIVE" | "PENDING" | "REJECTED" | "Active" | "Inactive" | "Pending";
  country?: string;
  phone?: string;
  academyId?: string | null;
  activeAcademyId?: string | null;
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
  isImpersonating: boolean;
  isLoading: boolean;
  logout: () => void;
  hasPermission: (allowedRoles: UserRole[]) => boolean;
  impersonate: (user: User) => void;
  revertImpersonation: () => void;
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
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      unsubscribeUserDoc?.();
      unsubscribeUserDoc = undefined;

      if (firebaseUser) {
        const userRef = doc(db, "users", firebaseUser.uid);
        unsubscribeUserDoc = onSnapshot(userRef, (userDoc) => {
          if (userDoc.exists()) {
            const userData = userDoc.data() as User;

            const fullUser = {
              ...userData,
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
          console.error("Error fetching user data:", error);
          setActualUser(null);
          setCurrentUser(null);
          setIsLoading(false);
        });
      } else {
        setActualUser(null);
        setCurrentUser(null);
        setIsLoading(false);
      }
    });
    return () => {
      unsubscribeUserDoc?.();
      unsubscribeAuth();
    };
  }, []);

  const logout = async () => {
    await signOut(auth);
    setActualUser(null);
    setCurrentUser(null);
  };

  const impersonate = (user: User) => {
    if (actualUser?.role === "SUPERADMIN") {
      setCurrentUser(user);
    } else if (
      actualUser?.role === "DATA_ADMIN" &&
      user.id &&
      actualUser.assignedClients?.includes(user.id)
    ) {
      setCurrentUser(user);
    }
  };

  const revertImpersonation = () => {
    setCurrentUser(actualUser);
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
    if (!currentUser) return false;
    if (currentUser.role === "SUPERADMIN") return true;
    return allowedRoles.includes(currentUser.role);
  };

  const isImpersonating =
    actualUser !== null &&
    currentUser !== null &&
    actualUser.id !== currentUser.id;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        actualUser,
        isImpersonating,
        isLoading,
        logout,
        hasPermission,
        impersonate,
        revertImpersonation,
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
