'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { requiresOrganizationOnboarding } from '@/lib/access';
import { requiresBillingResolution } from '@/lib/billing';
import { WebSocketProvider } from '@/contexts/WebSocketContext';
import { WebSocketStatusIndicator } from './WebSocketStatusIndicator';
import Sidebar from './Sidebar';
import AICopilot from './AICopilot';
import ServerUpdateBanner from './ServerUpdateBanner';
import { getAccessToken } from '@/lib/tokenStore';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  
  const mustCompleteOnboarding = Boolean(
    user && requiresOrganizationOnboarding(user) && !user.onboardingCompleted
  );

  // Track whether we're redirecting to checkout to prevent rendering dashboard
  const [redirectingToCheckout, setRedirectingToCheckout] = useState(false);

  // Server-side billing status check: is the user on a paid tier without a
  // valid subscription?  This catches cases where localStorage pendingPlan was
  // lost (e.g. cleared browser data, different device).
  const needsBillingResolution = useMemo(() => requiresBillingResolution(user), [user]);

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (mustCompleteOnboarding) {
      router.push('/onboarding');
      return;
    }

    // Check for a pending billing plan that hasn't been completed via Stripe
    const pendingPlan = typeof window !== 'undefined'
      ? String(localStorage.getItem('pendingPlan') || '')
      : '';
    if (pendingPlan.length > 0) {
      setRedirectingToCheckout(true);
      router.push(`/billing/checkout?plan=${encodeURIComponent(pendingPlan)}`);
      return;
    }

    // Server-side billing gate: redirect to billing resolution if the
    // organization has a paid tier but no valid subscription
    if (needsBillingResolution) {
      setRedirectingToCheckout(true);
      router.push('/billing/resolve');
      return;
    }
  }, [mustCompleteOnboarding, isAuthenticated, loading, router, needsBillingResolution]);

  // Get access token for WebSocket authentication
  useEffect(() => {
    if (isAuthenticated) {
      const accessToken = getAccessToken();
      setToken(accessToken);
    }
  }, [isAuthenticated]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (!isAuthenticated || mustCompleteOnboarding || redirectingToCheckout || needsBillingResolution) {
    return null;
  }

  return (
    <WebSocketProvider token={token} enabled={isAuthenticated}>
      <div className="flex flex-col h-screen bg-gray-100">
        {/* Server-side update banner — shown to admins when a newer GitHub release is available */}
        <ServerUpdateBanner />
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            <div className="container mx-auto px-6 py-8">{children}</div>
          </main>
          <AICopilot />
          <WebSocketStatusIndicator />
        </div>
      </div>
    </WebSocketProvider>
  );
}
