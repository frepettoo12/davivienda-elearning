"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  User,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

type UserRole = "learning" | "solicitante" | null;

interface AuthContextType {
  user: User | null;
  role: UserRole;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInAsSolicitante: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Dominios permitidos para Learning
const LEARNING_DOMAINS = ["davivienda.com", "alkemy.org"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user?.email) {
        const domain = user.email.split("@")[1];
        if (LEARNING_DOMAINS.includes(domain)) {
          setRole("learning");
        }
      }
      setLoading(false);
    });

    // Check for solicitante in localStorage
    const savedRole = localStorage.getItem("userRole");
    if (savedRole === "solicitante") {
      setRole("solicitante");
      setLoading(false);
    }

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email;
      if (email) {
        const domain = email.split("@")[1];
        if (LEARNING_DOMAINS.includes(domain)) {
          setRole("learning");
          localStorage.setItem("userRole", "learning");
        } else {
          // Not allowed domain
          await firebaseSignOut(auth);
          throw new Error("Email no autorizado. Solo dominios: " + LEARNING_DOMAINS.join(", "));
        }
      }
    } catch (error) {
      console.error("Error signing in:", error);
      throw error;
    }
  };

  const signInAsSolicitante = () => {
    setRole("solicitante");
    localStorage.setItem("userRole", "solicitante");
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setRole(null);
    localStorage.removeItem("userRole");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        loading,
        signInWithGoogle,
        signInAsSolicitante,
        signOut,
      }}
    >
      {children}
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
