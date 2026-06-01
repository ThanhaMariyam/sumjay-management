/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import AppLayout from './components/AppLayout';
import Login from './components/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Attendance from './pages/Attendance';
import Fees from './pages/Fees';
import Reports from './pages/Reports';
import { AnimatePresence, motion } from 'motion/react';
import { Toaster } from 'sonner';
import { useEffect } from 'react';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

function RouteTransition() {
  const location = useLocation();
  const { user, isMembershipAdmin } = useAuth();
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
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="students" element={<Students />} />
            <Route path="attendance" element={isMembershipAdmin ? <Navigate to="/" replace /> : <Attendance />} />
            <Route path="fees" element={<Fees />} />
            <Route path="reports" element={<Reports />} />
          </Route>
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

function AppRoutes() {
  const { isMembershipAdmin } = useAuth();

  useEffect(() => {
    document.body.classList.toggle('membership-theme', isMembershipAdmin);
  }, [isMembershipAdmin]);

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
