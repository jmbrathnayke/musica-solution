'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../store/authStore';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
        {/* Vinyl spinning loader */}
        <div className="relative w-16 h-16 border-4 border-zinc-800 rounded-full flex items-center justify-center animate-spin">
          <div className="w-8 h-8 border-4 border-indigo-500 rounded-full flex items-center justify-center">
            <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
          </div>
        </div>
        <p className="mt-6 text-sm text-zinc-400 font-display uppercase tracking-widest animate-pulse">
          Harmonizing...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Prevents flashing content while redirecting
  }

  return <>{children}</>;
}
