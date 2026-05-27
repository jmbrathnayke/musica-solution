'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../store/authStore';

export default function IndexPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace('/library');
      } else {
        router.replace('/login');
      }
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0d0d0f]">
      {/* Sleek rotating loader */}
      <div className="relative w-16 h-16 border-4 border-zinc-800 rounded-full flex items-center justify-center animate-spin">
        <div className="w-8 h-8 border-4 border-indigo-500 rounded-full flex items-center justify-center">
          <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
        </div>
      </div>
      <p className="mt-6 text-sm text-zinc-400 font-display uppercase tracking-widest animate-pulse">
        Initializing Studio...
      </p>
    </div>
  );
}
