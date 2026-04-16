'use client';

import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import ImpersonationBanner from '@/components/layout/ImpersonationBanner';
import { useImpersonation } from '@/contexts/ImpersonationContext';

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { impersonating, impersonatedUser, stopImpersonation, refreshImpersonation } = useImpersonation();

  return (
    <>
      {impersonating && impersonatedUser && (
        <ImpersonationBanner
          userName={`${impersonatedUser.fname} ${impersonatedUser.lname}`}
          onExit={stopImpersonation}
          onRefresh={refreshImpersonation}
        />
      )}
      <div className={`flex overflow-hidden bg-[#f8fafc] ${impersonating ? 'mt-[52px] h-[calc(100vh-52px)]' : 'h-screen'}`}>
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
