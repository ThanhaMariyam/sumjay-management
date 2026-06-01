import React, { createContext, useContext, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminRole } from '../types';
import { loginWithCredentials, logout as firebaseLogout } from './firebase';

interface AuthContextType {
  user: { username: string; role: AdminRole; adminId: string } | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isMembershipAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => false,
  logout: async () => undefined,
  isMembershipAdmin: false,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<{ username: string; role: AdminRole; adminId: string } | null>(() => {
    const raw = sessionStorage.getItem('sumjay_admin_session');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
  const [loading] = useState(false);

  const login = async (username: string, password: string) => {
    const normalizeEnvValue = (value: unknown, fallback: string) => {
      const raw = typeof value === 'string' ? value : fallback;
      return raw.trim().replace(/^['"]|['"]$/g, '');
    };

    const studentUser = normalizeEnvValue(import.meta.env.VITE_STUDENT_ADMIN_USERNAME, 'student_admin').toLowerCase();
    const studentPass = normalizeEnvValue(import.meta.env.VITE_STUDENT_ADMIN_PASSWORD, 'student_password');
    const membershipUser = normalizeEnvValue(import.meta.env.VITE_MEMBERSHIP_ADMIN_USERNAME, 'membership_admin').toLowerCase();
    const membershipPass = normalizeEnvValue(import.meta.env.VITE_MEMBERSHIP_ADMIN_PASSWORD, 'membership_password');

    const normalizedUsername = username.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (normalizedUsername === studentUser && normalizedPassword === studentPass) {
      const result = await loginWithCredentials(normalizedUsername, normalizedPassword);
      const nextUser = { username: normalizedUsername, role: 'student' as AdminRole, adminId: result.user.uid };
      setUser(nextUser);
      sessionStorage.setItem('sumjay_admin_session', JSON.stringify(nextUser));
      return true;
    }

    if (normalizedUsername === membershipUser && normalizedPassword === membershipPass) {
      const result = await loginWithCredentials(normalizedUsername, normalizedPassword);
      const nextUser = { username: normalizedUsername, role: 'membership' as AdminRole, adminId: result.user.uid };
      setUser(nextUser);
      sessionStorage.setItem('sumjay_admin_session', JSON.stringify(nextUser));
      return true;
    }

    return false;
  };

  const logout = async () => {
    await firebaseLogout();
    setUser(null);
    sessionStorage.removeItem('sumjay_admin_session');
  };

  const isMembershipAdmin = user?.role === 'membership';
  const contextValue = useMemo(
    () => ({ user, loading, login, logout, isMembershipAdmin }),
    [user, loading, isMembershipAdmin],
  );

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
