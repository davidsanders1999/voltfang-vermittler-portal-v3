'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';

function RegistrationDoneContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const fname = searchParams.get('fname') ?? '';
  const email = searchParams.get('email') ?? '';
  const companyName = searchParams.get('company') ?? '';

  return (
    <div className="max-w-sm w-full bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8">
      {/* Erfolgs-Header */}
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-1">Registrierung erfolgreich!</h2>
        <p className="text-slate-500 text-sm">
          Willkommen{fname ? `, ${fname}` : ''}!
        </p>
        {companyName && (
          <p className="text-slate-400 text-xs mt-1">
            Team: {companyName}
          </p>
        )}
      </div>

      {/* Nächste Schritte */}
      <div className="border-t border-slate-100 pt-5 mb-6">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-4">Nächste Schritte</p>
        <div className="space-y-4">
          <div className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
            <div>
              <p className="text-sm font-medium text-slate-700">E-Mail bestätigen</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Bestätigungs-E-Mail an <span className="font-medium text-slate-500">{email}</span> gesendet.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
            <div>
              <p className="text-sm font-medium text-slate-700">Freischaltung abwarten</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Ihr Konto wird geprüft und innerhalb von 1-2 Werktagen freigeschaltet.
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 text-center mb-5">
        Fragen? <a href="mailto:partner@voltfang.de" className="text-slate-500 hover:text-slate-700 underline">partner@voltfang.de</a>
      </p>

      <button
        onClick={() => router.push('/login')}
        className="w-full bg-[#82a8a4] hover:bg-[#6d9490] text-white font-semibold py-3 rounded-xl text-sm transition-all active:scale-[0.98] shadow-md shadow-[#82a8a4]/20"
      >
        Zum Login
      </button>
    </div>
  );
}

export default function RegistrationDonePage() {
  return (
    <Suspense fallback={<div className="w-10 h-10 border-[3px] border-[#82a8a4]/20 border-t-[#82a8a4] rounded-full animate-spin" />}>
      <RegistrationDoneContent />
    </Suspense>
  );
}
