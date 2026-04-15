'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Check, Download, ExternalLink, Clock } from 'lucide-react';
import { Angebot, UserCompany, Project } from '@/types';
import { getHubSpotAngebote, getHubSpotContext } from '@/lib/api/hubspot';
import { createClient } from '@/lib/supabase/client';
import { usePortalData } from '@/hooks/usePortalData';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const supabase = createClient();

const ANGEBOTE_PDF_BUCKET = 'angebote-pdfs';

type TabType = 'open' | 'closed' | 'accepted';
type SortColumn = 'preis' | 'erstellt' | 'projekt' | 'hochgeladen' | 'ablaufdatum';
type SortDirection = 'asc' | 'desc';

const ITEMS_PER_PAGE = 10;

export default function AngebotePage() {
  const { userCompany } = usePortalData();
  const router = useRouter();

  const [angebote, setAngebote] = useState<Angebot[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfUrls, setPdfUrls] = useState<Record<string, string>>({});
  const [pdfSizes, setPdfSizes] = useState<Record<string, string>>({});
  const [pdfUploadDates, setPdfUploadDates] = useState<Record<string, string>>({});

  const [activeTab, setActiveTab] = useState<TabType>('open');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProdukts, setSelectedProdukts] = useState<string[]>([]);
  const [openDropdown, setOpenDropdown] = useState<'produkt' | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<SortColumn>('erstellt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const partnerHubspotId = userCompany?.hubspot_id;

  const produktDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (produktDropdownRef.current && !produktDropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!userCompany?.hubspot_id) {
      setLoading(false);
      return;
    }

    const cacheKey = `hubspot_angebote_${userCompany.hubspot_id}`;
    let hasCached = false;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { angebote: cachedAngebote, projects: cachedProjects } = JSON.parse(cached);
        setAngebote(cachedAngebote ?? []);
        setProjects(cachedProjects ?? []);
        setLoading(false);
        hasCached = true;
      }
    } catch { /* Ignorieren */ }

    const load = async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      try {
        const [angeboteData, contextData] = await Promise.all([
          getHubSpotAngebote(userCompany.hubspot_id!),
          getHubSpotContext(),
        ]);
        setAngebote(angeboteData);
        setProjects(contextData?.projects ?? []);
        sessionStorage.setItem(cacheKey, JSON.stringify({
          angebote: angeboteData,
          projects: contextData?.projects ?? [],
        }));
      } catch (err) {
        console.error('Fehler beim Laden der Angebote:', err);
      } finally {
        setLoading(false);
      }
    };
    load(!hasCached);
  }, [userCompany?.hubspot_id]);

  // PDF-URLs, -Größen und Upload-Daten laden
  useEffect(() => {
    if (angebote.length === 0 || !partnerHubspotId) return;
    const loadPdfUrls = async () => {
      const urls: Record<string, string> = {};
      const sizes: Record<string, string> = {};
      const uploadDates: Record<string, string> = {};

      const { data: listed } = await supabase.storage
        .from(ANGEBOTE_PDF_BUCKET)
        .list(String(partnerHubspotId));
      const sizeMap: Record<string, number> = {};
      const dateMap: Record<string, string> = {};
      if (listed) {
        for (const f of listed) {
          const id = f.name.replace('.pdf', '');
          if (f.metadata?.size) sizeMap[id] = f.metadata.size as number;
          if (f.updated_at) dateMap[id] = f.updated_at;
        }
      }

      await Promise.all(
        angebote.map(async (a) => {
          const { data, error } = await supabase.storage
            .from(ANGEBOTE_PDF_BUCKET)
            .createSignedUrl(`${partnerHubspotId}/${a.hubspotId}.pdf`, 3600);
          if (!error && data?.signedUrl) {
            urls[a.hubspotId] = data.signedUrl;
            const bytes = sizeMap[String(a.hubspotId)];
            if (bytes != null) {
              sizes[a.hubspotId] = bytes >= 1_000_000
                ? `${(bytes / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`
                : `${Math.round(bytes / 1_000)} KB`;
            }
            if (dateMap[String(a.hubspotId)]) uploadDates[a.hubspotId] = dateMap[String(a.hubspotId)];
          }
        }),
      );
      setPdfUrls(urls);
      setPdfSizes(sizes);
      setPdfUploadDates(uploadDates);
    };
    loadPdfUrls();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [angebote, partnerHubspotId]);

  const getProject = (dealHubspotId: string): Project | undefined =>
    projects.find((p) => String(p.hubspot_id) === dealHubspotId);

  const formatDateTime = (iso: string) => {
    if (!iso) return null;
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const counts = useMemo(() => ({
    open: angebote.filter(a => a.status === 'Offen').length,
    closed: angebote.filter(a => a.status === 'Abgelaufen').length,
    accepted: angebote.filter(a => a.status === 'Gewonnen').length,
  }), [angebote]);

  const uniqueProdukts = useMemo(() => {
    const seen = new Set<string>();
    angebote.forEach(a => { if (a.produkt) seen.add(a.produkt); });
    return [...seen].sort();
  }, [angebote]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSelectedProdukts([]);
    setCurrentPage(1);
  };

  const toggleProdukt = (p: string) => {
    setSelectedProdukts(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
    setCurrentPage(1);
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'erstellt' ? 'desc' : 'asc');
    }
    setCurrentPage(1);
  };

  const SortIcon: React.FC<{ column: SortColumn }> = ({ column }) => {
    if (sortColumn !== column) return <span className="text-slate-300 ml-1"><ChevronUp size={10} /></span>;
    return sortDirection === 'asc'
      ? <span className="text-[#82a8a4] ml-1"><ChevronUp size={10} /></span>
      : <span className="text-[#82a8a4] ml-1"><ChevronDown size={10} /></span>;
  };

  const angeboteInTab = useMemo(() => angebote.filter(a => {
    if (activeTab === 'open') return a.status === 'Offen';
    if (activeTab === 'closed') return a.status === 'Abgelaufen';
    if (activeTab === 'accepted') return a.status === 'Gewonnen';
    return true;
  }), [angebote, activeTab]);

  const filteredAngebote = useMemo(() => angeboteInTab.filter(a => {
    const project = getProject(a.dealHubspotId);
    const matchesSearch =
      (a.produkt ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (project?.name ?? '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProdukt = selectedProdukts.length === 0 || (a.produkt && selectedProdukts.includes(a.produkt));
    return matchesSearch && matchesProdukt;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [angeboteInTab, searchTerm, selectedProdukts, projects]);

  const sortedAngebote = useMemo(() => [...filteredAngebote].sort((a, b) => {
    let cmp = 0;
    switch (sortColumn) {
      case 'preis': cmp = (a.nettopreis ?? 0) - (b.nettopreis ?? 0); break;
      case 'erstellt': cmp = new Date(a.erstellungsdatum).getTime() - new Date(b.erstellungsdatum).getTime(); break;
      case 'hochgeladen': {
        const da = pdfUploadDates[a.hubspotId] ? new Date(pdfUploadDates[a.hubspotId]).getTime() : 0;
        const db = pdfUploadDates[b.hubspotId] ? new Date(pdfUploadDates[b.hubspotId]).getTime() : 0;
        cmp = da - db;
        break;
      }
      case 'ablaufdatum': {
        const da = a.ablaufdatum ? new Date(a.ablaufdatum).getTime() : 0;
        const db = b.ablaufdatum ? new Date(b.ablaufdatum).getTime() : 0;
        cmp = da - db;
        break;
      }
      case 'projekt': {
        const pa = getProject(a.dealHubspotId)?.name ?? '';
        const pb = getProject(b.dealHubspotId)?.name ?? '';
        cmp = pa.localeCompare(pb, 'de');
        break;
      }
    }
    return sortDirection === 'asc' ? cmp : -cmp;
  }), [filteredAngebote, sortColumn, sortDirection, pdfUploadDates]);

  const paginatedAngebote = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedAngebote.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedAngebote, currentPage]);

  const totalPages = Math.ceil(sortedAngebote.length / ITEMS_PER_PAGE);
  const displayRange = useMemo(() => ({
    start: (currentPage - 1) * ITEMS_PER_PAGE + 1,
    end: Math.min(currentPage * ITEMS_PER_PAGE, sortedAngebote.length),
    total: sortedAngebote.length,
  }), [currentPage, sortedAngebote.length]);

  if (loading && angebote.length === 0) {
    return <LoadingSpinner text="Angebote werden geladen…" />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Angebote</h1>
        <p className="text-xs text-slate-400 mt-0.5">Übersicht aller Angebote für Ihr Unternehmen</p>
      </div>

      {!userCompany?.hubspot_id ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-10 text-center">
          <p className="text-xs text-slate-400">Kein HubSpot-Unternehmen verknüpft.</p>
        </div>
      ) : (
        <>
          {/* Filter-Box mit Tabs und Suche */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
            {/* Tabs */}
            <div className="flex items-center border-b border-slate-100">
              {([
                { key: 'open', label: 'Offen', count: counts.open },
                { key: 'closed', label: 'Abgelaufen & Abgelehnt', count: counts.closed },
                { key: 'accepted', label: 'Gewonnen', count: counts.accepted },
              ] as { key: TabType; label: string; count: number }[]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold transition-all relative ${
                    activeTab === tab.key ? 'text-[#82a8a4]' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                    activeTab === tab.key ? 'bg-[#82a8a4]/10 text-[#82a8a4]' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {tab.count}
                  </span>
                  {activeTab === tab.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#82a8a4]" />}
                </button>
              ))}
            </div>

            {/* Suchleiste und Filter */}
            <div className="p-3 flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Angebote durchsuchen..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/20 focus:border-[#82a8a4] transition-colors"
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Produkt-Filter */}
              {uniqueProdukts.length >= 2 && (
                <div className="relative shrink-0" ref={produktDropdownRef}>
                  {selectedProdukts.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-[#82a8a4] text-white text-[8px] font-bold flex items-center justify-center z-10 pointer-events-none">
                      {selectedProdukts.length}
                    </span>
                  )}
                  <button
                    onClick={() => setOpenDropdown(o => o === 'produkt' ? null : 'produkt')}
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold rounded-lg border transition-colors ${
                      selectedProdukts.length > 0
                        ? 'bg-[#82a8a4]/10 border-[#82a8a4]/30 text-[#5a7a76]'
                        : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Produkt
                    <ChevronDown size={12} className={`transition-transform ${openDropdown === 'produkt' ? 'rotate-180' : ''}`} />
                  </button>
                  {openDropdown === 'produkt' && (
                    <div className="absolute top-full right-0 mt-1.5 bg-white rounded-xl shadow-lg border border-slate-100 py-1.5 z-50 min-w-[180px]">
                      {uniqueProdukts.map(p => (
                        <button
                          key={p}
                          onClick={() => toggleProdukt(p)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors text-left"
                        >
                          <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                            selectedProdukts.includes(p) ? 'bg-[#82a8a4] border-[#82a8a4]' : 'border-slate-200'
                          }`}>
                            {selectedProdukts.includes(p) && <Check size={9} className="text-white" strokeWidth={3} />}
                          </span>
                          <span className="text-xs text-slate-700">{p}</span>
                        </button>
                      ))}
                      <div className="border-t border-slate-100 mt-1 pt-1 px-3">
                        <button
                          onClick={() => { setSelectedProdukts([]); setCurrentPage(1); }}
                          className={`text-[10px] transition-colors py-1 ${selectedProdukts.length > 0 ? 'text-slate-400 hover:text-red-400' : 'invisible'}`}
                        >
                          Auswahl zurücksetzen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tabelle */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left table-fixed">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                    <th className="px-5 py-3.5 w-[21%]">
                      <button onClick={() => handleSort('projekt')} className="flex items-center hover:text-slate-600 transition-colors font-semibold">
                        Projekt & Kunde <SortIcon column="projekt" />
                      </button>
                    </th>
                    <th className="px-5 py-3.5 w-[20%] font-semibold">Produkt</th>
                    <th className="px-5 py-3.5 w-[15%]">
                      <button onClick={() => handleSort('preis')} className="flex items-center hover:text-slate-600 transition-colors font-semibold">
                        Preis [€] <SortIcon column="preis" />
                      </button>
                    </th>
                    <th className="px-5 py-3.5 w-[13%]">
                      <button onClick={() => handleSort('erstellt')} className="flex items-center hover:text-slate-600 transition-colors font-semibold">
                        Erstellt <SortIcon column="erstellt" />
                      </button>
                    </th>
                    <th className="px-5 py-3.5 w-[13%]">
                      <button onClick={() => handleSort('ablaufdatum')} className="flex items-center hover:text-slate-600 transition-colors font-semibold">
                        Ablaufdatum <SortIcon column="ablaufdatum" />
                      </button>
                    </th>
                    <th className="px-5 py-3.5 w-[18%]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sortedAngebote.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-slate-400 text-xs font-medium italic">
                        Keine Angebote gefunden.
                      </td>
                    </tr>
                  ) : (
                    paginatedAngebote.map((a) => {
                      const project = getProject(a.dealHubspotId);
                      const hochgeladenRaw = pdfUploadDates[a.hubspotId];
                      const erstellt = formatDateTime(hochgeladenRaw ?? a.erstellungsdatum);
                      const pdfUrl = pdfUrls[a.hubspotId];
                      const pdfSize = pdfSizes[a.hubspotId];
                      const downloadPdf = () => {
                        if (!pdfUrl) return;
                        const link = document.createElement('a');
                        link.href = pdfUrl;
                        link.download = `Angebot_${a.hubspotId}.pdf`;
                        link.click();
                      };
                      return (
                        <tr key={a.hubspotId} className="hover:bg-slate-50/80 transition-colors">
                          {/* Projekt */}
                          <td className="px-5 py-3">
                            {project ? (
                              <button
                                onClick={() => router.push(`/projekte/${project.id}`)}
                                className="truncate max-w-full block text-left group/proj"
                              >
                                <p className="font-bold text-slate-800 group-hover/proj:text-[#82a8a4] transition-colors truncate text-xs">{project.name}</p>
                                <p className="text-[10px] text-slate-400 font-medium truncate">{project.company_name || project.unternehmen_name}</p>
                              </button>
                            ) : (
                              <span className="text-slate-300 italic text-xs">–</span>
                            )}
                          </td>
                          {/* Produkt | Kapazität | Leistung */}
                          <td className="px-5 py-3">
                            <p className="font-bold text-slate-800 text-xs">{a.produkt ?? '–'}</p>
                            <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1.5">
                              {a.nettokapazitaetKwh != null
                                ? <span>{a.nettokapazitaetKwh.toLocaleString('de-DE')} kWh</span>
                                : <span className="italic">– kWh</span>}
                              <span className="text-slate-200">|</span>
                              {a.leistungKw != null
                                ? <span>{a.leistungKw.toLocaleString('de-DE')} kW</span>
                                : <span className="italic">– kW</span>}
                            </p>
                          </td>
                          {/* Preis */}
                          <td className="px-5 py-3 font-medium text-slate-600 text-xs">
                            {a.nettopreis != null ? `${a.nettopreis.toLocaleString('de-DE')} €` : <span className="text-slate-300 italic">–</span>}
                          </td>
                          {/* Erstellt / Hochgeladen */}
                          <td className="px-5 py-3">
                            {erstellt ? (
                              <>
                                <p className="font-medium text-slate-600 text-xs">{erstellt.date}</p>
                                <p className="text-[10px] text-slate-400">{erstellt.time}</p>
                              </>
                            ) : <span className="text-slate-300 italic text-xs">–</span>}
                          </td>
                          {/* Ablaufdatum */}
                          <td className="px-5 py-3 text-xs font-medium text-slate-600">
                            {a.ablaufdatum
                              ? (() => { const [y, m, d] = a.ablaufdatum.split('-'); return `${d}.${m}.${y}`; })()
                              : <span className="text-slate-300 italic">–</span>}
                          </td>
                          {/* Download / Status */}
                          <td className="px-5 py-3">
                            {pdfUrl ? (
                              <div className="flex items-center gap-0.5">
                                {pdfSize && (
                                  <span className="text-[10px] text-slate-300 font-medium mr-1">{pdfSize}</span>
                                )}
                                <a
                                  href={pdfUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Öffnen"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                >
                                  <ExternalLink size={14} />
                                </a>
                                <button
                                  onClick={downloadPdf}
                                  title="Herunterladen"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                >
                                  <Download size={14} />
                                </button>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-semibold text-slate-400">
                                <Clock size={10} />
                                In Bearbeitung
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {sortedAngebote.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                <span className="text-[10px] font-medium text-slate-500">
                  {displayRange.start}–{displayRange.end} von {displayRange.total} Angeboten
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={12} /> Zurück
                  </button>
                  <span className="text-[10px] font-bold text-slate-600 px-2">
                    Seite {currentPage} von {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Weiter <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
