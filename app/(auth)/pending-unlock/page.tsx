'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Clock, LogOut } from 'lucide-react';

export default function PendingUnlockPage() {
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="max-w-md w-full bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8">
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <Clock size={40} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Freischaltung ausstehend</h2>
        <p className="text-slate-500 text-sm">
          Ihr Konto wird derzeit geprüft. Sie erhalten eine Benachrichtigung, sobald Ihr Zugang freigeschaltet wurde.
        </p>
      </div>

      <div className="bg-amber-50 rounded-2xl border border-amber-100 p-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <div className="w-5 h-5 border-2 border-amber-600/30 border-t-amber-600 rounded-full animate-spin" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-amber-800">Prüfung läuft</h3>
            <p className="text-xs text-amber-600">Dieser Vorgang dauert in der Regel 1-2 Werktage.</p>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 text-center mb-5">
        Fragen? <a href="mailto:partner@voltfang.de" className="text-slate-500 hover:text-slate-700 underline">partner@voltfang.de</a>
      </p>

      <button
        onClick={handleLogout}
        className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-500 font-medium text-xs hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-1.5"
      >
        <LogOut size={13} /> Abmelden
      </button>
    </div>
  );
}
