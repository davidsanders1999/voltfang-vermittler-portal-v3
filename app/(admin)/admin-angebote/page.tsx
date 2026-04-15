'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FileText, Search, RefreshCw, ChevronLeft, ChevronRight, X, Upload, Check, Loader2, ExternalLink, Download } from 'lucide-react';
import { Angebot } from '@/types';
import { getAllAngebote } from '@/lib/api/admin';
import { createClient } from '@/lib/supabase/client';

const BUCKET = 'angebote-pdfs';
const ITEMS_PER_PAGE = 10;

export default function AdminAngebotePage() {
  const [angebote, setAngebote] = useState<Angebot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterProdukt, setFilterProdukt] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // PDF state
  const [pdfUrls, setPdfUrls] = useState<Record<string, string>>({});
  const [pdfSizes, setPdfSizes] = useState<Record<string, string>>({});
  const [pdfUploadDates, setPdfUploadDates] = useState<Record<string, string>>({});

  // Upload state
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAngebotRef = useRef<Angebot | null>(null);

  const supabase = createClient();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setAngebote(await getAllAngebote());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (angebote.length === 0) return;
    const loadPdfData = async () => {
      const urls: Record<string, string> = {};
      const sizes: Record<string, string> = {};
      const uploadDates: Record<string, string> = {};

      // Group by partner and fetch metadata via storage.list()
      const partnerIds = [...new Set(angebote.map((a) => a.partnerHubspotId).filter(Boolean))] as number[];
      const metaMap: Record<string, { size?: number; date?: string }> = {};
      await Promise.all(
        partnerIds.map(async (pid) => {
          const { data } = await supabase.storage.from(BUCKET).list(String(pid));
          if (data) {
            for (const f of data) {
              const id = f.name.replace('.pdf', '');
              metaMap[id] = { size: f.metadata?.size as number | undefined, date: f.updated_at ?? undefined };
            }
          }
        }),
      );

      // Generate signed URLs for existing PDFs
      await Promise.all(
        angebote.map(async (a) => {
          if (!a.partnerHubspotId) return;
          const { data, error } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(`${a.partnerHubspotId}/${a.hubspotId}.pdf`, 3600);
          if (!error && data?.signedUrl) {
            urls[a.hubspotId] = data.signedUrl;
            const meta = metaMap[String(a.hubspotId)];
            if (meta?.size != null) {
              sizes[a.hubspotId] = meta.size >= 1_000_000
                ? `${(meta.size / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`
                : `${Math.round(meta.size / 1_000)} KB`;
            }
            if (meta?.date) uploadDates[a.hubspotId] = meta.date;
          }
        }),
      );

      setPdfUrls(urls);
      setPdfSizes(sizes);
      setPdfUploadDates(uploadDates);
    };
    loadPdfData();
  }, [angebote]);

  const handleUploadClick = (angebot: Angebot) => {
    if (!angebot.partnerHubspotId) return;
    pendingAngebotRef.current = angebot;
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const angebot = pendingAngebotRef.current;
    if (!file || !angebot?.partnerHubspotId) return;
    e.target.value = '';

    setUploadingId(angebot.hubspotId);
    setUploadError(null);
    try {
      const path = `${angebot.partnerHubspotId}/${angebot.hubspotId}.pdf`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, contentType: 'application/pdf' });
      if (error) throw error;
      // Refresh PDF data after upload
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (data?.signedUrl) {
        setPdfUrls((prev) => ({ ...prev, [angebot.hubspotId]: data.signedUrl }));
        const bytes = file.size;
        setPdfSizes((prev) => ({
          ...prev,
          [angebot.hubspotId]: bytes >= 1_000_000
            ? `${(bytes / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`
            : `${Math.round(bytes / 1_000)} KB`,
        }));
        setPdfUploadDates((prev) => ({ ...prev, [angebot.hubspotId]: new Date().toISOString() }));
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
    } finally {
      setUploadingId(null);
      pendingAngebotRef.current = null;
    }
  };

  const formatDateTime = (iso: string) => {
    if (!iso) return null;
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const uniqueProdukte = [...new Set(angebote.map((a) => a.produkt).filter(Boolean))];

  const filtered = angebote.filter((a) => {
    const matchSearch =
      !search ||
      (a.projektName ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (a.produkt ?? '').toLowerCase().includes(search.toLowerCase());
    const matchProdukt = filterProdukt === 'all' || a.produkt === filterProdukt;
    return matchSearch && matchProdukt;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-[3px] border-[#82a8a4]/20 border-t-[#82a8a4] rounded-full animate-spin" />
      </div>
    );
  }
  if (error) {
    return <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-red-700 text-xs font-medium">{error}</div>;
  }

  return (
    <div className="space-y-5">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Angebote</h2>
          <p className="text-xs text-slate-400 mt-0.5">{angebote.length} Angebote gesamt</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
          <RefreshCw size={13} /> Aktualisieren
        </button>
      </div>

      {uploadError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 font-medium">
          Upload fehlgeschlagen: {uploadError}
        </div>
      )}

      {/* Filter Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="p-3 flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Projekt oder Produkt suchen…"
              className="w-full pl-9 pr-8 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/20 focus:border-[#82a8a4] transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={11} />
              </button>
            )}
          </div>
          {uniqueProdukte.length > 0 && (
            <select
              value={filterProdukt}
              onChange={(e) => { setFilterProdukt(e.target.value); setCurrentPage(1); }}
              className="px-2.5 py-1.5 text-[10px] font-bold text-slate-500 border border-slate-200 rounded-lg focus:outline-none bg-white focus:ring-2 focus:ring-[#82a8a4]/20 focus:border-[#82a8a4] transition-colors"
            >
              <option value="all">Alle Produkte</option>
              {uniqueProdukte.map((p) => <option key={p!}>{p}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left table-fixed text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[9px] font-semibold text-slate-400 uppercase tracking-widest">
                <th className="px-5 py-3.5 w-[22%]">Produkt</th>
                <th className="px-5 py-3.5 w-[18%]">Projekt</th>
                <th className="px-5 py-3.5 w-[14%]">Preis [€]</th>
                <th className="px-5 py-3.5 w-[16%]">Angefragt</th>
                <th className="px-5 py-3.5 w-[16%]">Hochgeladen</th>
                <th className="px-5 py-3.5 w-[14%]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-xs font-medium text-slate-400 italic">
                    Keine Angebote gefunden.
                  </td>
                </tr>
              ) : (
                paginated.map((angebot) => {
                  const pdfUrl = pdfUrls[angebot.hubspotId];
                  const pdfSize = pdfSizes[angebot.hubspotId];
                  const angefragt = formatDateTime(angebot.erstellungsdatum);
                  const hochgeladen = pdfUploadDates[angebot.hubspotId]
                    ? formatDateTime(pdfUploadDates[angebot.hubspotId])
                    : null;
                  const downloadPdf = () => {
                    if (!pdfUrl) return;
                    const link = document.createElement('a');
                    link.href = pdfUrl;
                    link.download = `Angebot_${angebot.hubspotId}.pdf`;
                    link.click();
                  };

                  return (
                    <tr key={angebot.hubspotId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <FileText size={13} className="text-slate-400" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 truncate">{angebot.produkt ?? '—'}</p>
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5 flex items-center gap-1">
                              {angebot.nettokapazitaetKwh != null
                                ? <span>{angebot.nettokapazitaetKwh.toLocaleString('de-DE')} kWh</span>
                                : <span className="italic">– kWh</span>}
                              <span className="text-slate-200">|</span>
                              {angebot.leistungKw != null
                                ? <span>{angebot.leistungKw.toLocaleString('de-DE')} kW</span>
                                : <span className="italic">– kW</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-600 truncate">{angebot.projektName ?? `Deal ${angebot.dealHubspotId}`}</p>
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-600">
                        {angebot.nettopreis != null
                          ? `${angebot.nettopreis.toLocaleString('de-DE')} €`
                          : <span className="text-slate-300 italic">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        {angefragt ? (
                          <>
                            <p className="font-medium text-slate-600">{angefragt.date}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{angefragt.time}</p>
                          </>
                        ) : <span className="text-slate-300 italic">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        {hochgeladen ? (
                          <>
                            <p className="font-medium text-slate-600">{hochgeladen.date}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{hochgeladen.time}</p>
                          </>
                        ) : <span className="text-slate-300 italic">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        {!angebot.partnerHubspotId ? (
                          <span className="text-[10px] text-slate-300">—</span>
                        ) : uploadingId === angebot.hubspotId ? (
                          <Loader2 size={15} className="text-[#82a8a4] animate-spin" />
                        ) : pdfUrl ? (
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
                            <button
                              onClick={() => handleUploadClick(angebot)}
                              title="PDF ersetzen"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                            >
                              <Upload size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-semibold text-slate-400">
                              In Bearbeitung
                            </span>
                            <button
                              onClick={() => handleUploadClick(angebot)}
                              title="PDF hochladen"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-[#82a8a4] hover:bg-slate-100 transition-all"
                            >
                              <Upload size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > ITEMS_PER_PAGE && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="text-[10px] font-medium text-slate-500">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} von {filtered.length} Angeboten
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronLeft size={11} /> Zurück
              </button>
              <span className="text-[10px] font-bold text-slate-600 px-1">Seite {currentPage} von {totalPages}</span>
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                Weiter <ChevronRight size={11} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
