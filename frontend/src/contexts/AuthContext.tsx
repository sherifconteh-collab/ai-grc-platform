'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '@/lib/api';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  organizationId: string;
  organizationName?: string;
  roles: string[];
  permissions: string[];
  onboardingCompleted?: boolean;
  isPlatformAdmin?: boolean;
  organizationTier?: string;
  effectiveTier?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, totpCode?: string) => Promise<void>;
  loginWithTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, organizationName: string, role?: string, frameworkCodes?: string[], informationTypes?: string[]) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Check if user is logged in on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await authAPI.getCurrentUser();

      // /me endpoint returns user data directly in response.data.data, not nested in "user"
      const userData = response.data.data;
      setUser({
        id: userData.id,
        email: userData.email,
        fullName: userData.full_name,
        role: userData.role,
        organizationId: userData.organization.id,
        organizationName: userData.organization?.name || undefined,
        roles: userData.roles || [],
        permissions: userData.permissions || [],
        onboardingCompleted: Boolean(userData.onboarding_completed),
        isPlatformAdmin: Boolean(userData.is_platform_admin),
        organizationTier: userData.organization_tier || userData.organization?.tier || undefined,
        effectiveTier: userData.effective_tier || userData.organization_tier || userData.organization?.tier || undefined,
      });
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string, totpCode?: string) => {
    try {
      const response = await authAPI.login({ email, password, ...(totpCode ? { totp_code: totpCode } : {}) });
      const { tokens } = response.data.data;

      localStorage.setItem('accessToken', tokens.accessToken);
      localStorage.setItem('refreshToken', tokens.refreshToken);

      await checkAuth();
      router.push('/dashboard');
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Login failed';
      const code = error.response?.data?.code;
      const err = new Error(msg);
      if (code) (err as any).code = code;
      throw err;
    }
  };

  const loginWithTokens = async (accessToken: string, refreshToken: string) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    await checkAuth();
    router.push('/dashboard');
  };

  const register = async (email: string, password: string, fullName: string, organizationName: string, role?: string, frameworkCodes?: string[], informationTypes?: string[]) => {
    try {
      const response = await authAPI.register({
        email,
        password,
        fullName,
        organizationName,
        ...(role ? { initialRole: role as 'admin' | 'auditor' | 'user' } : {}),
        ...(frameworkCodes?.length ? { frameworkCodes } : {}),
        ...(informationTypes?.length ? { informationTypes } : {}),
      });
      const { tokens } = response.data.data;

      localStorage.setItem('accessToken', tokens.accessToken);
      localStorage.setItem('refreshToken', tokens.refreshToken);

      await checkAuth();
      router.push('/dashboard');
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Registration failed';
      const code = error.response?.data?.code;
      const err = new Error(msg);
      if (code) (err as any).code = code;
      throw err;
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
      router.push('/login');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        loginWithTokens,
        register,
        logout,
        refreshUser: checkAuth,
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
