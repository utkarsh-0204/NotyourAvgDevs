import React, { useEffect, useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import {
  Scale,
  Sun,
  Moon,
  Settings as SettingsIcon,
  Menu,
  X
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { SystemStatus } from '../types';

export const AppLayout: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    api.getSystemStatus()
      .then(setSystemStatus)
      .catch((err) => console.warn('Could not fetch status:', err));
  }, [location.pathname]);

  const navLinks = [
    { label: 'Dashboard', path: '/' },
    { label: 'Upload Document', path: '/upload' },
    { label: 'Document Library', path: '/library' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-app-bg text-app-text selection:bg-app-accent/20">
      {/* Slim, Minimal Top Navigation */}
      <header className="sticky top-0 z-40 bg-app-bg/95 backdrop-blur-xs border-b border-app-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-13 flex items-center justify-between">
          {/* Left: Logo & Product Name */}
          <div className="flex items-center space-x-6">
            <Link to="/" className="flex items-center space-x-2.5 group">
              <div className="w-7 h-7 rounded-sm bg-app-surface border border-app-border flex items-center justify-center text-app-text">
                <Scale className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="font-semibold text-sm tracking-tight text-app-text">
                  NyayaDrishti
                </span>
                <span className="text-[10px] tracking-wider uppercase text-app-subtle">
                  India Legal
                </span>
              </div>
            </Link>

            {/* Desktop Center Navigation */}
            <nav className="hidden md:flex items-center space-x-1 pl-4">
              {navLinks.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? 'text-app-text'
                        : 'text-app-muted hover:text-app-text'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: AI Mode Indicator, Settings, Theme */}
          <div className="hidden sm:flex items-center space-x-4">
            {/* AI Status Indicator */}
            {systemStatus && (
              <div
                title={systemStatus.aiProvider.isDemoMode ? 'Rule-Based Local Engine' : `${systemStatus.aiProvider.service}: ${systemStatus.aiProvider.model}`}
                className="flex items-center space-x-1.5 text-[11px] text-app-muted"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    systemStatus.aiProvider.isDemoMode ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                />
                <span className="hidden lg:inline">
                  {systemStatus.aiProvider.isDemoMode ? 'Rule-based mode' : systemStatus.aiProvider.provider === 'nvidia' ? 'NVIDIA AI' : 'Gemini AI'}
                </span>
              </div>
            )}

            {/* Settings Link */}
            <Link
              to="/settings"
              title="Settings & System Info"
              className={`p-1.5 rounded-sm transition-colors ${
                location.pathname === '/settings'
                  ? 'text-app-text'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
            </Link>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="p-1.5 rounded-sm text-app-muted hover:text-app-text transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex sm:hidden items-center space-x-2">
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="p-1.5 text-app-muted hover:text-app-text"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 text-app-muted hover:text-app-text"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-app-border bg-app-surface px-4 py-3 space-y-1">
            {navLinks.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 text-xs font-medium ${
                  location.pathname === item.path
                    ? 'text-app-text font-semibold'
                    : 'text-app-muted'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/settings"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-xs font-medium text-app-muted"
            >
              Settings
            </Link>
          </div>
        )}
      </header>

      {/* Main View Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <Outlet />
      </main>

      {/* Understated Minimalist Footer */}
      <footer className="border-t border-app-border py-8 text-xs text-app-subtle">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-baseline justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="font-medium text-app-muted">NyayaDrishti</span>
            <span>—</span>
            <span>Indian Court Document Review Platform</span>
          </div>
          <div className="text-[11px] text-app-subtle max-w-md">
            Automated document assistance for court records. Not legal advice.
          </div>
        </div>
      </footer>
    </div>
  );
};
