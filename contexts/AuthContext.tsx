'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getHubSpotUserContext } from '@/lib/api/hubspot';
import type { User, UserCompany, SuperAdmin } from '@/types';
import { useRouter, usePathname } from 'next/navigation';

type AuthStatus =
  | 'loading'
  | 'unauthenticated'
  | 'authenticated';

interface AuthContextValue {
  authStatus: AuthStatus;
  userProfile: User | null;
  userCompany: UserCompany | null;
  adminProfile: SuperAdmin | null;
  isAdmin: boolean;
  refreshAuth: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [userCompany, setUserCompany] = useState<UserCompany | null>(null);
  const [adminProfile, setAdminProfile] = useState<SuperAdmin | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Keep pathname in a ref so the onAuthStateChange callback always sees the current value
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const supabase = useRef(createClient()).current;

  const fetchUserData = useCallback(async (authId: string) => {
    try {
      // Check if password change is required (imported users)
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.user_metadata?.must_change_password) {
        setAuthStatus('authenticated');
        router.push('/change-password');
        return;
      }

      const context = await getHubSpotUserContext();
      const currentPath = pathnameRef.current;

      // Super admins have a separate entry
      if (context?.admin) {
        setAdminProfile(context.admin as SuperAdmin);
        setUserProfile(null);
        setUserCompany(null);
        setAuthStatus('authenticated');
        // Redirect admin to admin panel if on login or portal routes
        // But NOT when impersonation is active (admin viewing portal as a user)
        const isImpersonating = !!sessionStorage.getItem('impersonation_state');
        const adminPaths = ['/uebersicht', '/unternehmen', '/nutzer', '/admin-projekte', '/admin-angebote'];
        const isOnAdminPage = adminPaths.some((p) => currentPath.startsWith(p));
        if (!isOnAdminPage && !isImpersonating) {
          router.push('/uebersicht');
        }
        return;
      }

      if (!context?.user || context?.user?.id === undefined) {
        throw new Error('User context missing');
      }
      if (context.user.auth_id && context.user.auth_id !== authId) {
        throw new Error('User mismatch');
      }

      setAdminProfile(null);
      setUserProfile(context.user as User);
      setUserCompany((context.company ?? null) as UserCompany | null);

      if (context.user.vermittlerportal_status === 'Aktiv') {
        setAuthStatus('authenticated');
        // Redirect to dashboard if on auth pages (e.g. after login)
        const authPaths = ['/login', '/register', '/forgot-password', '/reset-password', '/registration-done', '/email-not-confirmed'];
        if (authPaths.some((p) => currentPath.startsWith(p))) {
          router.push('/dashboard');
        }
      } else {
        setAuthStatus('authenticated');
        router.push('/pending-unlock');
      }
    } catch (error) {
      console.error('Fehler beim Laden der Benutzerdaten:', error);
      await supabase.auth.signOut();
      setAuthStatus('unauthenticated');
    }
  }, [supabase, router]);

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        fetchUserData(session.user.id);
      } else {
        setAuthStatus('unauthenticated');
      }
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        router.push('/reset-password');
        return;
      }

      if (event === 'SIGNED_OUT') {
        setUserProfile(null);
        setUserCompany(null);
        setAdminProfile(null);
        setAuthStatus('unauthenticated');
        return;
      }

      if (event === 'SIGNED_IN' && session) {
        fetchUserData(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAuth = useCallback(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        fetchUserData(session.user.id);
      }
    });
  }, [supabase, fetchUserData]);

  const isAdmin = adminProfile !== null;

  return (
    <AuthContext.Provider value={{
      authStatus,
      userProfile,
      userCompany,
      adminProfile,
      isAdmin,
      refreshAuth,
    }}>
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
