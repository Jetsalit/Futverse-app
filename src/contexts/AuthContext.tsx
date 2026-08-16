import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
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
  status?: unknown;
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
  rejectionReason?: string;
  assignedClients?: string[]; // Legacy metadata only; never authority.
}

interface AuthContextType {
  currentUser: User | null;
  actualUser: User | null;
  isLoading: boolean;
  logout: () => void;
  hasPermission: (allowedRoles: UserRole[]) => boolean;
  setSupportPresentedUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const isExplicitlyActiveUser = (user: User | null): boolean =>
  Boolean(user && (user.status === "ACTIVE" || user.status === "Active"));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [actualUser, setActualUser] = useState<User | null>(null);
  const [supportPresentedUser, setSupportPresentedUserState] =
    useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const currentUser = supportPresentedUser ?? actualUser;

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | undefined;
    let authResolutionVersion = 0;
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      const resolutionVersion = ++authResolutionVersion;
      unsubscribeUserDoc?.();
      unsubscribeUserDoc = undefined;
      setActualUser(null);
      setSupportPresentedUserState(null);
      setIsLoading(true);

      if (firebaseUser) {
        const userRef = doc(db, "users", firebaseUser.uid);
        unsubscribeUserDoc = onSnapshot(
          userRef,
          { includeMetadataChanges: true },
          (userDoc) => {
            if (resolutionVersion !== authResolutionVersion) return;

            if (userDoc.metadata.fromCache || userDoc.metadata.hasPendingWrites) {
              setActualUser(null);
              setSupportPresentedUserState(null);
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
            } else {
              setActualUser(null);
              setSupportPresentedUserState(null);
            }
            setIsLoading(false);
          },
          (error) => {
            if (resolutionVersion !== authResolutionVersion) return;
            console.error("Error fetching user data:", error);
            setActualUser(null);
            setSupportPresentedUserState(null);
            setIsLoading(false);
          },
        );
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

  const setSupportPresentedUser = useCallback(
    (user: User | null) => {
      if (user === null) {
        setSupportPresentedUserState(null);
        return;
      }

      if (
        !actualUser ||
        actualUser.role !== "SUPERADMIN" ||
        !isExplicitlyActiveUser(actualUser) ||
        !isExplicitlyActiveUser(user)
      ) {
        throw new Error(
          "Support presentation override requires an active SUPERADMIN actor and active target user.",
        );
      }

      setSupportPresentedUserState(user);
    },
    [actualUser],
  );

  const logout = async () => {
    await signOut(auth);
    setActualUser(null);
    setSupportPresentedUserState(null);
  };

  const hasPermission = (allowedRoles: UserRole[]) => {
    if (supportPresentedUser) {
      return (
        actualUser?.role === "SUPERADMIN" &&
        isExplicitlyActiveUser(actualUser) &&
        isExplicitlyActiveUser(supportPresentedUser) &&
        allowedRoles.includes(supportPresentedUser.role)
      );
    }
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
        setSupportPresentedUser,
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
