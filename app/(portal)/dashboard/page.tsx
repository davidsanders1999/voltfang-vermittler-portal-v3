'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  ArrowRight,
  Calendar,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { Project } from '@/types';
import StatusBadge from '@/components/ui/StatusBadge';
import { getHubSpotContext } from '@/lib/api/hubspot';
import { usePortalData } from '@/hooks/usePortalData';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function DashboardPage() {
  const router = useRouter();
  const { userProfile, userCompany } = usePortalData();

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [chartMode, setChartMode] = useState<'kwh' | 'count'>('kwh');
  const [vpChartMode, setVpChartMode] = useState<'eur' | 'kwh' | 'count'>('eur');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const getDashboardCacheKey = () =>
    userProfile?.company_id ? `hubspot_context_dashboard_${userProfile.company_id}` : null;

  const formatEuro = (value: number) => {
    if (!value || value === 0) return '—';
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatCapacity = (value: number) => {
    if (!value || value === 0) return '— kWh';
    if (value >= 1000) return `${(value / 1000).toFixed(1).replace('.', ',')} MWh`;
    return `${Math.round(value).toLocaleString('de-DE')} kWh`;
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!userProfile?.company_id) return;
      const cacheKey = getDashboardCacheKey();
      let hasCached = false;
      if (cacheKey) {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as Project[];
            setProjects(parsed);
            setLoading(false);
            hasCached = parsed.length > 0;
          } catch { /* ignore */ }
        }
      }
      if (!hasCached) setLoading(true);
      try {
        const context = await getHubSpotContext(userProfile?.company_id);
        const next = context?.projects || [];
        setProjects(next);
        if (cacheKey) sessionStorage.setItem(cacheKey, JSON.stringify(next));
      } catch (e) {
        console.error('Fehler beim Laden der Dashboard-Daten:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.company_id]);

  // ── KPI-Berechnung ────────────────────────────────────────────────────────
  const estimatedCapacityMidpoint = (ec: string | undefined): number => {
    switch (ec) {
      case '100 - 500 kWh':   return 300;
      case '500 - 1000 kWh':  return 750;
      case '1000 - 5000 kWh': return 3000;
      case '>5000 kWh':       return 7500;
      default:                return 0;
    }
  };

  const stats = useMemo(() => {
    const activeProjects = projects.filter(
      p => p.dealstage !== 'Gewonnen' && p.dealstage !== 'Verloren',
    );
    const activeCount = activeProjects.length;

    const pipelineVolume = activeProjects.reduce((s, p) => {
      if (p.offered_capacity && p.offered_capacity > 0) return s + p.offered_capacity;
      return s + estimatedCapacityMidpoint(p.estimated_capacity);
    }, 0);

    const avgCapacity = activeCount > 0 ? pipelineVolume / activeCount : 0;

    const hasEstimates = activeProjects.some(
      p => (!p.offered_capacity || p.offered_capacity === 0) && p.estimated_capacity,
    );

    const wonCount = projects.filter(p => p.dealstage === 'Gewonnen').length;
    const lostCount = projects.filter(p => p.dealstage === 'Verloren').length;
    const totalFinished = wonCount + lostCount;
    const closingRate =
      totalFinished > 0
        ? ((wonCount / totalFinished) * 100).toFixed(1) + '%'
        : null;

    return { activeCount, pipelineVolume, avgCapacity, closingRate, hasEstimates };
  }, [projects]);

  // ── Funnel-Daten ──────────────────────────────────────────────────────────
  const funnelData = useMemo(() => {
    const counts = projects.reduce(
      (acc, p) => { acc[p.dealstage] = (acc[p.dealstage] || 0) + 1; return acc; },
      {} as Record<string, number>,
    );
    const activePipeline = [
      { status: 'Eingangsprüfung', count: counts['Eingangsprüfung'] || 0 },
      { status: 'Technische Klärung', count: counts['Technische Klärung'] || 0 },
      { status: 'Angebotsklärung', count: counts['Angebotsklärung'] || 0 },
      { status: 'Closing', count: counts['Closing'] || 0 },
    ];
    const totalActive = activePipeline.reduce((s, p) => s + p.count, 0);
    return {
      activePipeline,
      completed: { won: counts['Gewonnen'] || 0, lost: counts['Verloren'] || 0 },
      totalActive,
    };
  }, [projects]);

  // ── Chart-Daten (kWh + Stückzahl) ────────────────────────────────────────
  const capacityTrendData = useMemo(() => {
    const months = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    const data = months.map(m => ({ month: m, capacity: 0, count: 0 }));
    projects
      .filter(
        p =>
          p.dealstage === 'Gewonnen' &&
          p.close_date &&
          new Date(p.close_date).getFullYear() === parseInt(selectedYear),
      )
      .forEach(p => {
        const idx = new Date(p.close_date!).getMonth();
        data[idx].capacity += p.offered_capacity || 0;
        data[idx].count += 1;
      });
    return data;
  }, [projects, selectedYear]);

  const yearStats = useMemo(() => {
    const won = projects.filter(
      p =>
        p.dealstage === 'Gewonnen' &&
        p.close_date &&
        new Date(p.close_date).getFullYear() === parseInt(selectedYear),
    );
    const capacity = won.reduce((s, p) => s + (p.offered_capacity || 0), 0);
    const count = won.length;
    return { capacity, count, avgCapacity: count > 0 ? capacity / count : 0 };
  }, [projects, selectedYear]);

  // ── Vertriebspartner KPIs ─────────────────────────────────────────────────
  const vpStats = useMemo(() => {
    const active = projects.filter(p => p.dealstage !== 'Gewonnen' && p.dealstage !== 'Verloren');
    const activeWithOffer = active.filter(p => p.deal_value && p.deal_value > 0);
    const activeWithOfferPct = active.length > 0
      ? Math.round((activeWithOffer.length / active.length) * 100)
      : 0;

    const pipelineValue = activeWithOffer.reduce((s, p) => s + (p.deal_value || 0), 0);
    const pipelineCapacity = activeWithOffer.reduce((s, p) => s + (p.offered_capacity || 0), 0);

    const won = projects.filter(p => p.dealstage === 'Gewonnen');
    const lost = projects.filter(p => p.dealstage === 'Verloren');
    const wonRevenue = won.reduce((s, p) => s + (p.deal_value || 0), 0);
    const wonCapacity = won.reduce((s, p) => s + (p.offered_capacity || 0), 0);

    const totalFinished = won.length + lost.length;
    const closingRate = totalFinished > 0
      ? ((won.length / totalFinished) * 100).toFixed(1) + '%'
      : null;

    const pipelineCount = activeWithOffer.length;
    const pipelineAvgCapacity = pipelineCount > 0 ? pipelineCapacity / pipelineCount : 0;
    const pipelineAvgValue = pipelineCount > 0 ? pipelineValue / pipelineCount : 0;

    const wonCount = won.length;
    const wonAvgCapacity = wonCount > 0 ? wonCapacity / wonCount : 0;
    const wonAvgValue = wonCount > 0 ? wonRevenue / wonCount : 0;

    return {
      activeCount: active.length,
      activeWithOfferCount: pipelineCount,
      activeWithOfferPct,
      pipelineValue,
      pipelineCapacity,
      pipelineAvgCapacity,
      pipelineAvgValue,
      wonRevenue,
      wonCapacity,
      wonAvgCapacity,
      wonAvgValue,
      wonCount,
      totalFinished,
      closingRate,
    };
  }, [projects]);

  const vpTrendData = useMemo(() => {
    const months = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    const data = months.map(m => ({ month: m, capacity: 0, count: 0, revenue: 0 }));
    projects
      .filter(p =>
        p.dealstage === 'Gewonnen' &&
        p.close_date &&
        new Date(p.close_date).getFullYear() === parseInt(selectedYear),
      )
      .forEach(p => {
        const idx = new Date(p.close_date!).getMonth();
        data[idx].capacity += p.offered_capacity || 0;
        data[idx].count += 1;
        data[idx].revenue += p.deal_value || 0;
      });
    return data;
  }, [projects, selectedYear]);

  const vpYearStats = useMemo(() => {
    const won = projects.filter(p =>
      p.dealstage === 'Gewonnen' &&
      p.close_date &&
      new Date(p.close_date).getFullYear() === parseInt(selectedYear),
    );
    return {
      capacity: won.reduce((s, p) => s + (p.offered_capacity || 0), 0),
      count: won.length,
      revenue: won.reduce((s, p) => s + (p.deal_value || 0), 0),
    };
  }, [projects, selectedYear]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading && projects.length === 0) {
    return <LoadingSpinner text="Dashboard wird geladen…" />;
  }

  // ── Vertriebspartner-Dashboard ───────────────────────────────────────────
  if (userCompany?.partnerType === 'Vertriebspartner') {
    const vpYAxisFormatter = (v: number) => {
      if (vpChartMode === 'eur') {
        if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M €`;
        if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k €`;
        return `${v} €`;
      }
      if (vpChartMode === 'kwh') return v >= 1000 ? `${(v / 1000).toFixed(1)}M` : String(v);
      return String(v);
    };
    const vpDataKey = vpChartMode === 'eur' ? 'revenue' : vpChartMode === 'kwh' ? 'capacity' : 'count';

    return (
      <div className="space-y-8">
        {/* Welcome Header */}
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">
            Willkommen zurück, {userProfile?.fname}.
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Performance-Übersicht für {userCompany?.name}
          </p>
        </div>

        {/* KPI-Reihe */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Aktive Projekte */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5 flex flex-col">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Aktive Projekte</p>
            <p className="text-3xl font-bold text-slate-800 tabular-nums mt-3">{vpStats.activeCount}</p>
            <div className="mt-auto pt-3 border-t border-slate-50 space-y-2.5">
              {[
                { label: 'Ohne Angebot', count: vpStats.activeCount - vpStats.activeWithOfferCount, color: 'bg-slate-200' },
                { label: 'Mit Angebot',  count: vpStats.activeWithOfferCount, color: 'bg-[#82a8a4]' },
              ].map(({ label, count, color }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-400">{label}</span>
                    <span className="text-[10px] font-bold text-slate-600">{count}</span>
                  </div>
                  <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${color}`}
                      style={{ width: vpStats.activeCount > 0 ? `${(count / vpStats.activeCount) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pipeline-Wert */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5 flex flex-col">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Pipeline-Wert</p>
            {vpStats.activeWithOfferCount > 0 ? (
              <>
                <p className="text-3xl font-bold text-slate-800 tabular-nums mt-3">{formatEuro(vpStats.pipelineValue)}</p>
                <div className="mt-auto pt-3 border-t border-slate-50 space-y-1.5">
                  {[
                    { label: 'Kapazität',    value: formatCapacity(vpStats.pipelineCapacity) },
                    { label: 'Anzahl',       value: `${vpStats.activeWithOfferCount} Deals` },
                    { label: 'Ø Kapazität', value: formatCapacity(vpStats.pipelineAvgCapacity) },
                    { label: 'Ø Betrag',    value: formatEuro(vpStats.pipelineAvgValue) },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">{label}</span>
                      <span className="text-[10px] font-bold text-slate-600">{value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg w-fit">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-[10px] font-semibold text-amber-700">Keine Angebote</span>
                </div>
                <p className="text-[9px] text-slate-400 mt-2 leading-snug">Sobald aktive Deals einen Betrag erhalten, erscheint hier der Pipeline-Wert.</p>
              </>
            )}
          </div>

          {/* Abschlussquote */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5 flex flex-col">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Abschlussquote</p>
            {vpStats.closingRate !== null ? (
              <>
                <p className="text-3xl font-bold text-slate-800 tabular-nums mt-3">{vpStats.closingRate}</p>
                <div className="mt-auto pt-3 border-t border-slate-50 space-y-2.5">
                  {[
                    { label: 'Gewonnen', count: vpStats.wonCount,                              color: 'bg-[#82a8a4]' },
                    { label: 'Verloren', count: vpStats.totalFinished - vpStats.wonCount, color: 'bg-slate-200' },
                  ].map(({ label, count, color }) => (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-slate-400">{label}</span>
                        <span className="text-[10px] font-bold text-slate-600">{count}</span>
                      </div>
                      <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${color}`}
                          style={{ width: vpStats.totalFinished > 0 ? `${(count / vpStats.totalFinished) * 100}%` : '0%' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg w-fit">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-[10px] font-semibold text-amber-700">Keine Abschlüsse</span>
                </div>
                <p className="text-[9px] text-slate-400 mt-2 leading-snug">Die Quote wird berechnet sobald Deals als Gewonnen oder Verloren markiert sind.</p>
              </>
            )}
          </div>

          {/* Gewonnener Umsatz */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5 flex flex-col">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Gewonnener Umsatz</p>
            {vpStats.wonCount > 0 ? (
              <>
                <p className="text-3xl font-bold text-slate-800 tabular-nums mt-3">{formatEuro(vpStats.wonRevenue)}</p>
                <div className="mt-auto pt-3 border-t border-slate-50 space-y-1.5">
                  {[
                    { label: 'Kapazität',    value: formatCapacity(vpStats.wonCapacity) },
                    { label: 'Anzahl',       value: `${vpStats.wonCount} Deals` },
                    { label: 'Ø Kapazität', value: formatCapacity(vpStats.wonAvgCapacity) },
                    { label: 'Ø Betrag',    value: formatEuro(vpStats.wonAvgValue) },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">{label}</span>
                      <span className="text-[10px] font-bold text-slate-600">{value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg w-fit">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-[10px] font-semibold text-amber-700">Noch keine Deals gewonnen</span>
                </div>
                <p className="text-[9px] text-slate-400 mt-2 leading-snug">Gewonnene Deals erscheinen hier sobald der erste Abschluss erfolgt.</p>
              </>
            )}
          </div>

        </div>

        {/* Abgeschlossene Aufträge */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Abgeschlossene Aufträge</h3>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            {/* Chart-Header */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              {/* Toggle */}
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                {(['eur', 'kwh', 'count'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setVpChartMode(mode)}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                      vpChartMode === mode
                        ? 'bg-[#82a8a4] text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {mode === 'eur' ? 'EUR (€)' : mode === 'kwh' ? 'kWh' : 'Deals'}
                  </button>
                ))}
              </div>

              {/* Summe-Banner */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#82a8a4]/10 rounded-lg">
                <span className="text-[10px] font-bold text-slate-500">
                  {vpChartMode === 'eur' ? 'Umsatz:' : vpChartMode === 'kwh' ? 'Summe:' : 'Deals:'}
                </span>
                <span className="text-[10px] font-bold text-[#82a8a4]">
                  {vpChartMode === 'eur'
                    ? formatEuro(vpYearStats.revenue)
                    : vpChartMode === 'kwh'
                    ? formatCapacity(vpYearStats.capacity)
                    : `${vpYearStats.count} Deals`}
                </span>
              </div>

              {/* Zweiter Banner (nur bei eur und kwh) */}
              {vpChartMode !== 'count' && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-500">
                    {vpChartMode === 'eur' ? 'Ø Deal-Wert:' : 'Ø Kapazität:'}
                  </span>
                  <span className="text-[10px] font-bold text-slate-600">
                    {vpChartMode === 'eur'
                      ? formatEuro(vpYearStats.count > 0 ? vpYearStats.revenue / vpYearStats.count : 0)
                      : formatCapacity(vpYearStats.count > 0 ? vpYearStats.capacity / vpYearStats.count : 0)}
                  </span>
                </div>
              )}

              <div className="ml-auto relative">
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(e.target.value)}
                  className="pl-3 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 outline-none focus:ring-2 focus:ring-[#82a8a4]/20 appearance-none cursor-pointer"
                >
                  <option value={(currentYear - 2).toString()}>{currentYear - 2}</option>
                  <option value={(currentYear - 1).toString()}>{currentYear - 1}</option>
                  <option value={currentYear.toString()}>{currentYear}</option>
                </select>
                <Calendar
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  size={12}
                />
              </div>
            </div>

            {/* BarChart */}
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vpTrendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="vpBarGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#82a8a4" stopOpacity={1} />
                      <stop offset="100%" stopColor="#82a8a4" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                    dy={8}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                    tickFormatter={vpYAxisFormatter}
                  />
                  <Tooltip
                    cursor={{ fill: '#f8fafc', radius: 8 }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const val = payload[0].value as number;
                        return (
                          <div className="bg-white p-3 shadow-xl rounded-2xl border border-slate-50">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                              {payload[0].payload.month}
                            </p>
                            <p className="text-sm font-bold text-slate-800">
                              {vpChartMode === 'eur'
                                ? formatEuro(val)
                                : vpChartMode === 'kwh'
                                ? formatCapacity(val)
                                : `${val} Deals`}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey={vpDataKey} fill="url(#vpBarGradient)" radius={[5, 5, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Neueste Projekte */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Neueste Projekte</h3>
            <button
              onClick={() => router.push('/projekte')}
              className="text-[10px] font-semibold text-[#82a8a4] hover:text-[#5a7a76] flex items-center gap-1 uppercase tracking-widest transition-colors"
            >
              Alle Projekte <ArrowRight size={14} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left table-fixed">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                  <th className="px-5 py-3.5 w-[25%]">Projekt & Kunde</th>
                  <th className="px-5 py-3.5 w-[20%]">Kapazität</th>
                  <th className="px-5 py-3.5 w-[15%]">Standort</th>
                  <th className="px-5 py-3.5 w-[20%]">Status</th>
                  <th className="px-5 py-3.5 w-[20%]">Erstellt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[...projects].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-slate-400 text-xs font-medium italic">
                      Noch keine Projekte vorhanden.
                    </td>
                  </tr>
                ) : (
                  [...projects]
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .slice(0, 5)
                    .map(p => (
                      <tr
                        key={p.id}
                        onClick={() => router.push(`/projekte/${p.id}`)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      >
                        <td className="px-5 py-3">
                          <p className="text-xs font-bold text-slate-800 group-hover:text-[#82a8a4] transition-colors truncate">{p.name}</p>
                          <p className="text-[10px] text-slate-400 font-medium truncate">{p.company_name || p.unternehmen_name}</p>
                        </td>
                        <td className="px-5 py-3 text-xs font-bold text-slate-700">
                          {p.offered_capacity
                            ? `${p.offered_capacity.toLocaleString('de-DE')} kWh`
                            : p.estimated_capacity
                              ? <span className="text-slate-500 font-medium text-[11px]">{p.estimated_capacity} <span className="text-[9px] text-slate-400">(vorl.)</span></span>
                              : <span className="text-slate-300 font-normal italic text-[10px]">–</span>
                          }
                        </td>
                        <td className="px-5 py-3 text-xs font-medium text-slate-600 truncate">{p.location_city}</td>
                        <td className="px-5 py-3"><StatusBadge status={p.dealstage} /></td>
                        <td className="px-5 py-3">
                          <p className="text-xs font-medium text-slate-500">{new Date(p.created_at).toLocaleDateString('de-DE')}</p>
                          <p className="text-[10px] text-slate-400 font-medium truncate">
                            {p.creator.fname} {p.creator.lname}
                          </p>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── Vermittler-Dashboard (Default) ────────────────────────────────────────
  const estimateNote = stats.hasEstimates
    ? 'Alle Pipeline-Deals gezählt. Deals ohne Kapazitätsangabe werden mit dem Durchschnittswert geschätzt.'
    : undefined;

  const barColors: Record<string, string> = {
    'Eingangsprüfung': 'bg-[#82a8a4]/40',
    'Technische Klärung': 'bg-[#82a8a4]/60',
    'Angebotsklärung': 'bg-[#82a8a4]/80',
    'Closing': 'bg-[#82a8a4]',
  };

  return (
    <div className="space-y-8">

      {/* Willkommen */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">
          Willkommen zurück, {userProfile?.fname}.
        </h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Performance-Übersicht für {userCompany?.name}
        </p>
      </div>

      {/* ── SEKTION 1: PIPELINE ───────────────────────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pipeline</h3>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* Linke Seite: KPI-Kachel */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm h-full flex flex-col divide-y divide-slate-100">

              {/* Aktive Projekte */}
              <div className="flex-1 flex flex-col justify-center px-6 py-5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Aktive Projekte</p>
                <p className="text-3xl font-bold text-slate-800 tabular-nums mt-2">{stats.activeCount}</p>
                <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">Projekte ohne Status Gewonnen oder Verloren</p>
              </div>

              {/* Pipeline-Volumen */}
              <div className="flex-1 flex flex-col justify-center px-6 py-5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Pipeline-Volumen</p>
                <p className="text-3xl font-bold text-slate-800 tabular-nums mt-2">{formatCapacity(stats.pipelineVolume)}</p>
                {estimateNote && (
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">{estimateNote}</p>
                )}
              </div>

              {/* Ø Projektkapazität */}
              <div className="flex-1 flex flex-col justify-center px-6 py-5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Ø Projektkapazität</p>
                <p className="text-3xl font-bold text-slate-800 tabular-nums mt-2">{formatCapacity(stats.avgCapacity)}</p>
                {estimateNote && (
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">{estimateNote}</p>
                )}
              </div>

            </div>
          </div>

          {/* Rechte Seite: Funnel */}
          <div className="lg:col-span-3 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-5">
              Pipeline Funnel
            </p>

            <div className="flex-1 space-y-4">
              {funnelData.activePipeline.map((item, i) => {
                const pct =
                  funnelData.totalActive > 0
                    ? (item.count / funnelData.totalActive) * 100
                    : 0;
                return (
                  <div key={i}>
                    <div className="flex justify-between items-end mb-1.5 px-0.5">
                      <div>
                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">
                          {item.status}
                        </span>
                        <span className="text-[9px] text-slate-400 ml-1.5">
                          {item.count} {item.count === 1 ? 'Projekt' : 'Projekte'}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-800 tabular-nums">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-50 rounded-lg overflow-hidden border border-slate-100/50 p-[1px]">
                      <div
                        className={`h-full rounded-md transition-all duration-700 ease-out ${barColors[item.status] || 'bg-[#82a8a4]'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Gewonnen / Verloren */}
            <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-2 gap-3">
              <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
                <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-widest mb-1">
                  Gewonnen
                </p>
                <p className="text-lg font-bold text-emerald-600">{funnelData.completed.won}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">
                  Verloren
                </p>
                <p className="text-lg font-bold text-slate-500">{funnelData.completed.lost}</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-50 text-center">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">
                Abschlussquote
              </p>
              {stats.closingRate !== null ? (
                <p className="text-2xl font-bold text-slate-800">{stats.closingRate}</p>
              ) : (
                <p className="text-xs text-slate-400 mt-1 leading-snug">Noch keine gewonnenen Deals</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── SEKTION 2: ABGESCHLOSSENE AUFTRÄGE ───────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Abgeschlossene Aufträge
        </h3>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          {/* Chart-Header */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {/* kWh / Stückzahl Toggle */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => setChartMode('kwh')}
                className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                  chartMode === 'kwh'
                    ? 'bg-[#82a8a4] text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                kWh
              </button>
              <button
                onClick={() => setChartMode('count')}
                className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                  chartMode === 'count'
                    ? 'bg-[#82a8a4] text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Stückzahl
              </button>
            </div>

            {/* Summe-Banner */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#82a8a4]/10 rounded-lg">
              <span className="text-[10px] font-bold text-slate-500">Summe:</span>
              <span className="text-[10px] font-bold text-[#82a8a4]">
                {chartMode === 'kwh'
                  ? formatCapacity(yearStats.capacity)
                  : `${yearStats.count} Deals`}
              </span>
            </div>

            {/* Ø Kapazität-Banner */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[10px] font-bold text-slate-500">Ø Kapazität:</span>
              <span className="text-[10px] font-bold text-slate-600">
                {formatCapacity(yearStats.avgCapacity)}
              </span>
            </div>

            <div className="ml-auto relative">
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(e.target.value)}
                className="pl-3 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 outline-none focus:ring-2 focus:ring-[#82a8a4]/20 appearance-none cursor-pointer"
              >
                <option value={(currentYear - 2).toString()}>{currentYear - 2}</option>
                <option value={(currentYear - 1).toString()}>{currentYear - 1}</option>
                <option value={currentYear.toString()}>{currentYear}</option>
              </select>
              <Calendar
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                size={12}
              />
            </div>
          </div>

          {/* BarChart */}
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={capacityTrendData}
                margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#82a8a4" stopOpacity={1} />
                    <stop offset="100%" stopColor="#82a8a4" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                  dy={8}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                  tickFormatter={v =>
                    chartMode === 'kwh'
                      ? v >= 1000 ? `${(v / 1000).toFixed(1)}M kWh` : `${v} kWh`
                      : String(v)
                  }
                  width={80}
                />
                <Tooltip
                  cursor={{ fill: '#f8fafc', radius: 8 }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const val = payload[0].value as number;
                      return (
                        <div className="bg-white p-3 shadow-xl rounded-2xl border border-slate-50">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                            {payload[0].payload.month}
                          </p>
                          <p className="text-sm font-bold text-slate-800">
                            {chartMode === 'kwh' ? formatCapacity(val) : `${val} Deals`}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey={chartMode === 'kwh' ? 'capacity' : 'count'}
                  fill="url(#barGradient)"
                  radius={[5, 5, 0, 0]}
                  barSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ── NEUESTE PROJEKTE ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Neueste Projekte
          </h3>
          <button
            onClick={() => router.push('/projekte')}
            className="text-[10px] font-semibold text-[#82a8a4] hover:text-[#5a7a76] flex items-center gap-1 uppercase tracking-widest transition-colors"
          >
            Alle Projekte <ArrowRight size={14} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left table-fixed">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                <th className="px-5 py-3.5 w-1/5">Projekt & Kunde</th>
                <th className="px-5 py-3.5 w-1/5">Kapazität</th>
                <th className="px-5 py-3.5 w-1/5">Standort</th>
                <th className="px-5 py-3.5 w-1/5">Status</th>
                <th className="px-5 py-3.5 w-1/5">Erstellt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[...projects].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-400 text-xs font-medium italic">
                    Noch keine Projekte vorhanden.
                  </td>
                </tr>
              ) : (
                [...projects]
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .slice(0, 5)
                  .map(p => (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/projekte/${p.id}`)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      <td className="px-5 py-3">
                        <p className="text-xs font-bold text-slate-800 group-hover:text-[#82a8a4] transition-colors truncate">{p.name}</p>
                        <p className="text-[10px] text-slate-400 font-medium truncate">{p.company_name || p.unternehmen_name}</p>
                      </td>
                      <td className="px-5 py-3 text-xs font-bold text-slate-700">
                        {p.offered_capacity
                          ? `${p.offered_capacity.toLocaleString('de-DE')} kWh`
                          : p.estimated_capacity
                            ? <span className="text-slate-500 font-medium text-[11px]">{p.estimated_capacity} <span className="text-[9px] text-slate-400">(vorl.)</span></span>
                            : <span className="text-slate-300 font-normal italic text-[10px]">–</span>
                        }
                      </td>
                      <td className="px-5 py-3 text-xs font-medium text-slate-600 truncate">{p.location_city}</td>
                      <td className="px-5 py-3"><StatusBadge status={p.dealstage} /></td>
                      <td className="px-5 py-3">
                        <p className="text-xs font-medium text-slate-500">{new Date(p.created_at).toLocaleDateString('de-DE')}</p>
                        <p className="text-[10px] text-slate-400 font-medium truncate">
                          {p.creator.fname} {p.creator.lname}
                        </p>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
