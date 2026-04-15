'use client';

import React, { useState, useEffect } from 'react';
import {
  Plus, X, FileText, Check, Zap, TrendingDown, BarChart2, Settings2,
  ChevronLeft, ChevronRight, Minus, Shield, Activity, MapPin, Receipt,
  Download, ExternalLink, Clock,
} from 'lucide-react';
import { Angebot, Project, UserCompany } from '@/types';
import { getHubSpotAngebote, createHubSpotAngebot } from '@/lib/api/hubspot';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

const ANGEBOTE_PDF_BUCKET = 'angebote-pdfs';

interface AngeboteSectionProps {
  dealHubspotId: string;
  partnerHubspotId: number;
  projectName: string;
  project?: Project | null;
  userCompany?: UserCompany | null;
}


const PRODUKT_SPECS = {
  'Voltfang 3':      { kapazitaetKwh: 255,  leistungKw: 125  },
  'Voltfang 3 Plus': { kapazitaetKwh: 5300, leistungKw: 2500 },
} as const;

type ProduktKey = keyof typeof PRODUKT_SPECS;

const STEUERUNG_OPTIONS = [
  { value: 'Eigenverbrauchsoptimierung', label: 'Eigenverbrauchsoptimierung', icon: Zap,          desc: 'Maximiert Nutzung selbst erzeugten Stroms' },
  { value: 'Lastspitzenkappung',         label: 'Lastspitzenkappung',         icon: TrendingDown,  desc: 'Reduziert Lastspitzen, senkt Netzentgelte' },
  { value: 'Energy Trader',              label: 'Energy Trader',              icon: BarChart2,     desc: 'Partizipation an Energiemärkten (Spot, FCR, aFRR)' },
  { value: 'Externe Steuerung',          label: 'Externe Steuerung',          icon: Settings2,     desc: 'Anbindung an übergeordnetes EMS' },
] as const;

const ANWENDUNGSFALL_OPTIONS = [
  { value: 'Eigenverbrauchsoptimierung', label: 'Eigenverbrauchsoptimierung', icon: Zap,         desc: 'Maximierung der Nutzung selbst erzeugter Energie' },
  { value: 'Lastspitzenkappung',         label: 'Lastspitzenkappung',         icon: TrendingDown, desc: 'Reduktion von Lastspitzen und Netzentgelten' },
  { value: 'FCR',                        label: 'FCR (Primärregelleistung)',   icon: BarChart2,    desc: 'Frequenzhaltungsreserve am Regelenergiemarkt' },
  { value: 'aFRR / mFRR',               label: 'aFRR / mFRR',               icon: Activity,     desc: 'Sekundär-/Minutenreserve am Regelenergiemarkt' },
  { value: 'Energy Trading',             label: 'Energy Trading',             icon: Settings2,    desc: 'Arbitrage an Spot- und Terminenergiemärkten' },
  { value: 'Notstrom / USV',             label: 'Notstrom / USV',             icon: Shield,       desc: 'Unterbrechungsfreie Notstromversorgung' },
];

const BUNDESLAENDER = [
  'Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen',
  'Hamburg', 'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen',
  'Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland', 'Sachsen',
  'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen', 'Ost-NRW', 'West-NRW',
];

// ── Small reusable form field ───────────────────────────────────────────────
const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}> = ({ label, value, onChange, placeholder, required }) => (
  <div>
    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/30 focus:border-[#82a8a4] transition-colors"
    />
  </div>
);

const BundeslandSelect: React.FC<{
  value: string;
  onChange: (v: string) => void;
}> = ({ value, onChange }) => (
  <div>
    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Bundesland</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/30 focus:border-[#82a8a4] transition-colors"
    >
      <option value="">– Bitte wählen –</option>
      {BUNDESLAENDER.map((bl) => (
        <option key={bl} value={bl}>{bl}</option>
      ))}
    </select>
  </div>
);

// ── Summary row helper ──────────────────────────────────────────────────────
const SummaryRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest shrink-0">{label}</span>
    <span className="text-xs font-semibold text-slate-700 text-right">{value}</span>
  </div>
);

export default function AngeboteSection({
  dealHubspotId, partnerHubspotId, projectName, project, userCompany,
}: AngeboteSectionProps) {
  const [angebote, setAngebote] = useState<Angebot[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfUrls, setPdfUrls] = useState<Record<string, string>>({});
  const [pdfSizes, setPdfSizes] = useState<Record<string, string>>({});
  const [pdfUploadDates, setPdfUploadDates] = useState<Record<string, string>>({});

  // Wizard state
  const [wizardOpen, setWizardOpen]   = useState(false);
  const [wizardStep, setWizardStep]   = useState(1);
  const [produkt, setProdukt]         = useState<ProduktKey>('Voltfang 3');
  const [menge, setMenge]             = useState(1);
  const [betonfundament, setBeton]    = useState<'Ja' | 'Nein'>('Ja');
  const [steuerung, setSteuerung]     = useState<string[]>(['Eigenverbrauchsoptimierung']);
  const [garantie, setGarantie]       = useState<'Basis' | 'Premium'>('Premium');
  const [submitting, setSubmitting]   = useState(false);
  const [formError, setFormError]     = useState<string | null>(null);

  // Voltfang 3 Plus – spezifische Felder (Frontend-only, HubSpot-Mapping folgt)
  const [cRate, setCRate]                                                   = useState<string>('');
  const [anschlussspannungKv, setAnschlussspannungKv]                       = useState<string>('');
  const [mittelspannungsSchaltanlage, setMittelspannungsSchaltanlage]       = useState<'Ja' | 'Nein'>('Nein');
  const [bopC, setBopC]                                                     = useState<'Lieferumfang' | 'Kundenbeigestellt'>('Lieferumfang');
  const [bopE, setBopE]                                                     = useState<'Lieferumfang' | 'Kundenbeigestellt'>('Lieferumfang');
  const [anwendungsfaelle, setAnwendungsfaelle]                             = useState<string[]>([]);
  const [garantieerweiterung, setGarantieerweiterung]                       = useState<'Ja' | 'Nein'>('Nein');

  // Rechnungsadresse
  const [rechName, setRechName]           = useState('');
  const [rechStrasse, setRechStrasse]     = useState('');
  const [rechPlz, setRechPlz]             = useState('');
  const [rechOrt, setRechOrt]             = useState('');
  const [rechBundesland, setRechBundesland] = useState('');
  const [rechLand, setRechLand]           = useState('');

  // Lieferadresse
  const [liefName, setLiefName]           = useState('');
  const [liefStrasse, setLiefStrasse]     = useState('');
  const [liefPlz, setLiefPlz]             = useState('');
  const [liefOrt, setLiefOrt]             = useState('');
  const [liefBundesland, setLiefBundesland] = useState('');
  const [liefLand, setLiefLand]           = useState('');

  const specs    = PRODUKT_SPECS[produkt];
  const totalKwh = specs.kapazitaetKwh * menge;
  const totalKw  = specs.leistungKw * menge;

  const TOTAL_STEPS = produkt === 'Voltfang 3 Plus' ? 10 : 8;

  const toggleAnwendungsfall = (val: string) =>
    setAnwendungsfaelle((prev) => prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]);

  const cacheKey = `hubspot_angebote_${partnerHubspotId}`;

  const fetchAngebote = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const all = await getHubSpotAngebote(partnerHubspotId);
      const filtered = all.filter((a) => a.dealHubspotId === dealHubspotId);
      setAngebote(filtered);
      try {
        const existing = sessionStorage.getItem(cacheKey);
        const parsed = existing ? JSON.parse(existing) : {};
        sessionStorage.setItem(cacheKey, JSON.stringify({ ...parsed, angebote: all }));
      } catch { /* Ignorieren */ }
    } catch (err: unknown) {
      console.error('Fehler beim Laden der Angebote:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let hasCached = false;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { angebote: all } = JSON.parse(cached);
        if (Array.isArray(all)) {
          setAngebote(all.filter((a) => a.dealHubspotId === dealHubspotId));
          setLoading(false);
          hasCached = true;
        }
      }
    } catch { /* Ignorieren */ }
    fetchAngebote(!hasCached);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealHubspotId, partnerHubspotId]);

  // Load signed PDF URLs + file sizes for all angebote
  useEffect(() => {
    if (angebote.length === 0) return;
    const loadPdfUrls = async () => {
      const urls: Record<string, string> = {};
      const sizes: Record<string, string> = {};
      const uploadDates: Record<string, string> = {};

      // Get file metadata (size + upload date) for all PDFs in this partner's folder
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
  }, [angebote]);

  const openWizard = () => {
    setWizardStep(1);
    setProdukt('Voltfang 3');
    setMenge(1);
    setBeton('Ja');
    setSteuerung(['Eigenverbrauchsoptimierung']);
    setGarantie('Basis');
    // V3 Plus reset
    setCRate('');
    setAnschlussspannungKv('');
    setMittelspannungsSchaltanlage('Nein');
    setBopC('Lieferumfang');
    setBopE('Lieferumfang');
    setAnwendungsfaelle([]);
    setGarantieerweiterung('Nein');
    setFormError(null);
    // Pre-fill Rechnungsadresse from partner
    setRechName(userCompany?.name ?? '');
    setRechStrasse(userCompany?.street ?? '');
    setRechPlz(userCompany?.zip ?? '');
    setRechOrt(userCompany?.city ?? '');
    setRechBundesland(userCompany?.bundesland ?? '');
    setRechLand(userCompany?.country ?? '');
    // Pre-fill Lieferadresse from project endkunde
    setLiefName(project?.unternehmen_name ?? '');
    setLiefStrasse(project?.unternehmen_street ?? '');
    setLiefPlz(project?.unternehmen_zip ?? '');
    setLiefOrt(project?.unternehmen_city ?? '');
    setLiefBundesland(project?.unternehmen_state ?? '');
    setLiefLand(project?.unternehmen_country ?? '');
    setWizardOpen(true);
  };

  const closeWizard = () => setWizardOpen(false);

  const canProceed = () => {
    if (produkt === 'Voltfang 3 Plus') {
      if (wizardStep === 6) return anwendungsfaelle.length > 0;
      if (wizardStep === 8) return !!(rechName && rechStrasse && rechPlz && rechOrt);
      if (wizardStep === 9) return !!(liefName && liefStrasse && liefPlz && liefOrt);
    } else {
      if (wizardStep === 3) return steuerung.length > 0;
      if (wizardStep === 6) return !!(rechName && rechStrasse && rechPlz && rechOrt);
      if (wizardStep === 7) return !!(liefName && liefStrasse && liefPlz && liefOrt);
    }
    return true;
  };

  const handleNext = () => {
    if (!canProceed()) return;
    if (wizardStep < TOTAL_STEPS) setWizardStep((s) => s + 1);
  };

  const handleBack = () => {
    if (wizardStep > 1) setWizardStep((s) => s - 1);
  };

  const handleSubmit = async () => {
    setFormError(null);
    setSubmitting(true);
    try {
      const newAngebot = await createHubSpotAngebot({
        dealHubspotId,
        partnerHubspotId,
        dealName: projectName,
        produkt,
        menge,
        leistungKw: totalKw,
        nettokapazitaetKwh: totalKwh,
        garantie,
        betonfundament,
        monitoring: 'Ja',
        steuerungsalgorithmen: steuerung,
        rechnungsadresse_unternehmensname: rechName,
        rechnungsadresse_strasse: rechStrasse,
        rechnungsadresse_plz: rechPlz,
        rechnungsadresse_ort: rechOrt,
        rechnungsadresse_bundesland: rechBundesland,
        rechnungsadresse_land: rechLand,
        lieferadresse_unternehmensname: liefName,
        lieferadresse_strasse: liefStrasse,
        lieferadresse_plz: liefPlz,
        lieferadresse_ort: liefOrt,
        lieferadresse_bundesland: liefBundesland,
        lieferadresse_land: liefLand,
      });
      setAngebote((prev) => [newAngebot, ...prev]);
      try { sessionStorage.removeItem(cacheKey); } catch { /* Ignorieren */ }
      closeWizard();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSteuerung = (val: string) => {
    setSteuerung((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    );
  };

  const formatDateTime = (iso: string) => {
    if (!iso) return null;
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  // ── Wizard Step Content ──────────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Produkt wählen</p>
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(PRODUKT_SPECS) as ProduktKey[]).map((p) => {
            const s = PRODUKT_SPECS[p];
            const selected = produkt === p;
            return (
              <button
                key={p}
                onClick={() => setProdukt(p)}
                className={`relative text-left rounded-2xl border-2 overflow-hidden transition-all flex flex-col
                  ${selected
                    ? 'border-[#82a8a4] bg-[#82a8a4]/[0.06]'
                    : 'border-slate-200 hover:border-[#82a8a4]/50 hover:shadow-sm'}`}
              >
                {/* Image section */}
                <div className="relative h-36 flex items-center justify-center px-4 py-3 bg-slate-50 shrink-0">
                  {selected && (
                    <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-[#82a8a4] rounded-full flex items-center justify-center z-10">
                      <Check size={11} className="text-white" strokeWidth={3} />
                    </span>
                  )}
                  <img
                    src={p === 'Voltfang 3' ? '/vf3-angebotsformular.png' : '/vf3-plus_angebotsformular.png'}
                    alt={p}
                    className="w-full h-full object-contain"
                  />
                </div>
                {/* Text section */}
                <div className="px-4 py-3 border-t border-slate-100 flex flex-col flex-1">
                  <p className="font-bold text-slate-800 text-sm mb-1">{p}</p>
                  <p className="text-[10px] text-[#82a8a4] font-semibold mb-1">
                    {s.kapazitaetKwh.toLocaleString('de-DE')} kWh · {s.leistungKw.toLocaleString('de-DE')} kW
                  </p>
                  <p className="text-[10px] text-slate-400 leading-snug">
                    {p === 'Voltfang 3' ? 'Hocheffizienter, kompakter Batteriespeicher mit integriertem Wechselrichter und innovativer Sicherheitstechnik' : 'Schlüsselfertiges Großspeichersystem mit DC-Batteriemodulen und AC-Wechselrichter-Skid, modular erweiterbar und ausgelegt für den Mittelspannungsanschluss'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
          {produkt === 'Voltfang 3 Plus' ? 'Anzahl 5-MWh-Einheiten' : 'Anzahl'}
        </p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-1 py-1">
            <button onClick={() => setMenge((m) => Math.max(1, m - 1))} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white transition-colors text-slate-600">
              <Minus size={14} />
            </button>
            <span className="w-8 text-center font-bold text-sm text-slate-800">{menge}</span>
            <button onClick={() => setMenge((m) => m + 1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white transition-colors text-slate-600">
              <Plus size={14} />
            </button>
          </div>
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{menge} × {specs.kapazitaetKwh.toLocaleString('de-DE')} kWh</span>
            {' = '}
            <span className="font-bold text-[#82a8a4]">{totalKwh.toLocaleString('de-DE')} kWh gesamt</span>
          </p>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Betonfundament</p>
      <p className="text-[10px] text-slate-400 -mt-0 mb-3">Soll ein Betonfundament für die Speicheraufstellung mitgeliefert werden?</p>
      <div className="grid grid-cols-2 gap-3">
        {(['Ja', 'Nein'] as const).map((val) => {
          const selected = betonfundament === val;
          return (
            <button key={val} onClick={() => setBeton(val)} className={`relative text-left rounded-2xl border-2 p-5 transition-all ${selected ? 'border-[#82a8a4] bg-[#82a8a4]/[0.06]' : 'border-slate-200 hover:border-[#82a8a4]/50 hover:shadow-sm'}`}>
              {selected && <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-[#82a8a4] rounded-full flex items-center justify-center"><Check size={11} className="text-white" strokeWidth={3} /></span>}
              <p className="font-bold text-slate-800 text-sm mb-2">{val}</p>
              <p className="text-[10px] text-slate-500 leading-snug">
                {val === 'Ja' ? 'Fertigfundament für den Voltfang 3 mit Kabeldurchführungen inkl. Lieferung.' : 'Kein Fundament erforderlich'}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Steuerungsalgorithmen</p>
      <p className="text-[10px] text-slate-400 mb-3">Mehrfachauswahl möglich — mind. eine Option erforderlich</p>
      <div className="grid grid-cols-2 gap-3">
        {STEUERUNG_OPTIONS.map(({ value, label, icon: Icon, desc }) => {
          const selected = steuerung.includes(value);
          return (
            <button key={value} onClick={() => toggleSteuerung(value)} className={`relative text-left rounded-2xl border-2 p-4 transition-all ${selected ? 'border-[#82a8a4] bg-[#82a8a4]/[0.06]' : 'border-slate-200 hover:border-[#82a8a4]/50 hover:shadow-sm'}`}>
              {selected && <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-[#82a8a4] rounded-full flex items-center justify-center"><Check size={11} className="text-white" strokeWidth={3} /></span>}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${selected ? 'bg-[#82a8a4]/20 text-[#82a8a4]' : 'bg-slate-100 text-slate-400'}`}><Icon size={16} /></div>
              <p className="font-semibold text-slate-800 text-[11px] mb-1 leading-snug">{label}</p>
              <p className="text-[10px] text-slate-400 leading-snug">{desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Monitoring</p>
      <div className="rounded-2xl border-2 border-[#82a8a4] bg-[#82a8a4]/[0.06] p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#82a8a4]/20 flex items-center justify-center text-[#82a8a4]"><Activity size={20} /></div>
          <div>
            <p className="font-bold text-slate-800 text-sm">Monitoring & Remote Service</p>
            <p className="text-[10px] text-[#82a8a4] font-semibold">Automatisch enthalten</p>
          </div>
          <span className="ml-auto w-6 h-6 bg-[#82a8a4] rounded-full flex items-center justify-center"><Check size={12} className="text-white" strokeWidth={3} /></span>
        </div>
        <ul className="space-y-2">
          {[
            'Kontinuierliche Systemüberwachung: permanente und lückenlose Überwachung des Batteriespeichersystems',
            'Remote-Eingriff: Systemupdates, Störungsbehebungen und Wiederherstellung des Normalzustands ohne Vor-Ort-Einsatz',
            'Frühzeitige Erkennung von Kapazitätsverlusten zur Einleitung proaktiver Maßnahmen für dauerhafte Leistungssicherung',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-[10px] text-slate-600">
              <Check size={11} className="text-[#82a8a4] mt-0.5 shrink-0" strokeWidth={3} />{item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Garantie</p>
      <div className="grid grid-cols-2 gap-3">
        {(['Basis', 'Premium'] as const).map((val) => {
          const selected = garantie === val;
          const years = val === 'Basis' ? 5 : 10;
          const bullets = [
            `${years} Jahre Systemgarantie auf alle Komponenten des Voltfang 3 sowie die EMS-Hardware.`,
            `${years} Jahre Kapazitätsgarantie: mindestens 70 % Restkapazität nach ${years} Jahren (Ø 2 Zyklen/Tag).`,
          ];
          return (
            <button key={val} onClick={() => setGarantie(val)} className={`relative text-left rounded-2xl border-2 p-5 transition-all ${selected ? 'border-[#82a8a4] bg-[#82a8a4]/[0.06]' : 'border-slate-200 hover:border-[#82a8a4]/50 hover:shadow-sm'}`}>
              {selected && <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-[#82a8a4] rounded-full flex items-center justify-center"><Check size={11} className="text-white" strokeWidth={3} /></span>}
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selected ? 'bg-[#82a8a4]/20 text-[#82a8a4]' : 'bg-slate-100 text-slate-400'}`}><Shield size={16} /></div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${selected ? 'bg-[#82a8a4] text-white' : 'bg-slate-200 text-slate-500'}`}>{years} Jahre</span>
              </div>
              <p className="font-bold text-slate-800 text-sm mb-2">{val}</p>
              <ul className="space-y-2">
                {bullets.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[10px] text-slate-600">
                    <Check size={11} className="text-[#82a8a4] mt-0.5 shrink-0" strokeWidth={3} />{item}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mt-3 space-y-1">
        <p className="text-[10px] text-slate-500 leading-snug">Die Voltfang Garantie bietet eine ganzheitliche Absicherung des Batteriespeichersystems, wahlweise über 5 Jahre (Basis) oder 10 Jahre (Premium). Beide Varianten umfassen System- und Kapazitätsgarantie.</p>
        <a
          href="https://voltfang.de/garantievereinbarung-voltfang-3"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-[#82a8a4] underline underline-offset-2 hover:opacity-70 block"
        >
          voltfang.de/garantievereinbarung-voltfang-3
        </a>
      </div>
    </div>
  );

  const renderStep6 = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Receipt size={15} className="text-[#82a8a4]" />
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Rechnungsadresse</p>
      </div>
      <p className="text-[10px] text-slate-400 -mt-2">Vorausgefüllt aus Ihren Partnerdaten — bitte prüfen und ggf. anpassen.</p>
      <Field label="Unternehmensname" value={rechName} onChange={setRechName} placeholder="Muster GmbH" required />
      <Field label="Straße & Hausnr." value={rechStrasse} onChange={setRechStrasse} placeholder="Musterstraße 1" required />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Postleitzahl" value={rechPlz} onChange={setRechPlz} placeholder="12345" required />
        <Field label="Ort" value={rechOrt} onChange={setRechOrt} placeholder="Musterstadt" required />
      </div>
      <BundeslandSelect value={rechBundesland} onChange={setRechBundesland} />
      <Field label="Land" value={rechLand} onChange={setRechLand} placeholder="Deutschland" />
    </div>
  );

  const renderStep7 = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <MapPin size={15} className="text-[#82a8a4]" />
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lieferadresse</p>
      </div>
      <p className="text-[10px] text-slate-400 -mt-2">Vorausgefüllt aus den Projektdaten — bitte prüfen und ggf. anpassen.</p>
      <Field label="Unternehmensname" value={liefName} onChange={setLiefName} placeholder="Endkunde GmbH" required />
      <Field label="Straße & Hausnr." value={liefStrasse} onChange={setLiefStrasse} placeholder="Projektstraße 1" required />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Postleitzahl" value={liefPlz} onChange={setLiefPlz} placeholder="12345" required />
        <Field label="Ort" value={liefOrt} onChange={setLiefOrt} placeholder="Projektstadt" required />
      </div>
      <BundeslandSelect value={liefBundesland} onChange={setLiefBundesland} />
      <Field label="Land" value={liefLand} onChange={setLiefLand} placeholder="Deutschland" />
    </div>
  );

  // ── Voltfang 3 Plus – spezifische Steps ────────────────────────────────────

  const renderPlusCRate = () => (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">C-Rate</p>
      <p className="text-[10px] text-slate-400 mb-3">Verhältnis von Entladeleistung zu nutzbarer Kapazität</p>
      <div className="grid grid-cols-2 gap-3">
        {(['0,25C', '0,5C', '1C', '2C'] as const).map((val) => {
          const selected = cRate === val;
          const desc: Record<string, string> = {
            '0,25C': '4-stündige Entladung – optimal für Langzeitspeicher',
            '0,5C':  '2-stündige Entladung – ausgewogene Konfiguration',
            '1C':    '1-stündige Entladung – Standard für Peak Shaving',
            '2C':    '30-min-Entladung – hohe Leistungsdichte',
          };
          return (
            <button key={val} onClick={() => setCRate(val)} className={`relative text-left rounded-2xl border-2 p-5 transition-all ${selected ? 'border-[#82a8a4] bg-[#82a8a4]/[0.06]' : 'border-slate-200 hover:border-[#82a8a4]/50 hover:shadow-sm'}`}>
              {selected && <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-[#82a8a4] rounded-full flex items-center justify-center"><Check size={11} className="text-white" strokeWidth={3} /></span>}
              <p className="font-bold text-slate-800 text-sm mb-1">{val}</p>
              <p className="text-[10px] text-slate-500 leading-snug">{desc[val]}</p>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderPlusAnschlussspannung = () => (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Anschlussspannung</p>
      <p className="text-[10px] text-slate-400 mb-3">Nennspannung des Netzanschlusspunkts</p>
      <div className="grid grid-cols-2 gap-3">
        {(['0,4 kV', '10 kV', '20 kV', '30 kV', '110 kV'] as const).map((val) => {
          const selected = anschlussspannungKv === val;
          const desc: Record<string, string> = {
            '0,4 kV':  'Niederspannung – kleine Gewerbeanlagen',
            '10 kV':   'Mittelspannung – mittlere Industrieanlagen',
            '20 kV':   'Mittelspannung – große Industrieanlagen',
            '30 kV':   'Mittelspannung – Industrieparks',
            '110 kV':  'Hochspannung – Großkraftwerke / Umspannwerke',
          };
          return (
            <button key={val} onClick={() => setAnschlussspannungKv(val)} className={`relative text-left rounded-2xl border-2 p-5 transition-all ${selected ? 'border-[#82a8a4] bg-[#82a8a4]/[0.06]' : 'border-slate-200 hover:border-[#82a8a4]/50 hover:shadow-sm'}`}>
              {selected && <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-[#82a8a4] rounded-full flex items-center justify-center"><Check size={11} className="text-white" strokeWidth={3} /></span>}
              <p className="font-bold text-slate-800 text-sm mb-1">{val}</p>
              <p className="text-[10px] text-slate-500 leading-snug">{desc[val]}</p>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderPlusMittelspannung = () => (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Mittelspannungs-Schaltanlage</p>
      <p className="text-[10px] text-slate-400 mb-3">Wird eine Mittelspannungs-Schaltanlage im Lieferumfang benötigt?</p>
      <div className="grid grid-cols-2 gap-3">
        {(['Ja', 'Nein'] as const).map((val) => {
          const selected = mittelspannungsSchaltanlage === val;
          return (
            <button key={val} onClick={() => setMittelspannungsSchaltanlage(val)} className={`relative text-left rounded-2xl border-2 p-5 transition-all ${selected ? 'border-[#82a8a4] bg-[#82a8a4]/[0.06]' : 'border-slate-200 hover:border-[#82a8a4]/50 hover:shadow-sm'}`}>
              {selected && <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-[#82a8a4] rounded-full flex items-center justify-center"><Check size={11} className="text-white" strokeWidth={3} /></span>}
              <p className="font-bold text-slate-800 text-sm mb-2">{val}</p>
              <p className="text-[10px] text-slate-500 leading-snug">
                {val === 'Ja' ? 'Schaltanlage im Lieferumfang enthalten' : 'Kundenseitig vorhanden oder nicht erforderlich'}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderPlusBop = () => (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">BOP-C (Balance of Plant – Civil)</p>
        <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
          Bitte wählen Sie, ob die baulichen Leistungen (Fundamente, Erdarbeiten, Einfriedung, Entwässerung etc.) im Lieferumfang enthalten sind oder vom Kunden beigestellt werden.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(['Lieferumfang', 'Kundenbeigestellt'] as const).map((val) => {
            const selected = bopC === val;
            return (
              <button key={val} onClick={() => setBopC(val)} className={`relative text-left rounded-2xl border-2 p-4 transition-all ${selected ? 'border-[#82a8a4] bg-[#82a8a4]/[0.06]' : 'border-slate-200 hover:border-[#82a8a4]/50 hover:shadow-sm'}`}>
                {selected && <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-[#82a8a4] rounded-full flex items-center justify-center"><Check size={11} className="text-white" strokeWidth={3} /></span>}
                <p className="font-bold text-slate-800 text-sm mb-1">{val === 'Lieferumfang' ? 'Im Lieferumfang' : 'Kundenbeigestellt'}</p>
                <p className="text-[10px] text-slate-500 leading-snug">
                  {val === 'Lieferumfang' ? 'Bauliche Leistungen durch Voltfang' : 'Bauliche Leistungen durch den Kunden'}
                </p>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">BOP-E (Balance of Plant – Electrical)</p>
        <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
          Bitte wählen Sie, ob die elektrischen Installationsleistungen außerhalb der Batteriecontainer (Kabeltrassen, Erdung, Beleuchtung, SCADA-Anbindung etc.) im Lieferumfang enthalten sind oder vom Kunden beigestellt werden.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(['Lieferumfang', 'Kundenbeigestellt'] as const).map((val) => {
            const selected = bopE === val;
            return (
              <button key={val} onClick={() => setBopE(val)} className={`relative text-left rounded-2xl border-2 p-4 transition-all ${selected ? 'border-[#82a8a4] bg-[#82a8a4]/[0.06]' : 'border-slate-200 hover:border-[#82a8a4]/50 hover:shadow-sm'}`}>
                {selected && <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-[#82a8a4] rounded-full flex items-center justify-center"><Check size={11} className="text-white" strokeWidth={3} /></span>}
                <p className="font-bold text-slate-800 text-sm mb-1">{val === 'Lieferumfang' ? 'Im Lieferumfang' : 'Kundenbeigestellt'}</p>
                <p className="text-[10px] text-slate-500 leading-snug">
                  {val === 'Lieferumfang' ? 'Elektroarbeiten durch Voltfang' : 'Elektroarbeiten durch den Kunden'}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderPlusAnwendungsfaelle = () => (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Anwendungsfälle</p>
      <p className="text-[10px] text-slate-400 mb-3">Mehrfachauswahl möglich — mind. eine Option erforderlich</p>
      <div className="grid grid-cols-2 gap-3">
        {ANWENDUNGSFALL_OPTIONS.map(({ value, label, icon: Icon, desc }) => {
          const selected = anwendungsfaelle.includes(value);
          return (
            <button key={value} onClick={() => toggleAnwendungsfall(value)} className={`relative text-left rounded-2xl border-2 p-4 transition-all ${selected ? 'border-[#82a8a4] bg-[#82a8a4]/[0.06]' : 'border-slate-200 hover:border-[#82a8a4]/50 hover:shadow-sm'}`}>
              {selected && <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-[#82a8a4] rounded-full flex items-center justify-center"><Check size={11} className="text-white" strokeWidth={3} /></span>}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${selected ? 'bg-[#82a8a4]/20 text-[#82a8a4]' : 'bg-slate-100 text-slate-400'}`}><Icon size={16} /></div>
              <p className="font-semibold text-slate-800 text-[11px] mb-1 leading-snug">{label}</p>
              <p className="text-[10px] text-slate-400 leading-snug">{desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderPlusGarantieerweiterung = () => (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Garantieerweiterung</p>
      <div className="grid grid-cols-2 gap-3">
        {(['Nein', 'Ja'] as const).map((val) => {
          const selected = garantieerweiterung === val;
          const label = val === 'Nein' ? 'Basis' : 'Premium';
          const years = val === 'Nein' ? 5 : 10;
          const bullets = [
            `${years} Jahre Systemgarantie auf alle Komponenten des Voltfang 3 Plus sowie die EMS-Hardware.`,
            `${years} Jahre Kapazitätsgarantie: mindestens 70 % Restkapazität nach ${years} Jahren (Ø 2 Zyklen/Tag).`,
          ];
          return (
            <button key={val} onClick={() => setGarantieerweiterung(val)} className={`relative text-left rounded-2xl border-2 p-5 transition-all ${selected ? 'border-[#82a8a4] bg-[#82a8a4]/[0.06]' : 'border-slate-200 hover:border-[#82a8a4]/50 hover:shadow-sm'}`}>
              {selected && <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-[#82a8a4] rounded-full flex items-center justify-center"><Check size={11} className="text-white" strokeWidth={3} /></span>}
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selected ? 'bg-[#82a8a4]/20 text-[#82a8a4]' : 'bg-slate-100 text-slate-400'}`}><Shield size={16} /></div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${selected ? 'bg-[#82a8a4] text-white' : 'bg-slate-200 text-slate-500'}`}>{years} Jahre</span>
              </div>
              <p className="font-bold text-slate-800 text-sm mb-2">{label}</p>
              <ul className="space-y-2">
                {bullets.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[10px] text-slate-600">
                    <Check size={11} className="text-[#82a8a4] mt-0.5 shrink-0" strokeWidth={3} />{item}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mt-3 space-y-1">
        <p className="text-[10px] text-slate-500 leading-snug">Die Voltfang Garantie bietet eine ganzheitliche Absicherung des Batteriespeichersystems – wahlweise über 5 Jahre (Basis) oder 10 Jahre (Premium). Beide Varianten umfassen System- und Kapazitätsgarantie.</p>
        <a
          href="https://voltfang.de/garantievereinbarung-voltfang-3"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-[#82a8a4] underline underline-offset-2 hover:opacity-70 block"
        >
          voltfang.de/garantievereinbarung-voltfang-3
        </a>
      </div>
    </div>
  );

  const renderPlusUebersicht = () => (
    <div className="space-y-5">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gesamtübersicht — bitte prüfen</p>
      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Produkt & Konfiguration</p>
        </div>
        <div className="px-4 py-1">
          <SummaryRow label="Produkt" value={produkt} />
          <SummaryRow label="Anzahl 5-MWh-Einheiten" value={`${menge}×`} />
          <SummaryRow label="Kapazität" value={`${totalKwh.toLocaleString('de-DE')} kWh`} />
          <SummaryRow label="Leistung" value={`${totalKw.toLocaleString('de-DE')} kW`} />
          {cRate && <SummaryRow label="C-Rate" value={cRate} />}
          {anschlussspannungKv && <SummaryRow label="Anschlussspannung" value={anschlussspannungKv} />}
          <SummaryRow label="MS-Schaltanlage" value={mittelspannungsSchaltanlage} />
          <SummaryRow label="BOP-C" value={bopC === 'Lieferumfang' ? 'Im Lieferumfang' : 'Kundenbeigestellt'} />
          <SummaryRow label="BOP-E" value={bopE === 'Lieferumfang' ? 'Im Lieferumfang' : 'Kundenbeigestellt'} />
          {anwendungsfaelle.length > 0 && <SummaryRow label="Anwendungsfälle" value={anwendungsfaelle.join(', ')} />}
          <SummaryRow label="Garantieerweiterung" value={garantieerweiterung} />
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Rechnungsadresse</p>
        </div>
        <div className="px-4 py-1">
          <SummaryRow label="Unternehmen" value={rechName} />
          <SummaryRow label="Straße" value={rechStrasse} />
          <SummaryRow label="PLZ / Ort" value={`${rechPlz} ${rechOrt}`} />
          {rechBundesland && <SummaryRow label="Bundesland" value={rechBundesland} />}
          {rechLand && <SummaryRow label="Land" value={rechLand} />}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Lieferadresse</p>
        </div>
        <div className="px-4 py-1">
          <SummaryRow label="Unternehmen" value={liefName} />
          <SummaryRow label="Straße" value={liefStrasse} />
          <SummaryRow label="PLZ / Ort" value={`${liefPlz} ${liefOrt}`} />
          {liefBundesland && <SummaryRow label="Bundesland" value={liefBundesland} />}
          {liefLand && <SummaryRow label="Land" value={liefLand} />}
        </div>
      </div>
    </div>
  );

  const renderStep8 = () => (
    <div className="space-y-5">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gesamtübersicht — bitte prüfen</p>

      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Produkt & Konfiguration</p>
        </div>
        <div className="px-4 py-1">
          <SummaryRow label="Produkt" value={produkt} />
          <SummaryRow label="Anzahl" value={`${menge}×`} />
          <SummaryRow label="Kapazität" value={`${totalKwh.toLocaleString('de-DE')} kWh`} />
          <SummaryRow label="Leistung" value={`${totalKw.toLocaleString('de-DE')} kW`} />
          <SummaryRow label="Betonfundament" value={betonfundament} />
          <SummaryRow label="Steuerung" value={steuerung.join(', ')} />
          <SummaryRow label="Monitoring" value="Ja (inklusive)" />
          <SummaryRow label="Garantie" value={`${garantie} (${garantie === 'Basis' ? '5' : '10'} Jahre)`} />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Rechnungsadresse</p>
        </div>
        <div className="px-4 py-1">
          <SummaryRow label="Unternehmen" value={rechName} />
          <SummaryRow label="Straße" value={rechStrasse} />
          <SummaryRow label="PLZ / Ort" value={`${rechPlz} ${rechOrt}`} />
          {rechBundesland && <SummaryRow label="Bundesland" value={rechBundesland} />}
          {rechLand && <SummaryRow label="Land" value={rechLand} />}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Lieferadresse</p>
        </div>
        <div className="px-4 py-1">
          <SummaryRow label="Unternehmen" value={liefName} />
          <SummaryRow label="Straße" value={liefStrasse} />
          <SummaryRow label="PLZ / Ort" value={`${liefPlz} ${liefOrt}`} />
          {liefBundesland && <SummaryRow label="Bundesland" value={liefBundesland} />}
          {liefLand && <SummaryRow label="Land" value={liefLand} />}
        </div>
      </div>
    </div>
  );

  const stepTitles = produkt === 'Voltfang 3 Plus'
    ? ['Produkt & Anzahl', 'C-Rate', 'Anschlussspannung', 'MS-Schaltanlage', 'BOP-C & BOP-E', 'Anwendungsfälle', 'Garantieerweiterung', 'Rechnungsadresse', 'Lieferadresse', 'Übersicht & Absenden']
    : ['Produkt & Anzahl', 'Betonfundament', 'Steuerungsalgorithmen', 'Monitoring', 'Garantie', 'Rechnungsadresse', 'Lieferadresse', 'Übersicht & Absenden'];

  // ── JSX ──────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-[#82a8a4] border border-slate-100">
            <FileText size={15} />
          </div>
          <h3 className="font-semibold text-xs text-slate-700 tracking-wide">Angebote</h3>
        </div>
        <button
          onClick={openWizard}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-white bg-[#82a8a4] hover:bg-[#6d9490] rounded-lg transition-all active:scale-[0.98]"
        >
          <Plus size={12} /> Angebot anfragen
        </button>
      </div>

      {/* Wizard Overlay */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">

            {/* Progress bar */}
            <div className="h-1 bg-slate-100 relative">
              <div className="h-full bg-[#82a8a4] transition-all duration-300" style={{ width: `${(wizardStep / TOTAL_STEPS) * 100}%` }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Schritt {wizardStep} / {TOTAL_STEPS}</p>
                <p className="font-bold text-sm text-slate-800 mt-0.5">{stepTitles[wizardStep - 1]}</p>
              </div>
              <button onClick={closeWizard} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={18} /></button>
            </div>

            {/* Body: two-panel layout */}
            <div className="flex flex-1 min-h-0">
              {/* Main content */}
              <div className="flex-1 overflow-y-auto p-6">
                {produkt === 'Voltfang 3 Plus' ? (
                  <>
                    {wizardStep === 1  && renderStep1()}
                    {wizardStep === 2  && renderPlusCRate()}
                    {wizardStep === 3  && renderPlusAnschlussspannung()}
                    {wizardStep === 4  && renderPlusMittelspannung()}
                    {wizardStep === 5  && renderPlusBop()}
                    {wizardStep === 6  && renderPlusAnwendungsfaelle()}
                    {wizardStep === 7  && renderPlusGarantieerweiterung()}
                    {wizardStep === 8  && renderStep6()}
                    {wizardStep === 9  && renderStep7()}
                    {wizardStep === 10 && renderPlusUebersicht()}
                  </>
                ) : (
                  <>
                    {wizardStep === 1 && renderStep1()}
                    {wizardStep === 2 && renderStep2()}
                    {wizardStep === 3 && renderStep3()}
                    {wizardStep === 4 && renderStep4()}
                    {wizardStep === 5 && renderStep5()}
                    {wizardStep === 6 && renderStep6()}
                    {wizardStep === 7 && renderStep7()}
                    {wizardStep === 8 && renderStep8()}
                  </>
                )}
              </div>

              {/* Summary panel (hidden on last step — content IS the summary) */}
              {wizardStep < TOTAL_STEPS && (
                <div className="w-56 border-l border-slate-100 bg-slate-50 p-5 shrink-0 overflow-y-auto">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-4">Zusammenfassung</p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-0.5">Produkt</p>
                      <p className="text-xs font-bold text-slate-800">{produkt}</p>
                      <p className="text-[10px] text-slate-500">{menge}× {produkt === 'Voltfang 3 Plus' ? '5-MWh-Einheit' : 'Einheit'}{menge !== 1 ? 'en' : ''}</p>
                    </div>
                    <div className="border-t border-slate-200 pt-3">
                      <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-1">Kapazität</p>
                      <p className="text-sm font-bold text-[#82a8a4]">{totalKwh.toLocaleString('de-DE')} kWh</p>
                      <p className="text-[10px] text-slate-500">{totalKw.toLocaleString('de-DE')} kW</p>
                    </div>

                    {produkt === 'Voltfang 3 Plus' ? (
                      <>
                        {wizardStep >= 2 && cRate && (
                          <div className="border-t border-slate-200 pt-3">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-0.5">C-Rate</p>
                            <p className="text-[10px] font-semibold text-slate-700">{cRate}</p>
                          </div>
                        )}
                        {wizardStep >= 3 && anschlussspannungKv && (
                          <div className="border-t border-slate-200 pt-3">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-0.5">Anschlussspannung</p>
                            <p className="text-[10px] font-semibold text-slate-700">{anschlussspannungKv}</p>
                          </div>
                        )}
                        {wizardStep >= 4 && (
                          <div className="border-t border-slate-200 pt-3">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-0.5">MS-Schaltanlage</p>
                            <p className="text-[10px] font-semibold text-slate-700">{mittelspannungsSchaltanlage}</p>
                          </div>
                        )}
                        {wizardStep >= 5 && (
                          <div className="border-t border-slate-200 pt-3">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-0.5">BOP-C / BOP-E</p>
                            <p className="text-[9px] font-semibold text-slate-700">C: {bopC === 'Lieferumfang' ? 'Lieferumfang' : 'Kundenbeigestellt'}</p>
                            <p className="text-[9px] font-semibold text-slate-700">E: {bopE === 'Lieferumfang' ? 'Lieferumfang' : 'Kundenbeigestellt'}</p>
                          </div>
                        )}
                        {wizardStep >= 6 && anwendungsfaelle.length > 0 && (
                          <div className="border-t border-slate-200 pt-3">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-1">Anwendungsfälle</p>
                            <div className="space-y-1">
                              {anwendungsfaelle.map((a) => <p key={a} className="text-[9px] font-semibold text-slate-700 leading-snug">{a}</p>)}
                            </div>
                          </div>
                        )}
                        {wizardStep >= 7 && (
                          <div className="border-t border-slate-200 pt-3">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-0.5">Garantieerweiterung</p>
                            <p className="text-[10px] font-semibold text-slate-700">{garantieerweiterung}</p>
                          </div>
                        )}
                        {wizardStep >= 8 && rechName && (
                          <div className="border-t border-slate-200 pt-3">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-0.5">Rechnung</p>
                            <p className="text-[9px] font-semibold text-slate-700 leading-snug">{rechName}</p>
                            <p className="text-[9px] text-slate-400 leading-snug">{rechPlz} {rechOrt}</p>
                          </div>
                        )}
                        {wizardStep >= 9 && liefName && (
                          <div className="border-t border-slate-200 pt-3">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-0.5">Lieferung</p>
                            <p className="text-[9px] font-semibold text-slate-700 leading-snug">{liefName}</p>
                            <p className="text-[9px] text-slate-400 leading-snug">{liefPlz} {liefOrt}</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {wizardStep >= 2 && (
                          <div className="border-t border-slate-200 pt-3">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-0.5">Fundament</p>
                            <p className="text-[10px] font-semibold text-slate-700">{betonfundament}</p>
                          </div>
                        )}
                        {wizardStep >= 3 && steuerung.length > 0 && (
                          <div className="border-t border-slate-200 pt-3">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-1">Steuerung</p>
                            <div className="space-y-1">
                              {steuerung.map((s) => <p key={s} className="text-[9px] font-semibold text-slate-700 leading-snug">{s}</p>)}
                            </div>
                          </div>
                        )}
                        {wizardStep >= 4 && (
                          <div className="border-t border-slate-200 pt-3">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-0.5">Monitoring</p>
                            <p className="text-[10px] font-semibold text-[#82a8a4]">Ja (inklusive)</p>
                          </div>
                        )}
                        {wizardStep >= 5 && (
                          <div className="border-t border-slate-200 pt-3">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-0.5">Garantie</p>
                            <p className="text-[10px] font-semibold text-slate-700">{garantie} ({garantie === 'Basis' ? '5' : '10'} Jahre)</p>
                          </div>
                        )}
                        {wizardStep >= 6 && rechName && (
                          <div className="border-t border-slate-200 pt-3">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-0.5">Rechnung</p>
                            <p className="text-[9px] font-semibold text-slate-700 leading-snug">{rechName}</p>
                            <p className="text-[9px] text-slate-400 leading-snug">{rechPlz} {rechOrt}</p>
                          </div>
                        )}
                        {wizardStep >= 7 && liefName && (
                          <div className="border-t border-slate-200 pt-3">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-0.5">Lieferung</p>
                            <p className="text-[9px] font-semibold text-slate-700 leading-snug">{liefName}</p>
                            <p className="text-[9px] text-slate-400 leading-snug">{liefPlz} {liefOrt}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
              {formError && (
                <p className="text-[10px] text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5 flex-1">{formError}</p>
              )}
              <div className="flex items-center gap-3 ml-auto">
                {wizardStep > 1 && (
                  <button onClick={handleBack} disabled={submitting} className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50">
                    <ChevronLeft size={14} /> Zurück
                  </button>
                )}
                {wizardStep < TOTAL_STEPS ? (
                  <button
                    onClick={handleNext}
                    disabled={!canProceed()}
                    className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-[#82a8a4] hover:bg-[#6d9490] rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Weiter <ChevronRight size={14} />
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-[#82a8a4] hover:bg-[#6d9490] rounded-xl transition-all disabled:opacity-60"
                  >
                    {submitting ? (
                      <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Wird erstellt…</>
                    ) : 'Angebot anfragen'}
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Table */}
      <div className="p-5">
        {loading ? (
          <div className="flex items-center gap-3 py-6 justify-center">
            <div className="w-5 h-5 border-2 border-[#82a8a4]/20 border-t-[#82a8a4] rounded-full animate-spin" />
            <span className="text-xs text-slate-400">Angebote werden geladen…</span>
          </div>
        ) : angebote.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-xs text-slate-400">Noch keine Angebote für dieses Projekt.</p>
          </div>
        ) : (
          <table className="w-full text-left table-fixed text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[9px] font-semibold text-slate-400 uppercase tracking-widest">
                <th className="pb-2.5 w-[30%]">Produkt</th>
                <th className="pb-2.5 w-[16%]">Preis [€]</th>
                <th className="pb-2.5 w-[20%]">Erstellt</th>
                <th className="pb-2.5 w-[20%]">Ablaufdatum</th>
                <th className="pb-2.5 w-[14%]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {angebote.map((a) => {
                const pdfUrl = pdfUrls[a.hubspotId];
                const pdfSize = pdfSizes[a.hubspotId];
                const hochgeladenRaw = pdfUploadDates[a.hubspotId];
                const erstellt = formatDateTime(hochgeladenRaw ?? a.erstellungsdatum);
                const downloadPdf = () => {
                  if (!pdfUrl) return;
                  const link = document.createElement('a');
                  link.href = pdfUrl;
                  link.download = `Angebot_${a.hubspotId}.pdf`;
                  link.click();
                };
                return (
                  <tr key={a.hubspotId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 pr-4">
                      <p className="font-bold text-slate-800">{a.produkt ?? '–'}</p>
                      <p className="text-[10px] text-slate-400 font-medium mt-0.5 flex items-center gap-1.5">
                        {a.nettokapazitaetKwh != null ? <span>{a.nettokapazitaetKwh.toLocaleString('de-DE')} kWh</span> : <span className="italic">– kWh</span>}
                        <span className="text-slate-200">|</span>
                        {a.leistungKw != null ? <span>{a.leistungKw.toLocaleString('de-DE')} kW</span> : <span className="italic">– kW</span>}
                      </p>
                    </td>
                    <td className="py-3 font-medium text-slate-600">
                      {a.nettopreis != null ? `${a.nettopreis.toLocaleString('de-DE')} €` : <span className="text-slate-300 italic">–</span>}
                    </td>
                    <td className="py-3">
                      {erstellt ? (
                        <>
                          <p className="font-medium text-slate-600 text-xs">{erstellt.date}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{erstellt.time}</p>
                        </>
                      ) : <span className="text-slate-300 italic text-xs">–</span>}
                    </td>
                    <td className="py-3 text-xs font-medium text-slate-600">
                      {a.ablaufdatum
                        ? (() => { const [y, m, d] = a.ablaufdatum.split('-'); return `${d}.${m}.${y}`; })()
                        : <span className="text-slate-300 italic">–</span>}
                    </td>
                    <td className="py-3">
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
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
