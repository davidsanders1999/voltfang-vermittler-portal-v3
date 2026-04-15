'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Suspense, useState } from 'react';

function EmailNotConfirmedContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();
  const email = searchParams.get('email') ?? '';
  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    try {
      await supabase.auth.resend({
        type: 'signup',
        email,
      });
      alert('Bestätigungs-E-Mail wurde erneut gesendet!');
    } catch {
      alert('Fehler beim Senden. Bitte versuchen Sie es später erneut.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="max-w-md w-full bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8">
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">E-Mail bestätigen</h2>
        <p className="text-slate-500 text-sm">
          Bitte bestätigen Sie Ihre E-Mail-Adresse, um fortzufahren.
        </p>
      </div>

      <div className="bg-amber-50 rounded-2xl border border-amber-100 p-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <div className="w-5 h-5 border-2 border-amber-600/30 border-t-amber-600 rounded-full animate-spin" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-amber-800">E-Mail-Bestätigung ausstehend</h3>
            <p className="text-xs text-amber-600">
              Wir haben eine Bestätigungs-E-Mail an <strong>{email}</strong> gesendet.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <button
          onClick={handleResend}
          disabled={resending}
          className="w-full bg-[#82a8a4] hover:bg-[#6d9490] text-white font-semibold py-3 rounded-xl text-sm transition-all active:scale-[0.98] shadow-md shadow-[#82a8a4]/20 flex items-center justify-center gap-2 disabled:opacity-70"
        >
          <RefreshCw size={14} className={resending ? 'animate-spin' : ''} />
          E-Mail erneut senden
        </button>

        <button
          onClick={() => router.push('/login')}
          className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-500 font-medium text-xs hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-1.5"
        >
          <ArrowLeft size={13} /> Zurück zum Login
        </button>
      </div>
    </div>
  );
}

export default function EmailNotConfirmedPage() {
  return (
    <Suspense fallback={<div className="w-10 h-10 border-[3px] border-[#82a8a4]/20 border-t-[#82a8a4] rounded-full animate-spin" />}>
      <EmailNotConfirmedContent />
    </Suspense>
  );
}
