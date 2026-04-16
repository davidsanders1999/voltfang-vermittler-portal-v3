'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { AdminUser, AdminCompany, User, UserCompany } from '@/types';
import { useRouter } from 'next/navigation';

interface ImpersonationContextValue {
  impersonating: boolean;
  impersonatedUser: User | null;
  impersonatedCompany: UserCompany | null;
  refreshKey: number;
  startImpersonation: (user: AdminUser) => void;
  stopImpersonation: () => void;
  refreshImpersonation: () => void;
}

const ImpersonationContext = createContext<ImpersonationContextValue | undefined>(undefined);

const STORAGE_KEY = 'impersonation_state';

function saveToStorage(user: User, company: UserCompany | null) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ user, company }));
  } catch { /* ignore */ }
}

function loadFromStorage(): { user: User; company: UserCompany | null } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function clearStorage() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

export function ImpersonationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [impersonatedUser, setImpersonatedUser] = useState<User | null>(() => loadFromStorage()?.user ?? null);
  const [impersonatedCompany, setImpersonatedCompany] = useState<UserCompany | null>(() => loadFromStorage()?.company ?? null);
  const [refreshKey, setRefreshKey] = useState(0);

  const startImpersonation = useCallback((user: AdminUser) => {
    // Convert AdminUser to User-like shape for portal views
    const asUser: User = {
      id: user.id,
      auth_id: user.auth_id,
      fname: user.fname,
      lname: user.lname,
      email: user.email,
      phone: user.phone || '',
      company_id: user.company_id,
      vermittlerportal_status: user.vermittlerportal_status || 'Aktiv',
      created_at: user.created_at,
    };
    setImpersonatedUser(asUser);

    // Try to find the company from sessionStorage (admin_companies cache)
    let foundCompany: UserCompany | null = null;
    try {
      const raw = sessionStorage.getItem('admin_companies');
      if (raw) {
        const companies = JSON.parse(raw) as AdminCompany[];
        const match = companies.find((c) => c.id === user.company_id);
        if (match) {
          foundCompany = {
            id: match.id,
            name: match.name,
            website: match.website || '',
            street: match.street || '',
            zip: match.zip || '',
            city: match.city || '',
            country: match.country || '',
            partnerType: match.partnerType || 'Vermittler',
            hubspot_id: match.hubspot_id,
            created_at: match.created_at,
          };
        }
      }
    } catch { /* ignore */ }
    setImpersonatedCompany(foundCompany);
    saveToStorage(asUser, foundCompany);

    router.push('/dashboard');
  }, [router]);

  const stopImpersonation = useCallback(() => {
    setImpersonatedUser(null);
    setImpersonatedCompany(null);
    clearStorage();
    router.push('/uebersicht');
  }, [router]);

  const refreshImpersonation = useCallback(() => {
    // Clear HubSpot context caches so views fetch fresh data
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith('hubspot_context_'))
      .forEach((k) => sessionStorage.removeItem(k));
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <ImpersonationContext.Provider value={{
      impersonating: impersonatedUser !== null,
      impersonatedUser,
      impersonatedCompany,
      refreshKey,
      startImpersonation,
      stopImpersonation,
      refreshImpersonation,
    }}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const context = useContext(ImpersonationContext);
  if (context === undefined) {
    throw new Error('useImpersonation must be used within an ImpersonationProvider');
  }
  return context;
}
