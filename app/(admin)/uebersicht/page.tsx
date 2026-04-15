'use client';

import React, { useEffect, useState } from 'react';
import {
  Building2,
  Users,
  Clock,
  TrendingUp,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AdminOverview } from '@/types';
import { getAdminOverview } from '@/lib/api/admin';

const CACHE_KEY = 'admin_overview';

type NavigateTarget = 'admin_companies' | 'admin_users';

const viewToRoute: Record<NavigateTarget, string> = {
  admin_companies: '/unternehmen',
  admin_users: '/nutzer',
};

export default function AdminUebersichtPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onNavigate = (view: NavigateTarget) => {
    router.push(viewToRoute[view]);
  };

  const load = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await getAdminOverview();
      setOverview(data);
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) {
      if (showLoading) setError(e instanceof Error ? e.message : 'Fehler beim Laden');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    const cached = sessionStorage.getItem(CACHE_KEY);
    let hasCached = false;
    if (cached) {
      try {
        setOverview(JSON.parse(cached) as AdminOverview);
        setLoading(false);
        hasCached = true;
      } catch { /* ignore */ }
    }
    load(!hasCached);
  }, []);

  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-[3px] border-[#82a8a4]/20 border-t-[#82a8a4] rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 text-sm">
        {error}
      </div>
    );
  }

  const kpis = [
    {
      label: 'Unternehmen',
      value: overview?.total_companies ?? 0,
      icon: <Building2 size={20} />,
      navigate: 'admin_companies' as NavigateTarget,
    },
    {
      label: 'Aktive Nutzer',
      value: overview?.active_users ?? 0,
      sub: `${overview?.total_users ?? 0} gesamt`,
      icon: <CheckCircle2 size={20} />,
      navigate: 'admin_users' as NavigateTarget,
    },
    {
      label: 'Ausstehende Freischaltungen',
      value: overview?.pending_users ?? 0,
      icon: <Clock size={20} />,
      navigate: 'admin_users' as NavigateTarget,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin-Übersicht</h1>
          <p className="text-sm text-slate-500 mt-1">Plattform-KPIs auf einen Blick</p>
        </div>
        <button
          onClick={() => load()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={14} />
          Aktualisieren
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            onClick={() => onNavigate(kpi.navigate)}
            className="text-left p-5 rounded-2xl border border-[#82a8a4]/20 bg-[#82a8a4]/[0.06] hover:bg-[#82a8a4]/10 hover:scale-[1.02] active:scale-[0.98] transition-all duration-150 group"
          >
            <div className="text-[#82a8a4] mb-3">{kpi.icon}</div>
            <p className="text-3xl font-bold text-slate-900 tabular-nums">{kpi.value}</p>
            <p className="text-xs font-medium text-slate-600 mt-1">{kpi.label}</p>
            {kpi.sub && (
              <p className="text-[10px] text-slate-400 mt-0.5">{kpi.sub}</p>
            )}
          </button>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">Schnellzugriff</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Nutzer freischalten', sub: `${overview?.pending_users ?? 0} ausstehend`, view: 'admin_users' as NavigateTarget, urgent: (overview?.pending_users ?? 0) > 0 },
            { label: 'Alle Unternehmen', sub: `${overview?.total_companies ?? 0} Partner`, view: 'admin_companies' as NavigateTarget, urgent: false },
            { label: 'Alle Nutzer', sub: `${overview?.total_users ?? 0} gesamt`, view: 'admin_users' as NavigateTarget, urgent: false },
          ].map((action) => (
            <button
              key={action.label}
              onClick={() => onNavigate(action.view)}
              className={`text-left p-4 rounded-xl border transition-all hover:shadow-sm active:scale-[0.98] ${
                action.urgent
                  ? 'border-[#82a8a4]/25 bg-[#82a8a4]/[0.06] hover:bg-[#82a8a4]/10'
                  : 'border-slate-100 bg-slate-50 hover:bg-slate-100/80'
              }`}
            >
              <p className={`text-sm font-semibold ${action.urgent ? 'text-[#4a7370]' : 'text-slate-700'}`}>
                {action.label}
              </p>
              <p className={`text-xs mt-0.5 ${action.urgent ? 'text-[#82a8a4]' : 'text-slate-400'}`}>
                {action.sub}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
