import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { UserRole } from '../types';
import {
  auth,
  loginUserWithCredentials,
  loginWithCredentials,
  loginWithGoogle,
  logout as firebaseLogout,
  signupUserWithCredentials,
} from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

type SessionUser = { username: string; role: UserRole; adminId: string; email?: string; displayName?: string };

const normalizeEnvValue = (value: unknown, fallback: string) => {
  const raw = typeof value === 'string' ? value : fallback;
  return raw.trim().replace(/^['"]|['"]$/g, '');
};

const normalizeAdminEmail = (identifier: string) => {
  const cleaned = identifier.trim().toLowerCase();
  return cleaned.includes('@') ? cleaned : `${cleaned}@sumjay.club`;
};

const getConfiguredAdminByEmail = (email?: string | null): { username: string; role: UserRole } | null => {
  if (!email) return null;

  const normalizedEmail = email.trim().toLowerCase();
  const studentUser = normalizeEnvValue(import.meta.env.VITE_STUDENT_ADMIN_USERNAME, 'student_admin').toLowerCase();
  const membershipUser = normalizeEnvValue(import.meta.env.VITE_MEMBERSHIP_ADMIN_USERNAME, 'membership_admin').toLowerCase();

  if (normalizedEmail === normalizeAdminEmail(studentUser)) {
    return { username: studentUser, role: 'student' };
  }

  if (normalizedEmail === normalizeAdminEmail(membershipUser)) {
    return { username: membershipUser, role: 'membership' };
  }

  return null;
};

interface AuthContextType {
  user: SessionUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  loginMember: (email: string, password: string) => Promise<boolean>;
  signupMember: (email: string, password: string, displayName?: string) => Promise<boolean>;
  loginMemberWithGoogle: () => Promise<boolean>;
  logout: () => Promise<void>;
  isMembershipAdmin: boolean;
  isStudentAdmin: boolean;
  isMemberUser: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => false,
  loginMember: async () => false,
  signupMember: async () => false,
  loginMemberWithGoogle: async () => false,
  logout: async () => undefined,
  isMembershipAdmin: false,
  isStudentAdmin: false,
  isMemberUser: false,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<SessionUser | null>(() => {
    const raw = sessionStorage.getItem('sumjay_admin_session');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      const adminSession = sessionStorage.getItem('sumjay_admin_session');
      if (adminSession) {
        try {
          setUser(JSON.parse(adminSession));
        } catch {
          sessionStorage.removeItem('sumjay_admin_session');
        }
        setLoading(false);
        return;
      }

      if (firebaseUser) {
        const configuredAdmin = getConfiguredAdminByEmail(firebaseUser.email);
        if (configuredAdmin) {
          const nextUser = {
            username: configuredAdmin.username,
            role: configuredAdmin.role,
            adminId: firebaseUser.uid,
            email: firebaseUser.email || undefined,
            displayName: firebaseUser.displayName || undefined,
          };
          setUser(nextUser);
          sessionStorage.setItem('sumjay_admin_session', JSON.stringify(nextUser));
          setLoading(false);
          return;
        }

        setUser({
          username: firebaseUser.displayName || firebaseUser.email || 'Member',
          email: firebaseUser.email || undefined,
          displayName: firebaseUser.displayName || undefined,
          role: 'member',
          adminId: firebaseUser.uid,
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const login = async (username: string, password: string) => {
    const studentUser = normalizeEnvValue(import.meta.env.VITE_STUDENT_ADMIN_USERNAME, 'student_admin').toLowerCase();
    const studentPass = normalizeEnvValue(import.meta.env.VITE_STUDENT_ADMIN_PASSWORD, 'student_password');
    const membershipUser = normalizeEnvValue(import.meta.env.VITE_MEMBERSHIP_ADMIN_USERNAME, 'membership_admin').toLowerCase();
    const membershipPass = normalizeEnvValue(import.meta.env.VITE_MEMBERSHIP_ADMIN_PASSWORD, 'membership_password');

    const normalizedUsername = username.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (normalizedUsername === studentUser && normalizedPassword === studentPass) {
      const result = await loginWithCredentials(normalizedUsername, normalizedPassword);
      const nextUser = { username: normalizedUsername, role: 'student' as UserRole, adminId: result.user.uid, email: result.user.email || undefined };
      setUser(nextUser);
      sessionStorage.setItem('sumjay_admin_session', JSON.stringify(nextUser));
      return true;
    }

    if (normalizedUsername === membershipUser && normalizedPassword === membershipPass) {
      const result = await loginWithCredentials(normalizedUsername, normalizedPassword);
      const nextUser = { username: normalizedUsername, role: 'membership' as UserRole, adminId: result.user.uid, email: result.user.email || undefined };
      setUser(nextUser);
      sessionStorage.setItem('sumjay_admin_session', JSON.stringify(nextUser));
      return true;
    }

    return false;
  };

  const setMemberSession = (firebaseUser: typeof auth.currentUser) => {
    if (!firebaseUser) return false;
    const configuredAdmin = getConfiguredAdminByEmail(firebaseUser.email);
    if (configuredAdmin) {
      const nextUser = {
        username: configuredAdmin.username,
        role: configuredAdmin.role,
        adminId: firebaseUser.uid,
        email: firebaseUser.email || undefined,
        displayName: firebaseUser.displayName || undefined,
      };
      setUser(nextUser);
      sessionStorage.setItem('sumjay_admin_session', JSON.stringify(nextUser));
      return true;
    }

    sessionStorage.removeItem('sumjay_admin_session');
    setUser({
      username: firebaseUser.displayName || firebaseUser.email || 'Member',
      email: firebaseUser.email || undefined,
      displayName: firebaseUser.displayName || undefined,
      role: 'member',
      adminId: firebaseUser.uid,
    });
    return true;
  };

  const loginMember = async (email: string, password: string) => {
    const result = await loginUserWithCredentials(email, password);
    return setMemberSession(result.user);
  };

  const signupMember = async (email: string, password: string, displayName?: string) => {
    const result = await signupUserWithCredentials(email, password, displayName);
    return setMemberSession(result.user);
  };

  const loginMemberWithGoogle = async () => {
    const result = await loginWithGoogle();
    return setMemberSession(result?.user || auth.currentUser);
  };

  const logout = async () => {
    await firebaseLogout();
    setUser(null);
    sessionStorage.removeItem('sumjay_admin_session');
  };

  const isMembershipAdmin = user?.role === 'membership';
  const isStudentAdmin = user?.role === 'student';
  const isMemberUser = user?.role === 'member';
  const contextValue = useMemo(
    () => ({
      user,
      loading,
      login,
      loginMember,
      signupMember,
      loginMemberWithGoogle,
      logout,
      isMembershipAdmin,
      isStudentAdmin,
      isMemberUser,
    }),
    [user, loading, isMembershipAdmin, isStudentAdmin, isMemberUser],
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
