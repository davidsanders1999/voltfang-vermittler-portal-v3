'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  ChevronDown,
  Menu,
  User as UserIcon,
  LogOut
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { usePortalData } from '@/hooks/usePortalData';
import { useImpersonation } from '@/contexts/ImpersonationContext';

interface TopbarProps {
  onSidebarToggle: () => void;
}

const viewLabels: Record<string, string> = {
  '/dashboard': 'Dashboard Übersicht',
  '/projekte': 'Projektverwaltung',
  '/angebote': 'Angebote',
  '/dokumente': 'Dokumente',
  '/profil': 'Mein Profil',
};

export default function Topbar({ onSidebarToggle }: TopbarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showLogoutHint, setShowLogoutHint] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const { userProfile, userCompany } = usePortalData();
  const { impersonating } = useImpersonation();

  // Derive page title from pathname
  const pageTitle = Object.entries(viewLabels).find(([path]) =>
    pathname.startsWith(path)
  )?.[1] ?? '';

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    if (impersonating) {
      setShowLogoutHint(true);
      setTimeout(() => setShowLogoutHint(false), 3000);
      return;
    }
    setIsMenuOpen(false);
    await supabase.auth.signOut();
    router.push('/login');
  };

  const userInitials = userProfile
    ? `${userProfile.fname[0]}${userProfile.lname[0]}`.toUpperCase()
    : '?';

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-5 bg-white border-b border-slate-100">
      <div className="flex items-center gap-4">
        <button
          onClick={onSidebarToggle}
          className="lg:hidden p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <Menu size={18} />
        </button>
        <h1 className="text-sm font-semibold text-slate-700 hidden sm:block tracking-tight">
          {pageTitle}
        </h1>
      </div>

      <div className="flex items-center gap-3 relative" ref={menuRef}>
        {/* Profile Action */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Benutzerprofil öffnen"
          className="flex items-center gap-2.5 group py-1.5 pl-1.5 pr-2.5 hover:bg-slate-50 rounded-xl transition-all"
        >
          <div className="w-7 h-7 rounded-lg bg-[#82a8a4]/15 text-[#5a7a76] flex items-center justify-center text-[10px] font-bold flex-shrink-0">
            {userInitials}
          </div>
          <div className="hidden text-left lg:block">
            <p className="text-xs font-semibold text-slate-700 leading-none">
              {userProfile ? `${userProfile.fname} ${userProfile.lname}` : 'Lädt...'}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-none">
              {userCompany?.name || 'Administrator'}
            </p>
          </div>
          <ChevronDown
            size={13}
            className={`text-slate-300 group-hover:text-slate-500 transition-transform duration-300 ${isMenuOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Dropdown Menu */}
        {isMenuOpen && (
          <div className="absolute top-full right-0 mt-2 w-44 bg-white border border-slate-100 rounded-2xl shadow-lg shadow-slate-200/40 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-1.5">
              <button
                onClick={() => { router.push('/profil'); setIsMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-[#82a8a4] rounded-xl transition-colors tracking-wide"
              >
                <div className="w-6 h-6 rounded-lg bg-slate-50 flex items-center justify-center text-[#82a8a4]">
                  <UserIcon size={12} />
                </div>
                Mein Profil
              </button>

              <div className="my-1 h-px bg-slate-50" />

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-semibold text-red-500 hover:bg-red-50 rounded-xl transition-colors tracking-wide"
              >
                <div className="w-6 h-6 rounded-lg bg-red-50 flex items-center justify-center">
                  <LogOut size={12} />
                </div>
                Abmelden
              </button>

              {showLogoutHint && (
                <div className="mt-1.5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-[10px] font-medium text-amber-700 leading-snug">
                    Die Abmeldung ist nur über das Admin Panel möglich. Nutzen Sie den Button im roten Banner oben.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
