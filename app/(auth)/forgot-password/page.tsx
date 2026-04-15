'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mail, Loader2, ArrowLeft, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      setError(message || 'Anfrage fehlgeschlagen. Bitte prüfen Sie Ihre E-Mail.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-10 text-center">
        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <Send size={40} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-4">E-Mail gesendet!</h2>
        <p className="text-slate-500 text-sm leading-relaxed mb-8">
          Wir haben Ihnen einen Link zum Zurücksetzen Ihres Passworts an <strong>{email}</strong> gesendet.
        </p>
        <button
          onClick={() => router.push('/login')}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-2xl transition-all"
        >
          Zurück zum Login
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md w-full">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-slate-800 tracking-tight mb-2">Passwort vergessen?</h1>
        <p className="text-slate-500 text-sm">Geben Sie Ihre E-Mail ein, um einen Reset-Link zu erhalten.</p>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/60 border border-slate-100 p-8 md:p-10">
        <form onSubmit={handleResetRequest} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">E-Mail Adresse</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#82a8a4] transition-colors">
                <Mail size={18} />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@beispiel.de"
                required
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-[#82a8a4]/10 focus:border-[#82a8a4] outline-none font-medium text-sm text-slate-700 transition-all"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-xs font-bold p-4 rounded-xl border border-red-100">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : 'Link anfordern'}
          </button>

          <button
            type="button"
            onClick={() => router.push('/login')}
            className="w-full flex items-center justify-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-800 transition-colors pt-2"
          >
            <ArrowLeft size={18} /> Zurück zum Login
          </button>
        </form>
      </div>
    </div>
  );
}
