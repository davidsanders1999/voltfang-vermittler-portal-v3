'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface ImpersonationBannerProps {
  userName: string;
  onExit: () => void;
  onRefresh: () => void;
}

export default function ImpersonationBanner({ userName, onExit, onRefresh }: ImpersonationBannerProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    onRefresh();
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-[52px] bg-red-600 flex items-center justify-between px-4 shadow-md">
      <span className="text-white text-xs font-medium">
        Simulierte Portal-Ansicht von <strong>{userName}</strong> — Sie sind im Admin-Modus
      </span>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleRefresh}
          title="Daten aus HubSpot neu laden"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-500 hover:bg-red-400 border border-red-400 rounded-lg transition-colors"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Aktualisieren
        </button>
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-white rounded-lg hover:bg-red-50 transition-colors"
        >
          ← Zurück zum Admin Panel
        </button>
      </div>
    </div>
  );
}
