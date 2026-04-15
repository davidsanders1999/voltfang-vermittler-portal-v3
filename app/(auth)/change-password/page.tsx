'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Lock, Eye, EyeOff, Loader2, ShieldCheck, KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ChangePasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }
    if (password !== confirm) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: { must_change_password: false },
      });
      if (updateError) throw updateError;
      router.push('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      setError(message || 'Passwort konnte nicht gesetzt werden.');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm w-full">
      <div className="text-center mb-8">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Voltfang Vermittler Portal</p>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight mt-2">Passwort einrichten</h1>
      </div>

      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-7">
        <p className="text-xs text-slate-400 mb-5 leading-relaxed">
          Bitte setzen Sie jetzt Ihr persönliches Passwort. Dies ist nur beim ersten Login erforderlich.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Neues Passwort</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#82a8a4] transition-colors">
                <Lock size={14} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mind. 8 Zeichen"
                required
                autoFocus
                className="w-full pl-11 pr-11 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-[#82a8a4]/10 focus:border-[#82a8a4] outline-none font-bold text-xs text-slate-700 transition-all placeholder:text-slate-300"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Passwort bestätigen</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#82a8a4] transition-colors">
                <Lock size={14} />
              </div>
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full pl-11 pr-11 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-[#82a8a4]/10 focus:border-[#82a8a4] outline-none font-bold text-xs text-slate-700 transition-all placeholder:text-slate-300"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label={showConfirm ? 'Passwort verbergen' : 'Passwort anzeigen'}
              >
                {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-xs font-bold p-3 rounded-xl border border-red-100 flex items-center gap-2.5">
              <div className="w-4 h-4 rounded-full bg-red-100 flex items-center justify-center shrink-0 text-[10px]">!</div>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#82a8a4] hover:bg-[#6d9490] text-white font-semibold text-sm py-3 rounded-xl shadow-md shadow-[#82a8a4]/20 transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <>
                Passwort speichern <KeyRound size={14} />
              </>
            )}
          </button>
        </form>

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
