'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { requiresOrganizationOnboarding, hasPermission } from '@/lib/access';
import { requiresBillingResolution, readValidPendingPlan } from '@/lib/billing';
import { WebSocketProvider } from '@/contexts/WebSocketContext';
import { WebSocketStatusIndicator } from './WebSocketStatusIndicator';
import Sidebar from './Sidebar';
import AICopilot from './AICopilot';
import { getAccessToken } from '@/lib/tokenStore';
import { licenseAPI } from '@/lib/api';

interface UpdateCheckData {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  updateRequired: boolean;
  minVersionRequired: string | null;
  releaseUrl: string;
  releaseName: string | null;
  source: string;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  // Update-available banner state (visible to users with settings.manage permission)
  const [updateData, setUpdateData] = useState<UpdateCheckData | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const canManageSettings = hasPermission(user, 'settings.manage');
  
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

    // Check for a pending billing plan that hasn't been completed via Stripe.
    // readValidPendingPlan() validates against VALID_BILLING_PLANS and auto-clears
    // any stale/malformed value so we never redirect the user to checkout with
    // a SKU Stripe will reject.
    const pendingPlan = readValidPendingPlan();
    if (pendingPlan) {
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

  // Fetch update check data once when the user has settings.manage access.
  // Required updates always re-surface even if a prior optional banner was dismissed.
  useEffect(() => {
    if (!isAuthenticated || !canManageSettings) return;

    licenseAPI.checkUpdates()
      .then((res) => {
        const d: UpdateCheckData = res.data?.data;
        if (!d) return;
        if (d.updateRequired) {
          // Required updates are always shown — ignore any prior dismissal.
          setUpdateData(d);
          setBannerDismissed(false);
        } else if (d.updateAvailable) {
          const SESSION_KEY = 'cw_update_check_dismissed';
          const dismissed = typeof window !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === '1';
          if (!dismissed) {
            setUpdateData(d);
          }
        }
      })
      .catch(() => { /* non-fatal — banner simply won't show */ });
  }, [isAuthenticated, canManageSettings]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const showBanner = updateData !== null && !bannerDismissed;
  const isRequired = updateData?.updateRequired ?? false;

  const dismissBanner = () => {
    setBannerDismissed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('cw_update_check_dismissed', '1');
    }
  };

  return (
    <WebSocketProvider token={token} enabled={isAuthenticated}>
      <div className="flex h-screen bg-gray-100">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {showBanner && (
            <div
              role={isRequired ? 'alert' : 'status'}
              aria-live={isRequired ? 'assertive' : 'polite'}
              className={`w-full px-6 py-2.5 flex items-center justify-between gap-4 text-sm ${
                isRequired
                  ? 'bg-red-600 text-white'
                  : 'bg-amber-400 text-amber-900'
              }`}
            >
              <span className="font-medium">
                {isRequired
                  ? `🔴 Required update: your license requires at least v${updateData!.minVersionRequired}. You are running v${updateData!.currentVersion}.`
                  : `🟡 ControlWeave v${updateData!.latestVersion} is available (you have v${updateData!.currentVersion}${updateData!.releaseName ? ` — "${updateData!.releaseName}"` : ''}).`}
                {' '}
                <a
                  href={updateData!.releaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`underline font-semibold ${isRequired ? 'text-white' : 'text-amber-900'}`}
                >
                  View release →
                </a>
              </span>
              {!isRequired && (
                <button
                  type="button"
                  onClick={dismissBanner}
                  aria-label="Dismiss update banner"
                  className="shrink-0 opacity-70 hover:opacity-100 text-lg leading-none"
                >
                  ×
                </button>
              )}
            </div>
          )}
          <div className="container mx-auto px-6 py-8">{children}</div>
        </main>
        <AICopilot />
        <WebSocketStatusIndicator />
      </div>
    </WebSocketProvider>
  );
}
