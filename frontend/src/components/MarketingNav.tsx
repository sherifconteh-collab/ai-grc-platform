'use client';

import Link from 'next/link';
import { useState } from 'react';

const NAV_LINKS = [
  { label: 'Features', href: '/#features' },
  { label: 'How It Works', href: '/#how-it-works' },
  { label: 'AI', href: '/#ai-features' },
  { label: 'MCP', href: '/#mcp' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Frameworks', href: '/frameworks' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Contact', href: '/contact' },
];

export default function MarketingNav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2">
          <svg aria-hidden="true" width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="8" fill="#7e22ce"/>
            <path d="M16 6L26 11V21L16 26L6 21V11L16 6Z" stroke="white" strokeWidth="2" fill="none"/>
            <circle cx="16" cy="16" r="4" fill="white"/>
          </svg>
          <span className="font-bold text-lg text-gray-900">ControlWeave</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6 text-sm text-gray-600">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-purple-600 transition-colors">
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-gray-600 hover:text-purple-600 font-medium transition-colors">Sign in</Link>
          <Link href="/register" className="text-sm bg-gradient-to-r from-purple-700 to-indigo-700 text-white px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity">Get Started</Link>

          {/* Hamburger button — mobile only */}
          <button
            type="button"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="md:hidden ml-1 p-2 rounded-md text-gray-600 hover:text-purple-600 hover:bg-gray-100 transition-colors"
          >
            {mobileOpen ? (
              /* X icon */
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            ) : (
              /* Hamburger icon */
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div id="mobile-menu" className="md:hidden border-t border-gray-100 bg-white px-4 pb-4 pt-2 flex flex-col gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="block py-2 px-2 text-sm text-gray-700 rounded-md hover:text-purple-600 hover:bg-purple-50 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
