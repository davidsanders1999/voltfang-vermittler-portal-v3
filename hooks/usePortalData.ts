'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import type { User, UserCompany } from '@/types';

/**
 * Returns the effective user/company for portal views.
 * During admin impersonation, returns the impersonated user/company
 * instead of the real admin's data.
 */
export function usePortalData() {
  const { userProfile, userCompany } = useAuth();
  const { impersonating, impersonatedUser, impersonatedCompany } = useImpersonation();

  const effectiveUser: User | null = impersonating ? impersonatedUser : userProfile;
  const effectiveCompany: UserCompany | null = impersonating ? impersonatedCompany : userCompany;

  return {
    userProfile: effectiveUser,
    userCompany: effectiveCompany,
    impersonating,
  };
}
