'use client';

import {
  LayoutDashboard,
  Building2,
  Users,
  ShieldCheck,
  FolderKanban,
  FileText,
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface AdminSidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
}

const menuItems = [
  { path: '/uebersicht',       label: 'Übersicht',   icon: <LayoutDashboard size={20} /> },
  { path: '/unternehmen',      label: 'Unternehmen', icon: <Building2 size={20} /> },
  { path: '/nutzer',           label: 'Nutzer',       icon: <Users size={20} /> },
  { path: '/admin-projekte',   label: 'Projekte',     icon: <FolderKanban size={20} /> },
  { path: '/admin-angebote',   label: 'Angebote',     icon: <FileText size={20} /> },
];

export default function AdminSidebar({ isOpen, toggleSidebar }: AdminSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { adminProfile } = useAuth();

  const isActive = (path: string) => pathname.startsWith(path);

  const sidebarClasses = `
    fixed inset-y-0 left-0 z-50 w-60 transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0
    ${isOpen ? 'translate-x-0' : '-translate-x-full'}
  `;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 lg:hidden z-40"
          onClick={toggleSidebar}
        />
      )}

      <aside className={sidebarClasses} style={{ backgroundColor: '#1e1e2e' }}>
        <div className="flex flex-col h-full">
          {/* Logo + Admin Badge */}
          <div className="p-6 border-b border-white/5">
            <img src="/Logo_gruen.svg" alt="Voltfang Logo" className="h-8 w-auto mb-3" />
            <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-[#82a8a4]/15 w-fit">
              <ShieldCheck size={12} className="text-[#82a8a4]" />
              <span className="text-[10px] font-bold text-[#82a8a4] uppercase tracking-widest">
                Super-Admin
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
            {menuItems.map((item) => {
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
            })}
          </nav>

          {/* Bottom Profile */}
          <div className="p-3 border-t border-white/[0.06]">
            <div className="flex items-center gap-3 p-2.5 rounded-xl">
              <div className="w-8 h-8 rounded-lg bg-[#82a8a4]/20 flex items-center justify-center text-[#82a8a4] text-[10px] font-bold flex-shrink-0 uppercase">
                {adminProfile ? `${adminProfile.fname[0]}${adminProfile.lname[0]}` : 'SA'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white/90 truncate leading-tight">
                  {adminProfile ? `${adminProfile.fname} ${adminProfile.lname}` : 'Admin'}
                </p>
                <p className="text-[10px] text-[#82a8a4]/70 truncate leading-tight mt-0.5">
                  Super-Admin
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
