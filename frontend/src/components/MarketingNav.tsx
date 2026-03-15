'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import BrandLogo from '@/components/BrandLogo';
import { APP_NAME } from '@/lib/branding';

/**
 * Top navigation bar shown on the public marketing / landing page.
 */
export default function MarketingNav() {
  const { isAuthenticated } = useAuth();

  return (
    <nav className="w-full flex items-center justify-between px-6 py-4">
      <Link href="/" className="flex items-center gap-2">
        <BrandLogo
          className="flex items-center gap-2"
          imageClassName="h-8 w-8"
          showWordmark
          size={32}
          wordmarkClassName="text-lg font-bold text-gray-900"
        />
      </Link>

      <div className="flex items-center gap-4">
        {isAuthenticated ? (
          <Link
            href="/dashboard"
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-purple-700 transition"
          >
            Dashboard
          </Link>
        ) : (
          <>
            <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition">
              Sign In
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-purple-700 transition"
            >
              Get Started
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
