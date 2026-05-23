'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { isPlatformAdmin, isDemoEmail } from '@/lib/access';

function canAccessPlatform(user: { email?: string; isPlatformAdmin?: boolean } | null): boolean {
  return Boolean(user && isPlatformAdmin(user) && !isDemoEmail(user.email));
}

export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const allowed = canAccessPlatform(user);

  useEffect(() => {
    if (!loading && !allowed) {
      router.replace('/dashboard');
    }
  }, [allowed, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading…
      </div>
    );
  }

  if (!allowed) {
    return null;
  }

  return <>{children}</>;
}
