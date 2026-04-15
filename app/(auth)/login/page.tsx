'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mail, Lock, Loader2, LogIn, ShieldCheck, UserPlus, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      // AuthContext's onAuthStateChange will detect the session,
      // fetch user data, and redirect to /dashboard or /uebersicht (admin)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message.toLowerCase().includes('email not confirmed')) {
        setLoading(false);
        router.push(`/email-not-confirmed?email=${encodeURIComponent(email)}`);
        return;
      }
      const translated =
        message.toLowerCase().includes('invalid login credentials') || message.toLowerCase().includes('invalid log')
          ? 'E-Mail-Adresse oder Passwort ist falsch.'
          : message || 'Login fehlgeschlagen. Bitte prüfen Sie Ihre Daten.';
      setError(translated);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm w-full">
      {/* Logo & Titel */}
      <div className="text-center mb-8">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Voltfang Vermittler Portal</p>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight mt-2">Willkommen zurück</h1>
      </div>

      {/* Login Karte */}
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-7">
        <form onSubmit={handleLogin} className="space-y-5">
          {/* E-Mail Eingabe */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">E-Mail Adresse</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#82a8a4] transition-colors">
                <Mail size={14} />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@beispiel.de"
                required
                className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-[#82a8a4]/10 focus:border-[#82a8a4] outline-none font-bold text-xs text-slate-700 transition-all placeholder:text-slate-300"
              />
            </div>
          </div>

          {/* Passwort Eingabe */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center px-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Passwort</label>
              <button
                type="button"
                onClick={() => router.push('/forgot-password')}
                className="text-[10px] font-bold text-[#82a8a4] hover:underline uppercase tracking-widest"
              >
                Vergessen?
              </button>
            </div>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#82a8a4] transition-colors">
                <Lock size={14} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full pl-11 pr-11 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-[#82a8a4]/10 focus:border-[#82a8a4] outline-none font-bold text-xs text-slate-700 transition-all placeholder:text-slate-300"
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Fehlermeldung */}
          {error && (
            <div className="bg-red-50 text-red-600 text-xs font-bold p-3 rounded-xl border border-red-100 flex items-center gap-2.5">
              <div className="w-4 h-4 rounded-full bg-red-100 flex items-center justify-center shrink-0 text-[10px]">
                !
              </div>
              {error}
            </div>
          )}

          {/* Login Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#82a8a4] hover:bg-[#6d9490] text-white font-semibold text-sm py-3 rounded-xl shadow-md shadow-[#82a8a4]/20 transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <>
                Anmelden <LogIn size={14} />
              </>
            )}
          </button>
        </form>

        {/* Partner werden */}
        <div className="mt-5">
          <button
            onClick={() => router.push('/register')}
            className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-500 font-medium text-xs hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-1.5"
          >
            <UserPlus size={13} /> Jetzt Partner werden
          </button>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-5 border-t border-slate-50 flex items-center justify-center gap-1.5 text-slate-300">
          <ShieldCheck size={11} />
          <span className="text-[10px] font-medium tracking-wide">Sicherer verschlüsselter Zugang</span>
        </div>
      </div>

      <p className="text-center mt-5 text-slate-300 text-[10px]">
        &copy; 2026 Voltfang GmbH · Alle Rechte vorbehalten
      </p>
    </div>
  );
}
