import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

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
  name: string;
  email?: string;
  role: UserRole;
  status?: "Active" | "Inactive" | "Pending";
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
  setRole: (role: UserRole) => void;
  login: (user: User) => void;
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
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data() as User;
            
            // Auto-promote jetsalween@gmail.com to SUPERADMIN
            if (firebaseUser.email === "jetsalween@gmail.com" && userData.role !== "SUPERADMIN") {
              userData.role = "SUPERADMIN";
              try {
                const { updateDoc } = await import("firebase/firestore");
                await updateDoc(doc(db, "users", firebaseUser.uid), { role: "SUPERADMIN" });
              } catch (e) {
                console.error("Failed to auto-promote:", e);
              }
            }

            const fullUser = {
              ...userData,
              id: firebaseUser.uid,
              email: firebaseUser.email || undefined,
            };
            setActualUser(fullUser);
            setCurrentUser(fullUser);
          } else {
            // Default user fallback if document not created yet
            const defaultUser: User = {
              id: firebaseUser.uid,
              name: firebaseUser.displayName || "User",
              email: firebaseUser.email || undefined,
              role: "USER",
            };
            setActualUser(defaultUser);
            setCurrentUser(defaultUser);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      } else {
        setActualUser(null);
        setCurrentUser(null);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const setRole = (role: UserRole) => {
    if (currentUser) {
      setCurrentUser({ ...currentUser, role });
    }
  };

  const login = (user: User) => {
    // Used for mock logic, real login is handled by Firebase Auth now
    setActualUser(user);
    setCurrentUser(user);
  };

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
        setRole,
        login,
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
