import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Users, CalendarCheck, IndianRupee, LayoutDashboard, FileText, Menu, LogOut } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { logout } from '../lib/firebase';
import { Button } from './ui/button';
import sumjayLogo from '../assets/sumjay-logo.png';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/students', label: 'Students', icon: Users },
  { href: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { href: '/fees', label: 'Fees', icon: IndianRupee },
  { href: '/reports', label: 'Reports', icon: FileText },
];

export default function AppLayout() {
  const { user } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Mobile topnav */}
      <div className="md:hidden flex items-center justify-between p-4 bg-white border-b">
        <div className="flex items-center gap-2">
          <img src={sumjayLogo} alt="Sumjay logo" className="h-9 w-9 rounded-md object-contain" />
          <h1 className="font-bold text-xl text-primary">Sumjay Paravanna</h1>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
          <Menu />
        </Button>
      </div>

      {/* Sidebar */}
      <div className={`${isSidebarOpen ? 'block' : 'hidden'} md:block w-full md:w-64 bg-white border-r min-h-screen flex flex-col`}>
        <div className="p-6 hidden md:flex items-center gap-3">
          <img src={sumjayLogo} alt="Sumjay logo" className="h-11 w-11 rounded-md object-contain" />
          <h1 className="font-bold text-2xl text-primary tracking-tight">Sumjay Paravanna</h1>
        </div>
        
        <nav className="flex-1 px-4 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                  isActive 
                    ? 'bg-primary text-primary-foreground font-medium' 
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
              onClick={() => setIsSidebarOpen(false)}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t w-full">
            <div className="flex items-center gap-3 mb-4">
              <Avatar>
                <AvatarImage src={user?.photoURL || ''} />
                <AvatarFallback>{user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.displayName || 'Admin'}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user?.email}
                </p>
              </div>
            </div>
            <Button variant="outline" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50" onClick={logout}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 p-4 md:p-8 overflow-auto h-screen">
        <Outlet />
      </main>
    </div>
  );
}
