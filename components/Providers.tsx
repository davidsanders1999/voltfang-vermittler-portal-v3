'use client';

import { AuthProvider } from '@/contexts/AuthContext';
import { ImpersonationProvider } from '@/contexts/ImpersonationContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ImpersonationProvider>
        {children}
      </ImpersonationProvider>
    </AuthProvider>
  );
}
