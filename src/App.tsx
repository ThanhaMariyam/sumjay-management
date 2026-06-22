/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import AppLayout from './components/AppLayout';
import UserAuth from './components/UserAuth';
import UserLayout from './components/UserLayout';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Attendance from './pages/Attendance';
import Fees from './pages/Fees';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import UserDashboard from './pages/UserDashboard';
import UserProfile from './pages/UserProfile';
import { AnimatePresence, motion } from 'motion/react';
import { Toaster } from 'sonner';
import { useEffect } from 'react';

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isMemberUser } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (isMemberUser) return <Navigate to="/user" replace />;
  return <>{children}</>;
};

const MemberRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isMemberUser } = useAuth();
  if (!user) return <Navigate to="/user/login" replace />;
  if (!isMemberUser) return <Navigate to="/" replace />;
  return <>{children}</>;
};

function RouteTransition() {
  const location = useLocation();
  const { user, isMembershipAdmin, isMemberUser } = useAuth();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className="h-full"
      >
        <Routes location={location}>
          <Route path="/login" element={<UserAuth mode="login" />} />
          <Route path="/user/login" element={<UserAuth mode="login" />} />
          <Route path="/user/signup" element={<UserAuth mode="signup" />} />
          <Route path="/" element={<AdminRoute><AppLayout /></AdminRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="students" element={<Students />} />
            <Route path="attendance" element={isMembershipAdmin ? <Navigate to="/" replace /> : <Attendance />} />
            <Route path="fees" element={<Fees />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="reports" element={<Reports />} />
          </Route>
          <Route path="/user" element={<MemberRoute><UserLayout /></MemberRoute>}>
            <Route index element={<UserDashboard />} />
            <Route path="profile" element={<UserProfile />} />
          </Route>
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

function AppRoutes() {
  const { isMembershipAdmin, isMemberUser } = useAuth();

  useEffect(() => {
    document.body.classList.toggle('membership-theme', isMembershipAdmin || isMemberUser);
  }, [isMembershipAdmin, isMemberUser]);

  return <RouteTransition />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </AuthProvider>
  );
}
