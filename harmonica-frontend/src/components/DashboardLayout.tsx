'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '../store/authStore';
import { Music, ListMusic, Download, LogOut, Radio, User as UserIcon } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore();
  const pathname = usePathname();

  const navigation = [
    { name: 'Library', href: '/library', icon: Music },
    { name: 'Playlists', href: '/playlists', icon: ListMusic },
    { name: 'Export', href: '/export', icon: Download },
  ];

  return (
    <div className="flex h-screen bg-[#0d0d0f] text-zinc-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 glass-panel border-r border-zinc-800 flex flex-col justify-between shrink-0">
        <div>
          {/* Logo */}
          <div className="h-20 flex items-center px-6 gap-3 border-b border-zinc-800/50">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Radio className="w-5 h-5 text-cyan-200" />
            </div>
            <div>
              <span className="font-display font-bold text-xl bg-clip-text text-transparent bg-gradient-to-r from-zinc-50 via-zinc-100 to-cyan-300">
                HARMONICA
              </span>
              <p className="text-[10px] text-zinc-500 tracking-wider uppercase font-semibold">
                Harmonic Mix Planner
              </p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            {navigation.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group ${
                    isActive
                      ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/20 shadow-sm shadow-indigo-500/5'
                      : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200 border border-transparent'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${
                      isActive ? 'text-indigo-400' : 'text-zinc-500 group-hover:text-zinc-400'
                    }`}
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User profile / Logout */}
        <div className="p-4 border-t border-zinc-800/50 bg-zinc-900/10">
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl">
            <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
              <UserIcon className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-zinc-200 truncate leading-none">
                {user?.displayName || 'DJ User'}
              </p>
              <p className="text-[10px] text-zinc-500 truncate mt-1">
                {user?.email}
              </p>
            </div>
          </div>

          <button
            onClick={logout}
            className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium text-red-400/80 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/15 transition-all duration-200"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#0d0d0f]">
        {/* Top Header */}
        <header className="h-20 border-b border-zinc-800/50 flex items-center justify-between px-8 shrink-0">
          <div>
            <h1 className="font-display font-semibold text-lg text-zinc-100 uppercase tracking-wider">
              {navigation.find((item) => pathname.startsWith(item.href))?.name || 'Dashboard'}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono font-medium glow-cyan uppercase tracking-wider">
              Vercel Blob Active
            </span>
          </div>
        </header>

        {/* Dynamic page container */}
        <div className="flex-1 overflow-auto p-8">{children}</div>
      </main>
    </div>
  );
}
