'use client';

import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  Files,
  User as UserIcon
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { usePortalData } from '@/hooks/usePortalData';

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
}

const vermittlerMenu = [
  { path: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { path: '/projekte', label: 'Projekte', icon: <FolderKanban size={20} /> },
  { path: '/dokumente', label: 'Dokumente', icon: <Files size={20} /> },
];

const vertriebspartnerMenu = [
  { path: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { path: '/projekte', label: 'Projekte', icon: <FolderKanban size={20} /> },
  { path: '/angebote', label: 'Angebote', icon: <FileText size={20} /> },
  { path: '/dokumente', label: 'Dokumente', icon: <Files size={20} /> },
];

export default function Sidebar({ isOpen, toggleSidebar }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { userProfile, userCompany } = usePortalData();

  const partnerType = userCompany?.partnerType;
  const menuItems = partnerType === 'Vertriebspartner' ? vertriebspartnerMenu : vermittlerMenu;

  const isActive = (path: string) => {
    if (path === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(path);
  };

  const sidebarClasses = `
    fixed inset-y-0 left-0 z-50 w-60 text-slate-300 transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0
    ${isOpen ? 'translate-x-0' : '-translate-x-full'}
  `;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 lg:hidden z-40"
          onClick={toggleSidebar}
        />
      )}

      <aside className={sidebarClasses} style={{ backgroundColor: '#2d2d3a' }}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-white/5">
            <img
              src="/Logo_gruen.svg"
              alt="Voltfang Logo"
              className="h-10 w-auto"
            />
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
            {!partnerType ? (
              /* Skeleton while user data loads — prevents flash */
              <div className="space-y-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 rounded-lg bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : (
              menuItems.map((item) => {
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => router.push(item.path)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative
                      ${active
                        ? 'bg-white/10 text-white'
                        : 'text-slate-400 hover:bg-white/5 hover:text-white'}
                    `}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#82a8a4] rounded-r-full" />
                    )}
                    <span className={`transition-colors duration-150 ${active ? 'text-[#82a8a4]' : 'group-hover:text-slate-300'}`}>
                      {item.icon}
                    </span>
                    <span className={`flex-1 text-left text-sm transition-colors duration-150 ${active ? 'font-semibold text-white' : 'font-medium'}`}>
                      {item.label}
                    </span>
                  </button>
                );
              })
            )}
          </nav>

          {/* Bottom Profile */}
          <div className="p-3 border-t border-white/[0.06]">
            <button
              onClick={() => router.push('/profil')}
              className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all group text-left ${
                pathname === '/profil' ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-[#82a8a4]/20 flex items-center justify-center text-[#82a8a4] text-[10px] font-bold flex-shrink-0 uppercase">
                {userProfile ? `${userProfile.fname[0]}${userProfile.lname[0]}` : <UserIcon size={15} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white/90 truncate leading-tight">
                  {userCompany?.name || 'Kein Unternehmen'}
                </p>
                <p className="text-[10px] text-slate-500 truncate leading-tight mt-0.5">
                  {userProfile ? `${userProfile.fname} ${userProfile.lname}` : 'Lädt...'}
                </p>
              </div>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
