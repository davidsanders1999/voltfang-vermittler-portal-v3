'use client';

import React, { useEffect, useState } from 'react';
import { FolderKanban, Search, RefreshCw, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { AdminProject, AdminCompany, ProjectStatus } from '@/types';
import { getAllProjects, getAllCompanies, updateProject } from '@/lib/api/admin';

const ITEMS_PER_PAGE = 10;

const PROJECT_STAGES: ProjectStatus[] = [
  'Eingangsprüfung',
  'Technische Klärung',
  'Angebotsklärung',
  'Closing',
  'Gewonnen',
  'Verloren',
];

const stageStyle = (stage: string) => {
  switch (stage) {
    case 'Gewonnen':        return 'bg-emerald-100 text-emerald-700';
    case 'Verloren':        return 'bg-red-100 text-red-600';
    case 'Closing':         return 'bg-[#82a8a4]/15 text-[#4a7370]';
    case 'Angebotsklärung': return 'bg-slate-100 text-slate-600';
    default:                return 'bg-slate-100 text-slate-600';
  }
};

export default function AdminProjektePage() {
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState<string>('all');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, c] = await Promise.all([getAllProjects(), getAllCompanies()]);
      setProjects(p);
      setCompanies(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = projects.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchStage = filterStage === 'all' || p.dealstage === filterStage;
    const matchCompany = filterCompany === 'all' || p.company_id === filterCompany;
    return matchSearch && matchStage && matchCompany;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handleStageChange = async (project: AdminProject, newStage: string) => {
    setUpdatingId(project.id);
    try {
      await updateProject(project.id, { dealstage: newStage });
      setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, dealstage: newStage } : p)));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setUpdatingId(null);
    }
  };

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Projekte</h2>
          <p className="text-xs text-slate-400 mt-0.5">{projects.length} Projekte über alle Unternehmen</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
          <RefreshCw size={13} /> Aktualisieren
        </button>
      </div>

      {/* Filter Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="p-3 flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Projektname suchen…"
              className="w-full pl-9 pr-8 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/20 focus:border-[#82a8a4] transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={11} />
              </button>
            )}
          </div>
          <select
            value={filterStage}
            onChange={(e) => { setFilterStage(e.target.value); setCurrentPage(1); }}
            className="px-2.5 py-1.5 text-[10px] font-bold text-slate-500 border border-slate-200 rounded-lg focus:outline-none bg-white focus:ring-2 focus:ring-[#82a8a4]/20 focus:border-[#82a8a4] transition-colors"
          >
            <option value="all">Alle Phasen</option>
            {PROJECT_STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select
            value={filterCompany}
            onChange={(e) => { setFilterCompany(e.target.value); setCurrentPage(1); }}
            className="px-2.5 py-1.5 text-[10px] font-bold text-slate-500 border border-slate-200 rounded-lg focus:outline-none bg-white focus:ring-2 focus:ring-[#82a8a4]/20 focus:border-[#82a8a4] transition-colors max-w-[180px]"
          >
            <option value="all">Alle Unternehmen</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name ?? c.id}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left table-fixed">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                <th className="px-5 py-3.5 w-1/4">Projekt</th>
                <th className="px-5 py-3.5 w-1/5 hidden md:table-cell">Unternehmen</th>
                <th className="px-5 py-3.5 w-1/5">Phase</th>
                <th className="px-5 py-3.5 w-1/6 hidden lg:table-cell">Erstellt von</th>
                <th className="px-5 py-3.5 w-1/6 hidden xl:table-cell">Datum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-xs font-medium text-slate-400 italic">
                    Keine Projekte gefunden.
                  </td>
                </tr>
              ) : (
                paginated.map((project) => {
                  const isUpdating = updatingId === project.id;
                  return (
                    <tr key={project.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#82a8a4]/10 flex items-center justify-center flex-shrink-0">
                            <FolderKanban size={13} className="text-[#82a8a4]" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800 group-hover:text-[#82a8a4] transition-colors truncate">{project.name}</p>
                            {project.location_city && (
                              <p className="text-[10px] text-slate-400 font-medium truncate">{project.location_city}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell">
                        <p className="text-xs font-medium text-slate-600 truncate">{project.company_name ?? '—'}</p>
                      </td>
                      <td className="px-5 py-3">
                        {isUpdating ? (
                          <div className="w-4 h-4 border-2 border-[#82a8a4]/30 border-t-[#82a8a4] rounded-full animate-spin" />
                        ) : (
                          <div className="relative inline-block">
                            <select
                              value={project.dealstage}
                              onChange={(e) => handleStageChange(project, e.target.value)}
                              className={`text-[10px] font-bold pl-2 pr-5 py-0.5 rounded-full border-0 focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/20 cursor-pointer appearance-none ${stageStyle(project.dealstage)}`}
                            >
                              {PROJECT_STAGES.map((s) => <option key={s}>{s}</option>)}
                            </select>
                            <ChevronDown size={9} className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 hidden lg:table-cell">
                        <p className="text-xs font-medium text-slate-500 truncate">{project.creator_name ?? '—'}</p>
                      </td>
                      <td className="px-5 py-3 hidden xl:table-cell">
                        <p className="text-xs font-medium text-slate-500">{new Date(project.created_at).toLocaleDateString('de-DE')}</p>
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
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} von {filtered.length} Projekten
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
