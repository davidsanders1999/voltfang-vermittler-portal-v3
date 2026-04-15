'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Search, Download, ExternalLink, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { UserCompany } from '@/types';
import { usePortalData } from '@/hooks/usePortalData';
import { useAuth } from '@/contexts/AuthContext';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const supabase = createClient();

type DocCategory = 'voltfang3' | 'voltfang3plus' | 'marketing' | 'kommerziell';

interface DokumentDef {
  id: string;
  title: string;
  description: string;
  bucket: string;
  filename: string;
  category: DocCategory;
  fileSize: string;
  isPrivate: boolean;
}

const DOKUMENT_DEFS: DokumentDef[] = [
  // Voltfang 3
  {
    id: 'vf3-1',
    title: 'Anschlussdiagramm Eigenversorgung',
    description: 'Elektrisches Anschlussschema für den Betrieb im Eigenversorgungsmodus',
    bucket: 'Voltfang 3',
    filename: 'Voltfang 3 - Anschlussdiagramm Eigenversorgung.pdf',
    category: 'voltfang3',
    fileSize: '572 KB',
    isPrivate: false,
  },
  {
    id: 'vf3-2',
    title: 'Anschlussdiagramm Hilfseinspeisung',
    description: 'Anschlussschema mit externer Hilfseinspeisung für den Asset-Betrieb',
    bucket: 'Voltfang 3',
    filename: 'Voltfang 3 - Anschlussdiagramm externe Hilfseinspeisung Asset.pdf',
    category: 'voltfang3',
    fileSize: '576 KB',
    isPrivate: false,
  },
  {
    id: 'vf3-3',
    title: 'Aufstellungsbedingungen',
    description: 'Technische Anforderungen und Bedingungen für die Aufstellung der Anlage',
    bucket: 'Voltfang 3',
    filename: 'Voltfang 3 - Aufstellungsbedingungen.pdf',
    category: 'voltfang3',
    fileSize: '215 KB',
    isPrivate: false,
  },
  {
    id: 'vf3-4',
    title: 'Beispiel Aufstellung',
    description: 'Planungsbeispiel und Dokumentation einer typischen Anlageaufstellung',
    bucket: 'Voltfang 3',
    filename: 'Voltfang 3 - Beispiel Aufstellung.pdf',
    category: 'voltfang3',
    fileSize: '1,5 MB',
    isPrivate: false,
  },
  {
    id: 'vf3-5',
    title: 'Datenblatt',
    description: 'Technische Spezifikationen und Kennwerte des Voltfang 3 Speichers',
    bucket: 'Voltfang 3',
    filename: 'Voltfang 3 - Datenblatt.pdf',
    category: 'voltfang3',
    fileSize: '323 KB',
    isPrivate: false,
  },
  {
    id: 'vf3-6',
    title: 'Garantievereinbarung',
    description: 'Garantiebedingungen und Garantieumfang für den Voltfang 3',
    bucket: 'Voltfang 3',
    filename: 'Voltfang 3 - Garantievereinbarung.pdf',
    category: 'voltfang3',
    fileSize: '176 KB',
    isPrivate: false,
  },
  {
    id: 'vf3-7',
    title: 'Planungshilfe Fundamentplan',
    description: 'Planungsunterlagen und Anforderungen für die Fundamentierung',
    bucket: 'Voltfang 3',
    filename: 'Voltfang 3 - Planungshilfe Fundamentplan.pdf',
    category: 'voltfang3',
    fileSize: '260 KB',
    isPrivate: false,
  },
  {
    id: 'vf3-8',
    title: 'Sicherheitsleitfaden',
    description: 'Sicherheitshinweise und -vorschriften für Betrieb und Wartung',
    bucket: 'Voltfang 3',
    filename: 'Voltfang 3 - Sicherheitsleitfaden.pdf',
    category: 'voltfang3',
    fileSize: '334 KB',
    isPrivate: false,
  },
  // Voltfang 3 Plus
  {
    id: 'vf3p-1',
    title: 'Aufstellbedingungen 20 MWh / 10 MW',
    description: 'Aufstellbedingungen für ein Beispielprojekt mit 20 MWh und 10 MW Leistung',
    bucket: 'Voltfang 3 Plus',
    filename: 'Voltfang 3 Plus - Aufstellbedingungen Beispielprojekt - 20MWh 10MW.pdf',
    category: 'voltfang3plus',
    fileSize: '126 KB',
    isPrivate: false,
  },
  {
    id: 'vf3p-2',
    title: 'Aufstellbedingungen 5 MWh / 2,5 MW',
    description: 'Aufstellbedingungen für ein Beispielprojekt mit 5 MWh und 2,5 MW Leistung',
    bucket: 'Voltfang 3 Plus',
    filename: 'Voltfang 3 Plus - Aufstellbedingungen Beispielprojekt - 5MWh 2,5MW.pdf',
    category: 'voltfang3plus',
    fileSize: '125 KB',
    isPrivate: false,
  },
  {
    id: 'vf3p-3',
    title: 'Aufstellbedingungen 10 MWh / 5 MW',
    description: 'Aufstellbedingungen für ein Beispielprojekt mit 10 MWh und 5 MW Leistung',
    bucket: 'Voltfang 3 Plus',
    filename: 'Voltfang 3 Plus - Aufstellbedingungen Beispielprojekt -10MWh 5MW.pdf',
    category: 'voltfang3plus',
    fileSize: '126 KB',
    isPrivate: false,
  },
  {
    id: 'vf3p-4',
    title: 'Produktinformation',
    description: 'Produktübersicht, Leistungsmerkmale und Anwendungsgebiete des Voltfang 3 Plus',
    bucket: 'Voltfang 3 Plus',
    filename: 'Voltfang 3 Plus - Produktinformation.pdf',
    category: 'voltfang3plus',
    fileSize: '341 KB',
    isPrivate: false,
  },
  // Marketing
  {
    id: 'mkt-1',
    title: 'Unternehmensvorstellung',
    description: 'Unternehmens- und Produktpräsentation von Voltfang für Partner und Kunden',
    bucket: 'Unternehmenspraesentation',
    filename: 'ICM Voltfang.pdf',
    category: 'marketing',
    fileSize: '1,6 MB',
    isPrivate: false,
  },
  // Kommerziell (nur Vertriebspartner)
  {
    id: 'kom-1',
    title: 'Preisliste',
    description: 'Aktuelle Preisliste für Voltfang Produkte und Dienstleistungen',
    bucket: 'Vertriebspartner (CONFIDENTIAL)',
    filename: 'Preisliste.pdf',
    category: 'kommerziell',
    fileSize: '29 KB',
    isPrivate: true,
  },
];

const CATEGORY_FILTERS = [
  { id: 'alle', label: 'Alle' },
  { id: 'voltfang3', label: 'Voltfang 3' },
  { id: 'voltfang3plus', label: 'Voltfang 3 Plus' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'kommerziell', label: 'Kommerziell' },
];

const CATEGORY_STYLES: Record<DocCategory, { dot: string; badge: string; label: string }> = {
  voltfang3:    { dot: 'bg-[#82a8a4]',  badge: 'bg-[#82a8a4]/10 text-[#5a7a76]',  label: 'Voltfang 3' },
  voltfang3plus: { dot: 'bg-sky-400',   badge: 'bg-sky-50 text-sky-600',          label: 'Voltfang 3 Plus' },
  marketing:    { dot: 'bg-violet-400', badge: 'bg-violet-50 text-violet-600',    label: 'Marketing' },
  kommerziell:  { dot: 'bg-amber-400',  badge: 'bg-amber-50 text-amber-600',      label: 'Kommerziell' },
};

export default function DokumentePage() {
  const { userCompany } = usePortalData();
  const { isAdmin: isSuperAdmin } = useAuth();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('alle');
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loadingUrls, setLoadingUrls] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const canSeeKommerziell = isSuperAdmin || userCompany?.partnerType === 'Vertriebspartner';

  const visibleDefs = useMemo(
    () => DOKUMENT_DEFS.filter(d => d.category !== 'kommerziell' || canSeeKommerziell),
    [canSeeKommerziell],
  );

  useEffect(() => {
    const loadUrls = async () => {
      const newUrls: Record<string, string> = {};
      for (const doc of visibleDefs) {
        if (doc.isPrivate) {
          const { data } = await supabase.storage
            .from(doc.bucket)
            .createSignedUrl(doc.filename, 3600);
          if (data?.signedUrl) newUrls[doc.id] = data.signedUrl;
        } else {
          const { data } = supabase.storage.from(doc.bucket).getPublicUrl(doc.filename);
          newUrls[doc.id] = data.publicUrl;
        }
      }
      setUrls(newUrls);
      setLoadingUrls(false);
    };
    loadUrls();
  }, [visibleDefs]);

  const visibleFilters = CATEGORY_FILTERS.filter(
    cat => cat.id !== 'kommerziell' || canSeeKommerziell,
  );

  const filteredDocs = useMemo(() => {
    return visibleDefs.filter(doc => {
      const matchesCategory = activeCategory === 'alle' || doc.category === activeCategory;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        q === '' ||
        doc.title.toLowerCase().includes(q) ||
        doc.description.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [visibleDefs, activeCategory, search]);

  const handleOpen = (docId: string) => {
    const url = urls[docId];
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const triggerDownload = (doc: DokumentDef) => {
    const url = urls[doc.id];
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadSelected = () => {
    const docs = filteredDocs.filter(d => selected.has(d.id));
    docs.forEach((doc, i) => {
      setTimeout(() => triggerDownload(doc), i * 300);
    });
  };

  const toggleDoc = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleCategory = (docs: DokumentDef[]) => {
    const ids = docs.map(d => d.id);
    const allSelected = ids.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) {
        ids.forEach(id => next.delete(id));
      } else {
        ids.forEach(id => next.add(id));
      }
      return next;
    });
  };

  // Group filtered docs by category (preserving order)
  const grouped = useMemo(() => {
    const order: DocCategory[] = ['voltfang3', 'voltfang3plus', 'marketing', 'kommerziell'];
    return order
      .map(cat => ({ cat, docs: filteredDocs.filter(d => d.category === cat) }))
      .filter(g => g.docs.length > 0);
  }, [filteredDocs]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Dokumente</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Produktunterlagen, technische Dokumente und Marketingmaterialien
          </p>
        </div>
        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Dokument suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-[#82a8a4]/20 focus:border-[#82a8a4] transition-all placeholder:text-slate-300 shadow-sm"
          />
        </div>
      </div>

      {/* Filter tabs + bulk action */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          {visibleFilters.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                activeCategory === cat.id
                  ? 'bg-[#82a8a4] text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Bulk download bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">
              {selected.size} ausgewählt
            </span>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Auswahl aufheben
            </button>
            <button
              onClick={handleDownloadSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#82a8a4] hover:bg-[#6d9490] text-white text-xs font-semibold transition-all shadow-sm"
            >
              <Download size={13} />
              Herunterladen
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {loadingUrls ? (
        <LoadingSpinner text="Dokumente werden geladen…" />
      ) : filteredDocs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText size={28} className="text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">Keine Dokumente gefunden</p>
          <p className="text-xs text-slate-300 mt-1">Anderen Suchbegriff oder Kategorie versuchen</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ cat, docs }) => {
            const style = CATEGORY_STYLES[cat];
            const catIds = docs.map(d => d.id);
            const allCatSelected = catIds.every(id => selected.has(id));
            const someCatSelected = catIds.some(id => selected.has(id));
            return (
              <div key={cat} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {/* Section header — click to toggle entire category */}
                <button
                  onClick={() => toggleCategory(docs)}
                  className="w-full px-5 py-3 border-b border-slate-50 flex items-center gap-2.5 hover:bg-slate-50/60 transition-colors text-left"
                >
                  {/* Checkbox */}
                  <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${
                    allCatSelected
                      ? 'bg-[#82a8a4] border-[#82a8a4]'
                      : someCatSelected
                      ? 'bg-[#82a8a4]/30 border-[#82a8a4]/50'
                      : 'border-slate-200 bg-white'
                  }`}>
                    {(allCatSelected || someCatSelected) && (
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                        {allCatSelected
                          ? <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          : <line x1="2" y1="5" x2="8" y2="5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                        }
                      </svg>
                    )}
                  </span>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{style.label}</span>
                  <span className="text-[10px] text-slate-300 font-medium ml-1">{docs.length}</span>
                </button>

                {/* Document rows */}
                <div className="divide-y divide-slate-50">
                  {docs.map(doc => {
                    const hasUrl = !!urls[doc.id];
                    const isSelected = selected.has(doc.id);
                    return (
                      <div
                        key={doc.id}
                        onClick={() => toggleDoc(doc.id)}
                        className={`flex items-center gap-4 px-5 py-3.5 transition-colors cursor-pointer group ${
                          isSelected ? 'bg-[#82a8a4]/5' : 'hover:bg-slate-50/60'
                        }`}
                      >
                        {/* Checkbox */}
                        <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${
                          isSelected ? 'bg-[#82a8a4] border-[#82a8a4]' : 'border-slate-200 bg-white'
                        }`}>
                          {isSelected && (
                            <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                              <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </span>

                        {/* Icon */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${style.badge}`}>
                          <FileText size={14} />
                        </div>

                        {/* Title + description */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{doc.title}</p>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">{doc.description}</p>
                        </div>

                        {/* File size */}
                        <span className="text-[10px] text-slate-300 font-medium hidden sm:block flex-shrink-0">{doc.fileSize}</span>

                        {/* Actions */}
                        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => handleOpen(doc.id)}
                            disabled={!hasUrl}
                            title="Öffnen"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ExternalLink size={14} />
                          </button>
                          <button
                            onClick={() => triggerDownload(doc)}
                            disabled={!hasUrl}
                            title="Herunterladen"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Download size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
