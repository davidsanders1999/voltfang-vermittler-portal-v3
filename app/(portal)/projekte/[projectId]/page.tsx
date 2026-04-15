'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import confetti from 'canvas-confetti';
import {
  ChevronLeft,
  Building,
  Navigation,
  CalendarClock,
  User,
  Mail,
  Phone,
  Globe,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import type { Project } from '@/types';
import PipelineVisualizer from '@/components/ui/PipelineVisualizer';
import AngeboteSection from '@/components/features/AngeboteSection';
import { getHubSpotContext } from '@/lib/api/hubspot';
import { usePortalData } from '@/hooks/usePortalData';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function ProjektDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { userProfile, userCompany } = usePortalData();

  const projectId = params.projectId as string;
  const partnerType = userCompany?.partnerType ?? 'Vermittler';
  const partnerHubspotId = userCompany?.hubspot_id;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userProfile?.company_id) return;

    const fetchProject = async () => {
      try {
        const context = await getHubSpotContext(userProfile?.company_id);
        const projects: Project[] = context?.projects || [];
        const found = projects.find((p) => String(p.id) === projectId);
        setProject(found ?? null);
      } catch (error) {
        console.error('Fehler beim Laden des Projekts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [userProfile?.company_id, projectId]);

  // Effekt für die Konfetti-Animation bei gewonnenen Projekten
  useEffect(() => {
    if (project?.dealstage === 'Gewonnen') {
      const duration = 3 * 1000; // 3 Sekunden Animationsdauer
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

      // Hilfsfunktion für zufällige Zahlen in einem Bereich
      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      // Intervall startet alle 250ms neue Konfetti-Explosionen
      const interval: ReturnType<typeof setInterval> = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        // Wenn Zeit abgelaufen, Intervall stoppen
        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        // Partikelanzahl nimmt über die Zeit ab
        const particleCount = 50 * (timeLeft / duration);

        // Konfetti von der linken Seite
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
          colors: ['#82a8a4', '#fbbf24', '#ffffff'] // Voltfang-Farben
        });

        // Konfetti von der rechten Seite
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
          colors: ['#82a8a4', '#fbbf24', '#ffffff']
        });
      }, 250);

      // Cleanup: Intervall löschen, wenn Komponente unmountet
      return () => clearInterval(interval);
    }
  }, [project?.id, project?.dealstage]);

  /**
   * Hilfsfunktion zur Formatierung von Datums-Strings ins deutsche Format
   */
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'noch offen';
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const onBack = () => router.push('/projekte');

  if (loading) {
    return <LoadingSpinner text="Projekt wird geladen…" />;
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-slate-500">Projekt nicht gefunden.</p>
        <button onClick={onBack} className="mt-4 text-xs text-[#82a8a4] hover:underline">
          Zurück zur Übersicht
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Zurück-Button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors"
      >
        <ChevronLeft size={15} /> Zurück zur Übersicht
      </button>

      {/* --- HEADER KARTE --- */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-5">
            {/* Projekt-Name und Basis-Infos */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#82a8a4]/10 rounded-xl flex items-center justify-center text-[#82a8a4] flex-shrink-0">
                 <Building size={22} strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">{project.name}</h2>
                <div className="flex items-center gap-1.5 mt-1 text-slate-400 text-xs">
                  <Navigation size={11} className="text-[#82a8a4]" />
                  <span>{project.location_city}, {project.location_country}</span>
                </div>
              </div>
            </div>
            {/* Creator-Banner */}
            <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-[#82a8a4]/10 text-[#82a8a4] flex items-center justify-center text-[10px] font-bold flex-shrink-0 uppercase">
                {project.creator.fname[0]}{project.creator.lname[0]}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700 truncate">
                  {project.creator.fname} {project.creator.lname}
                </p>
                <p className="text-[10px] text-slate-400 leading-tight">
                  seit {new Date(project.created_at).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* --- PIPELINE ABSCHNITT (nur für Vermittler) --- */}
        {partnerType === 'Vermittler' && (
          <div className="px-8 py-6 border-b border-slate-100">
            <div className="max-w-3xl mx-auto">
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-5">Pipeline-Fortschritt</p>
              <PipelineVisualizer status={project.dealstage} />
            </div>
          </div>
        )}

        {/* --- HAUPTINHALT (Zwei-Spalten-Layout) --- */}
        <div className="p-10 bg-white">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-20 gap-y-12">

            {/* --- LINKE SPALTE: UNTERNEHMEN & KONTAKT --- */}
            <div className="space-y-10">
              {/* Projektunternehmen */}
              <section className="space-y-5">
                <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
                  <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center text-[#82a8a4]">
                    <Building size={14} />
                  </div>
                  <h3 className="font-bold text-[10px] text-slate-400 uppercase tracking-widest">Projektunternehmen</h3>
                </div>
                {!project.unternehmen_name ? (
                  <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle size={15} className="text-amber-500" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-amber-700">Kein Endkunde verknüpft</p>
                      <p className="text-[10px] text-amber-600 mt-0.5 leading-snug">Diesem Projekt ist aktuell kein Endkunde zugeordnet.</p>
                    </div>
                  </div>
                ) : (
                  <div className="pl-10 space-y-4">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-slate-400 uppercase mb-1">Unternehmensname</span>
                      {project.unternehmen_website ? (
                        <a href={project.unternehmen_website} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-[#82a8a4] hover:underline flex items-center gap-1.5 group/link">
                          {project.unternehmen_name}
                          <ExternalLink size={12} className="opacity-0 group-hover/link:opacity-100 transition-opacity" />
                        </a>
                      ) : (
                        <span className="text-sm font-bold text-slate-700">{project.unternehmen_name}</span>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-slate-400 uppercase mb-1">Anschrift</span>
                      <p className="text-xs font-bold text-slate-700 leading-relaxed">
                        {project.unternehmen_street}<br />
                        {project.unternehmen_zip} {project.unternehmen_city}<br />
                        {project.unternehmen_state}, {project.unternehmen_country}
                      </p>
                    </div>
                  </div>
                )}
              </section>

              {/* Projektkontakt */}
              <section className="space-y-5">
                <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
                  <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center text-[#82a8a4]">
                    <User size={14} />
                  </div>
                  <h3 className="font-bold text-[10px] text-slate-400 uppercase tracking-widest">Projektkontakt</h3>
                </div>
                {!project.kontakt_fname ? (
                  <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle size={15} className="text-amber-500" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-amber-700">Kein Projektkontakt verknüpft</p>
                      <p className="text-[10px] text-amber-600 mt-0.5 leading-snug">Diesem Projekt ist aktuell kein Kontakt zugeordnet.</p>
                    </div>
                  </div>
                ) : (
                  <div className="pl-10 space-y-4">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-slate-400 uppercase mb-1">Name</span>
                      <span className="text-xs font-bold text-slate-700">
                        {project.kontakt_salutation} {project.kontakt_fname} {project.kontakt_lname}
                      </span>
                      <span className="text-[10px] text-slate-400 mt-0.5">{project.kontakt_rolle_im_unternehmen}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-slate-400 uppercase mb-1">Kontakt</span>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                          <Mail size={14} className="text-[#82a8a4]/50" /> {project.kontakt_email}
                        </div>
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                          <Phone size={14} className="text-[#82a8a4]/50" /> {project.kontakt_phone}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* Voltfang interner Ansprechpartner */}
              <section className="space-y-5">
                <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
                  <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center text-[#82a8a4]">
                    <User size={14} />
                  </div>
                  <h3 className="font-bold text-[10px] text-slate-400 uppercase tracking-widest">Ansprechpartner (Voltfang)</h3>
                </div>
                <div className="pl-10 space-y-4">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-slate-400 uppercase mb-1">Name</span>
                    <span className="text-xs font-bold text-slate-700">
                      {project.vf_contact_name || 'Wird intern vergeben...'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-slate-400 uppercase mb-1">Kontakt</span>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                        <Mail size={14} className="text-[#82a8a4]/50" /> {project.vf_contact_email || 'Keine Angabe'}
                      </div>
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                        <Phone size={14} className="text-[#82a8a4]/50" /> {project.vf_contact_phone || 'Keine Angabe'}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* --- RECHTE SPALTE: PLANUNG & STANDORT --- */}
            <div className="space-y-10">
              {/* Projektplanung (Daten & Volumen) */}
              <section className="space-y-5">
                <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
                  <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center text-[#82a8a4]">
                    <CalendarClock size={14} />
                  </div>
                  <h3 className="font-bold text-[10px] text-slate-400 uppercase tracking-widest">Projektplanung</h3>
                </div>
                <div className="pl-10 space-y-5">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Erstellungsdatum</span>
                    <p className="text-xs font-bold text-slate-800">{formatDate(project.created_at)}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Vorauss. Bestelldatum</span>
                    <p className="text-xs font-bold text-slate-800">{formatDate(project.estimated_order_date)}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Kapazität</span>
                    <p className="text-xs font-bold text-slate-800">
                      {project.offered_capacity
                        ? `${project.offered_capacity.toLocaleString('de-DE')} kWh`
                        : project.estimated_capacity
                          ? <span className="text-slate-500">{project.estimated_capacity} <span className="text-[10px] text-slate-400">(vorläufig)</span></span>
                          : 'Keine Angabe'
                      }
                    </p>
                  </div>
                  {partnerType === 'Vertriebspartner' && (
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Deal-Wert</span>
                      <p className="text-xs font-bold text-slate-800">
                        {project.deal_value
                          ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(project.deal_value)
                          : 'Keine Angabe'}
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Sonstige Projektinformationen</span>
                    <p className="text-xs font-medium text-slate-700 whitespace-pre-wrap break-words">
                      {project.description?.trim() || 'Keine Angabe'}
                    </p>
                  </div>
                </div>
              </section>

              {/* Standortdetails */}
              <section className="space-y-5">
                <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
                  <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center text-[#82a8a4]">
                    <Navigation size={14} />
                  </div>
                  <h3 className="font-bold text-[10px] text-slate-400 uppercase tracking-widest">Standortdetails</h3>
                </div>
                <div className="pl-10">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-slate-400 uppercase mb-1">Anschrift</span>
                    <p className="text-xs font-bold text-slate-700 leading-relaxed">
                      {project.location_street}<br />
                      {project.location_zip} {project.location_city}<br />
                      {project.location_state}, {project.location_country}
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* --- ANGEBOTE ABSCHNITT (nur für Vertriebspartner) --- */}
      {partnerType === 'Vertriebspartner' && partnerHubspotId && (
        <AngeboteSection
          dealHubspotId={String(project.hubspot_id)}
          partnerHubspotId={partnerHubspotId}
          projectName={project.name}
          project={project}
          userCompany={userCompany}
        />
      )}

      {/* --- KARTEN ABSCHNITT (Google Maps Integration) --- */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-[#82a8a4] border border-slate-100">
              <Globe size={15} />
            </div>
            <h3 className="font-semibold text-xs text-slate-700 tracking-wide">Kartenansicht & Umgebung</h3>
          </div>
          {/* Externer Link zu Google Maps */}
          <button className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-lg hover:bg-white hover:text-[#82a8a4] transition-all flex items-center gap-1.5">
            <ExternalLink size={10} /> Google Maps
          </button>
        </div>
        <div className="relative h-[400px] w-full group">
            {/* Einbettung der Karte via iFrame basierend auf den Adressdaten */}
            <iframe
              width="100%"
              height="100%"
              frameBorder="0"
              style={{ border: 0 }}
              src={`https://maps.google.com/maps?q=${encodeURIComponent(project.location_street + '+' + project.location_zip + '+' + project.location_city)}&t=h&z=17&ie=UTF8&iwloc=&output=embed`}
              allowFullScreen
              loading="lazy"
              className="grayscale-[0.3] group-hover:grayscale-0 transition-all duration-1000"
            ></iframe>
        </div>
      </div>
    </div>
  );
}
