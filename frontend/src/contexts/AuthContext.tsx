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
  signInAsSolicitante: () => Promise<void>;
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
        // El rol se resuelve por la cuenta de Google: dominio de Learning → learning;
        // cualquier otra cuenta → solicitante. Si el usuario eligió explícitamente
        // "solicitante" (un dominio de Learning que igual quiere solicitar), se respeta.
        const domain = user.email.split("@")[1];
        const isLearningDomain = LEARNING_DOMAINS.includes(domain);
        const savedRole = localStorage.getItem("userRole");
        if (savedRole === "solicitante") {
          setRole("solicitante");
        } else if (savedRole === "learning" && isLearningDomain) {
          setRole("learning");
        } else {
          setRole(isLearningDomain ? "learning" : "solicitante");
        }
      } else {
        // Sin usuario autenticado no hay rol (el solicitante ahora requiere login real).
        setRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    // Fijar el rol antes del popup (mismo motivo que en signInAsSolicitante:
    // onAuthStateChanged lee localStorage al completar el login).
    localStorage.setItem("userRole", "learning");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email;
      if (email) {
        const domain = email.split("@")[1];
        if (LEARNING_DOMAINS.includes(domain)) {
          setRole("learning");
        } else {
          // Dominio no permitido para Learning
          localStorage.removeItem("userRole");
          await firebaseSignOut(auth);
          throw new Error("Email no autorizado. Solo dominios: " + LEARNING_DOMAINS.join(", "));
        }
      }
    } catch (error) {
      console.error("Error signing in:", error);
      throw error;
    }
  };

  // Solicitante con Google: cualquier cuenta, sin restricción de dominio.
  // Importante: fijar el rol en localStorage ANTES del popup, porque
  // onAuthStateChanged se dispara al completarse el login y lee ese valor;
  // si no, un dominio de Learning caería por default en rol "learning" (race).
  const signInAsSolicitante = async () => {
    localStorage.setItem("userRole", "solicitante");
    try {
      await signInWithPopup(auth, googleProvider);
      setRole("solicitante");
    } catch (error) {
      localStorage.removeItem("userRole");
      console.error("Error signing in (solicitante):", error);
      throw error;
    }
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
