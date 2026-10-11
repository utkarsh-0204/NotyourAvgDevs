import React, { useState } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import {
  Scale,
  LayoutDashboard,
  Upload,
  BookOpen,
  FileText,
  Settings as SettingsIcon,
  HelpCircle,
  Bell,
  Search,
  ChevronDown,
  Menu,
  X,
  LogOut
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GlobalSearch } from '../components/GlobalSearch';

export const DashboardLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const displayName = user?.name || 'Harish P';
  const displayRole = user?.role ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : 'Advocate';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'HP';

  const sidebarLinks = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Upload Document', path: '/upload', icon: Upload },
    { label: 'My Documents', path: '/library', icon: BookOpen },
    { label: 'Reports', path: '/reports', icon: FileText },
    { label: 'Settings', path: '/settings', icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen flex bg-[#F7F6F2] text-[#3F4754]">
      {/* LEFT SIDEBAR (Desktop fixed ~230px) */}
      <aside className="hidden md:flex md:w-[230px] flex-col justify-between border-r border-[#E5E2DA] bg-[#F7F6F2] shrink-0 sticky top-0 h-screen">
        {/* Top Branding & Navigation */}
        <div className="flex flex-col">
          {/* Logo & Brand Header */}
          <div className="h-16 flex items-center px-6 border-b border-[#E5E2DA]/60">
            <Link to="/" className="flex items-center space-x-2.5">
              <Scale className="w-5 h-5 text-[#A98A4B]" />
              <span className="font-serif font-bold text-lg tracking-tight text-[#14243D]">
                NyayaDrishti
              </span>
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            {sidebarLinks.map((item) => {
              const Icon = item.icon;
              const isActive =
                location.pathname === item.path ||
                (item.path === '/library' && location.pathname === '/documents');

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-3 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-[#EAE7DF] text-[#14243D] font-semibold'
                      : 'text-[#616875] hover:text-[#14243D] hover:bg-[#EFECE4]'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#14243D]' : 'text-[#737986]'}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Support & User Profile */}
        <div className="p-4 space-y-4 border-t border-[#E5E2DA]/80">
          {/* Need Help Card */}
          <div className="p-3 rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] shadow-subtle space-y-1.5">
            <div className="text-xs font-semibold text-[#14243D]">Need Help?</div>
            <p className="text-[11px] text-[#737986] leading-relaxed">
              Check our documentation or contact support.
            </p>
            <Link
              to="/support"
              className="inline-block mt-1 text-[11px] font-medium text-[#14243D] hover:underline"
            >
              Contact Support
            </Link>
          </div>

          {/* User Profile Pill */}
          <div className="relative pt-1">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-full flex items-center justify-between p-1.5 rounded-md hover:bg-[#EFECE4] transition-colors text-left"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-[#E2DCCE] border border-[#D5CFC2] flex items-center justify-center text-xs font-semibold text-[#14243D] shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-[#14243D] truncate">
                    {displayName}
                  </div>
                  <div className="text-[10px] text-[#737986] truncate">
                    {displayRole}
                  </div>
                </div>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-[#737986] transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {userMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1.5 bg-white border border-[#E5E2DA] rounded-lg shadow-card p-1.5 z-40 space-y-1">
                <div className="px-2.5 py-1.5 border-b border-[#E5E2DA]/60">
                  <div className="text-xs font-medium text-[#14243D] truncate">{displayName}</div>
                  <div className="text-[10px] text-[#737986] truncate">{user?.email || 'demo@nyayadrishti.in'}</div>
                </div>
                <Link
                  to="/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center space-x-2 px-2.5 py-1.5 rounded text-xs text-[#3F4754] hover:bg-[#F3F1EB] transition-colors"
                >
                  <SettingsIcon className="w-3.5 h-3.5 text-[#737986]" />
                  <span>Account Settings</span>
                </Link>
                <button
                  onClick={async () => {
                    setUserMenuOpen(false);
                    await logout();
                    navigate('/');
                  }}
                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded text-xs text-[#9B2C2C] hover:bg-[#FFF5F5] transition-colors text-left"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* MOBILE SIDEBAR DRAWER */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-xs"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative w-64 bg-[#F7F6F2] border-r border-[#E5E2DA] flex flex-col justify-between p-4 z-10">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#E5E2DA]">
                <div className="flex items-center space-x-2">
                  <Scale className="w-5 h-5 text-[#A98A4B]" />
                  <span className="font-serif font-bold text-base text-[#14243D]">NyayaDrishti</span>
                </div>
                <button onClick={() => setMobileSidebarOpen(false)} className="p-1">
                  <X className="w-5 h-5 text-[#737986]" />
                </button>
              </div>

              <nav className="space-y-1">
                {sidebarLinks.map((item) => {
                  const isActive =
                    location.pathname === item.path ||
                    (item.path === '/library' && location.pathname === '/documents');

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileSidebarOpen(false)}
                      className={`flex items-center space-x-3 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-[#EAE7DF] text-[#14243D] font-semibold'
                          : 'text-[#3F4754] hover:bg-[#EAE7DF]'
                      }`}
                    >
                      <item.icon className={`w-4 h-4 ${isActive ? 'text-[#14243D]' : 'text-[#737986]'}`} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="pt-3 border-t border-[#E5E2DA]">
                <Link
                  to="/support"
                  onClick={() => setMobileSidebarOpen(false)}
                  className="flex items-center space-x-3 px-3 py-2 rounded-md text-xs font-medium text-[#616875] hover:text-[#14243D] hover:bg-[#EAE7DF]"
                >
                  <HelpCircle className="w-4 h-4 text-[#737986]" />
                  <span>Contact Support</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RIGHT CONTENT COLUMN */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP SEARCH HEADER */}
        <header className="h-16 border-b border-[#E5E2DA] bg-[#F7F6F2] px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center space-x-3 flex-1 max-w-md">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden p-1 text-[#737986] hover:text-[#14243D]"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Global Document Search with Dropdown */}
            <div className="w-full">
              <GlobalSearch />
            </div>
          </div>

          {/* Right Header Utilities */}
          <div className="flex items-center space-x-3 pl-4">
            <button
              title="Notifications"
              className="p-2 rounded-md text-[#737986] hover:text-[#14243D] hover:bg-[#EFECE4] transition-colors relative"
            >
              <Bell className="w-4 h-4" />
            </button>

            <Link
              to="/upload"
              className="hidden sm:inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-md bg-[#14243D] hover:bg-[#0D182A] text-white text-xs font-medium shadow-subtle transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Document</span>
            </Link>
          </div>
        </header>

        {/* MAIN BODY VIEW */}
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
