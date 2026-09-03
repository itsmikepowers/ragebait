"use client";

/**
 * Auth state for the whole dashboard.
 *
 * Mirrors hypefeed's `src/contexts/AuthContext.tsx`: Firebase owns the session,
 * Mongo owns the profile + role. `onAuthStateChanged` fires, we exchange the
 * ID token for our own user row at `GET /api/user`, and that row's `isAdmin`
 * is what the UI gates on.
 *
 * Children don't render until the first auth check settles, so a signed-in
 * admin never sees a flash of the signed-out or non-admin layout.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { authFetch } from "@/lib/auth/auth-fetch";
import { getClientAuth } from "@/lib/auth/firebase";

export type AppUser = {
  id: string;
  uid: string;
  email: string;
  name: string;
  photoUrl: string;
  createdAt: string;
  lastLoggedIn: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
};

type AuthContextValue = {
  firebaseUser: FirebaseUser | null;
  user: AppUser | null;
  loading: boolean;
  signup: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /** Calls the dashboard API with the current user's ID token attached. */
  apiFetch: <T = unknown>(url: string, options?: RequestInit) => Promise<T>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return ctx;
}

async function loadUser(firebaseUser: FirebaseUser): Promise<AppUser | null> {
  try {
    const data = await authFetch<{ user: AppUser }>(firebaseUser, "/api/user");
    return data.user;
  } catch (error) {
    console.error("Could not load user:", error);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(getClientAuth(), async (next) => {
      setFirebaseUser(next);
      setUser(next ? await loadUser(next) : null);
      setLoading(false);
    });
  }, []);

  const refreshUser = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }
    const next = await loadUser(firebaseUser);
    if (next) {
      setUser(next);
    }
  }, [firebaseUser]);

  const signup = useCallback(async (email: string, password: string) => {
    await createUserWithEmailAndPassword(getClientAuth(), email, password);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(getClientAuth(), email, password);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(getClientAuth(), new GoogleAuthProvider());
  }, []);

  const logout = useCallback(async () => {
    await signOut(getClientAuth());
    setUser(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(getClientAuth(), email);
  }, []);

  const apiFetch = useCallback(
    async <T,>(url: string, options?: RequestInit): Promise<T> => {
      if (!firebaseUser) {
        throw new Error("Sign in to continue.");
      }
      return authFetch<T>(firebaseUser, url, options);
    },
    [firebaseUser],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseUser,
      user,
      loading,
      signup,
      login,
      signInWithGoogle,
      logout,
      refreshUser,
      resetPassword,
      apiFetch,
    }),
    [
      firebaseUser,
      user,
      loading,
      signup,
      login,
      signInWithGoogle,
      logout,
      refreshUser,
      resetPassword,
      apiFetch,
    ],
  );

  // Children always render: public pages (/docs) must still server-render, and
  // the pages that need auth (the shell, /login) gate on `loading` themselves.
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
