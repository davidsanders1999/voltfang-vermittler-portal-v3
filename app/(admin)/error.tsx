'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Admin error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
        <AlertCircle size={24} className="text-red-500" />
      </div>
      <h2 className="text-lg font-semibold text-slate-700">
        Ein Fehler ist aufgetreten
      </h2>
      <p className="text-sm text-slate-500 text-center max-w-md">
        Beim Laden der Admin-Seite ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es erneut.
      </p>
      <button
        onClick={reset}
        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#82a8a4] hover:bg-[#6d918d] rounded-lg transition-colors"
      >
        <RefreshCw size={14} />
        Erneut versuchen
      </button>
    </div>
  );
}
