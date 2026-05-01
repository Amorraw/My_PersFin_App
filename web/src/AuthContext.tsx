import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import type { User } from "./types";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (fields: { firstName?: string; lastName?: string; province?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const data = await api("/auth/me");
      setUser(data.user);
    } catch (err: any) {
      // 401 is expected when not logged in - don't treat as error
      if (err.status !== 401) {
        console.error("Auth check error:", err);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    setUser(data.user);
  };

  const register = async (email: string, password: string, firstName?: string, lastName?: string) => {
    const data = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, firstName, lastName })
    });
    // Session is already established by the server via req.login()
    setUser(data.user);
  };

  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
  };

  const updateProfile = async (fields: { firstName?: string; lastName?: string; province?: string }) => {
    const data = await api("/auth/profile", {
      method: "PUT",
      body: JSON.stringify(fields),
    });
    setUser(data.user);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
