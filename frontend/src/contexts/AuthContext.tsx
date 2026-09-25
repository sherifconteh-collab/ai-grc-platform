'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { authAPI, refreshAccessToken } from '@/lib/api';
import { setAccessToken, getAccessToken, clearSession, markSession, hasSessionHint, getSessionExpiresAt, SESSION_EXPIRES_STORAGE_KEY } from '@/lib/tokenStore';
import { useRouter } from 'next/navigation';
import { requiresOrganizationOnboarding } from '@/lib/access';
import { getStoredPendingBillingPlan, requiresBillingResolution } from '@/lib/billing';

// Inactivity timeout in milliseconds (default: 30 minutes).
// Override with NEXT_PUBLIC_INACTIVITY_TIMEOUT_MS environment variable.
const INACTIVITY_TIMEOUT_MS = parseInt(
  process.env.NEXT_PUBLIC_INACTIVITY_TIMEOUT_MS || '1800000',
  10
);

// User interaction events that reset the inactivity timer.
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click',
];

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  organizationId: string;
  organizationName?: string;
  organizationTier?: string;
  effectiveTier?: string;
  billingStatus?: string;
  trialStatus?: string;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  onboardingCompleted?: boolean;
  roles: string[];
  permissions: string[];
  isPlatformAdmin?: boolean;
  isDemoAccount?: boolean;
  featureOverrides?: Record<string, unknown>;
  globalFeatureFlags?: Record<string, boolean>;
  frameworkCodes?: string[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, totpCode?: string) => Promise<void>;
  loginWithTokens: (accessToken: string, sessionExpiresAt?: string | null) => Promise<void>;
  register: (
    email: string,
    password: string,
    fullName: string,
    organizationName?: string,
    initialRole?: 'admin' | 'auditor' | 'user',
    frameworkCodes?: string[],
    informationTypes?: string[]
  ) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  switchOrganization: (orgId: string) => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Pure mapper — no component dependencies, so it lives outside the component
// to avoid stale-closure risks and unnecessary re-creation on each render.
const mapCurrentUser = (userData: any): User => ({
  id: userData.id,
  email: userData.email,
  fullName: userData.full_name,
  role: userData.role,
  organizationId: userData.organization?.id || '',
  organizationName: userData.organization?.name,
  organizationTier: userData.organization?.tier,
  effectiveTier: userData.organization?.effective_tier || userData.organization?.tier,
  billingStatus: userData.organization?.billing_status,
  trialStatus: userData.organization?.trial_status,
  trialStartedAt: userData.organization?.trial_started_at || null,
  trialEndsAt: userData.organization?.trial_ends_at || null,
  onboardingCompleted: Boolean(userData.organization?.onboarding_completed),
  roles: userData.roles || [],
  permissions: userData.permissions || [],
  isPlatformAdmin: Boolean(userData.is_platform_admin),
  isDemoAccount: Boolean(userData.is_demo_account),
  featureOverrides: userData.organization?.feature_overrides || {},
  globalFeatureFlags: userData.organization?.global_feature_flags || {},
  frameworkCodes: userData.organization?.framework_codes || []
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // When the session ends (the refresh cookie's expiry); the cookie itself is
  // HttpOnly and never visible to this code.
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(() => getSessionExpiresAt());
  const router = useRouter();
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoSessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ------------------------------------------------------------------
  // Inactivity timeout — logs the user out after INACTIVITY_TIMEOUT_MS
  // of no user interaction.  Only active while a user is authenticated.
  // ------------------------------------------------------------------
  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const clearDemoSessionTimer = useCallback(() => {
    if (demoSessionTimerRef.current) {
      clearTimeout(demoSessionTimerRef.current);
      demoSessionTimerRef.current = null;
    }
  }, []);

  const storeTokens = useCallback((accessToken: string, nextSessionExpiresAt?: string | null) => {
    // The access token stays in memory only; the refresh token was set by the
    // API as an HttpOnly cookie, out of reach of any script on the page.
    setAccessToken(accessToken);
    markSession(nextSessionExpiresAt);
    setSessionExpiresAt(getSessionExpiresAt());
  }, []);

  const clearStoredTokens = useCallback(() => {
    clearSession();
    setSessionExpiresAt(null);
  }, []);

  const resetInactivityTimer = useCallback((doLogout: () => Promise<void>) => {
    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(() => {
      doLogout();
    }, INACTIVITY_TIMEOUT_MS);
  }, [clearInactivityTimer]);

  const resolvePostAuthRoute = (currentUser: User) => {
    const pendingPlan = getStoredPendingBillingPlan();
    const hasPendingPlan = pendingPlan.length > 0;

    // Platform admins skip onboarding — they go straight to the dashboard
    if (currentUser.isPlatformAdmin) {
      return '/dashboard';
    }

    if (requiresOrganizationOnboarding(currentUser) && !currentUser.onboardingCompleted) {
      return '/onboarding';
    }

    if (hasPendingPlan) {
      // Don't remove pendingPlan here — it must survive until Stripe checkout
      // actually succeeds (cleared on the billing/success page).
      return `/billing/checkout?plan=${encodeURIComponent(pendingPlan)}`;
    }

    // Server-side billing gate: if the user has a paid tier but no valid
    // subscription (and no active trial), send them to billing resolution.
    if (requiresBillingResolution(currentUser)) {
      return '/billing/resolve';
    }

    if (String(currentUser.role || '').toLowerCase() === 'auditor') {
      return '/dashboard/auditor-workspace';
    }

    return '/dashboard';
  };

  const fetchCurrentUser = useCallback(async (): Promise<User> => {
    const response = await authAPI.getCurrentUser();
    return mapCurrentUser(response.data.data);
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      // The access token lives in memory and is lost on page refresh.
      // Re-hydrate it silently through the refresh cookie so the user stays
      // logged in across hard reloads.
      if (!getAccessToken()) {
        if (!hasSessionHint()) {
          setLoading(false);
          return;
        }
        try {
          // refreshAccessToken uses raw axios (not the shared intercepted
          // instance), so a 401 here cannot loop through the interceptor.
          // refreshAccessToken persists the rotated refresh token and shares
          // one in-flight refresh with any concurrent 401 retries.
          await refreshAccessToken();
          setSessionExpiresAt(getSessionExpiresAt());
        } catch (refreshErr) {
          // Refresh token is expired or invalid — treat as logged out.
          console.warn('Silent token refresh on page load failed:', refreshErr instanceof Error ? refreshErr.message : String(refreshErr));
          clearStoredTokens();
          setLoading(false);
          return;
        }
      }

      const currentUser = await fetchCurrentUser();
      setSessionExpiresAt(getSessionExpiresAt());
      setUser(currentUser);
    } catch (error) {
      console.error('Auth check failed:', error);
      clearStoredTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [clearStoredTokens, fetchCurrentUser]);

  // Check if user is logged in on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const refreshUser = async () => {
    const currentUser = await fetchCurrentUser();
    setUser(currentUser);
  };

  const switchOrganization = useCallback(async (orgId: string) => {
    const response = await authAPI.switchOrganization(orgId);
    const { tokens } = response.data.data;
    storeTokens(tokens.accessToken, tokens.sessionExpiresAt);
    const currentUser = await fetchCurrentUser();
    setUser(currentUser);
  }, [storeTokens, fetchCurrentUser]);

  const login = useCallback(async (email: string, password: string, totpCode?: string) => {
    try {
      const response = await authAPI.login({
        email,
        password,
        ...(totpCode ? { totp_code: totpCode } : {})
      });

      if (response.data?.totp_required) {
        const totpError = new Error(response.data?.message || 'Authenticator code required');
        (totpError as Error & { code?: string }).code = 'TOTP_REQUIRED';
        throw totpError;
      }

      const { tokens } = response.data.data;

      storeTokens(tokens.accessToken, tokens.sessionExpiresAt);

      const currentUser = await fetchCurrentUser();
      setUser(currentUser);

      router.push(resolvePostAuthRoute(currentUser));
    } catch (error: any) {
      if (error?.code === 'TOTP_REQUIRED') {
        throw error;
      }
      throw new Error(error.response?.data?.error || 'Login failed');
    }
  }, [fetchCurrentUser, router, storeTokens]);

  const loginWithTokens = useCallback(async (accessToken: string, nextSessionExpiresAt?: string | null) => {
    storeTokens(accessToken, nextSessionExpiresAt);
    const currentUser = await fetchCurrentUser();
    setUser(currentUser);
    router.push(resolvePostAuthRoute(currentUser));
  }, [fetchCurrentUser, router, storeTokens]);

  const register = useCallback(async (
    email: string,
    password: string,
    fullName: string,
    organizationName: string = '',
    initialRole: 'admin' | 'auditor' | 'user' = 'admin',
    frameworkCodes: string[] = [],
    informationTypes: string[] = []
  ) => {
    try {
      const response = await authAPI.register({
        email,
        password,
        fullName,
        organizationName,
        initialRole,
        frameworkCodes,
        informationTypes
      });
      const { tokens } = response.data.data;

      storeTokens(tokens.accessToken, tokens.sessionExpiresAt);

      const currentUser = await fetchCurrentUser();
      setUser(currentUser);

      router.push(resolvePostAuthRoute(currentUser));
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Registration failed');
    }
  }, [fetchCurrentUser, router, storeTokens]);

  const logout = useCallback(async () => {
    clearInactivityTimer();
    clearDemoSessionTimer();
    try {
      // The API revokes the session and clears the refresh cookie.
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearStoredTokens();
      setUser(null);
      router.push('/login');
    }
  }, [clearDemoSessionTimer, clearInactivityTimer, clearStoredTokens, router]);

  // Start or stop the inactivity timer whenever the user's identity changes.
  // Using user?.id (a stable primitive) prevents the effect from re-running
  // when refreshUser updates non-identity fields on the user object.
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) {
      clearInactivityTimer();
      return;
    }

    const handleActivity = () => resetInactivityTimer(logout);

    // Attach activity listeners and start the initial timer.
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));
    resetInactivityTimer(logout);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, handleActivity));
      clearInactivityTimer();
    };
  }, [userId, logout, clearInactivityTimer, resetInactivityTimer]);

  useEffect(() => {
    if (!userId || !user?.isDemoAccount) {
      clearDemoSessionTimer();
      return;
    }

    const scheduleDemoLogout = () => {
      const expiresAtMs = sessionExpiresAt ? new Date(sessionExpiresAt).getTime() : NaN;

      if (!Number.isFinite(expiresAtMs)) {
        clearDemoSessionTimer();
        return;
      }

      const msUntilExpiry = expiresAtMs - Date.now();
      if (msUntilExpiry <= 0) {
        clearDemoSessionTimer();
        logout();
        return;
      }

      clearDemoSessionTimer();
      demoSessionTimerRef.current = setTimeout(() => {
        logout();
      }, msUntilExpiry);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === SESSION_EXPIRES_STORAGE_KEY) {
        setSessionExpiresAt(event.newValue);
      }
    };

    scheduleDemoLogout();
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
      clearDemoSessionTimer();
    };
  }, [user?.isDemoAccount, userId, sessionExpiresAt, logout, clearDemoSessionTimer]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        loginWithTokens,
        register,
        refreshUser,
        logout,
        switchOrganization,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
