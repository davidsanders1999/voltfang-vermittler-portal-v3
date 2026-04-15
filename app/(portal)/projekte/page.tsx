'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Plus, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import type { Project, ProjectStatus } from '@/types';
import { ALL_PROJECT_STATUSES } from '@/lib/constants';
import StatusBadge from '@/components/ui/StatusBadge';
import { getHubSpotContext } from '@/lib/api/hubspot';
import { usePortalData } from '@/hooks/usePortalData';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

type SortColumn = 'name' | 'capacity' | 'location' | 'status' | 'created_at';
type SortDirection = 'asc' | 'desc';
type TabType = 'active' | 'won' | 'lost';

const ITEMS_PER_PAGE = 10;

export default function ProjektePage() {
  const router = useRouter();
  const { userProfile, userCompany } = usePortalData();

  const partnerType = userCompany?.partnerType ?? 'Vermittler';
  const isVermittler = partnerType === 'Vermittler';

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<ProjectStatus[]>([]);
  const [selectedCreators, setSelectedCreators] = useState<string[]>([]);
  const [openDropdown, setOpenDropdown] = useState<'status' | 'creator' | null>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const creatorDropdownRef = useRef<HTMLDivElement>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<SortColumn>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const getProjectsCacheKey = () =>
    userProfile?.company_id ? `hubspot_context_projects_${userProfile.company_id}` : null;

  useEffect(() => {
    if (!userProfile?.company_id) return;

    const cacheKey = getProjectsCacheKey();
    let hasCachedProjects = false;
    if (cacheKey) {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as Project[];
          setProjects(parsed);
          setLoading(false);
          hasCachedProjects = parsed.length > 0;
        } catch { /* ignore */ }
      }
    }

    const fetchProjects = async () => {
      if (!hasCachedProjects) setLoading(true);
      try {
        const context = await getHubSpotContext(userProfile?.company_id);
        const data = context?.projects || [];
        setProjects(data);
        if (cacheKey) sessionStorage.setItem(cacheKey, JSON.stringify(data));
      } catch (error) {
        console.error('Fehler beim Laden der Projekte:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.company_id]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node) &&
        creatorDropdownRef.current && !creatorDropdownRef.current.contains(e.target as Node)
      ) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleStatus = (status: ProjectStatus) => {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
    setCurrentPage(1);
  };

  const toggleCreator = (id: string) => {
    setSelectedCreators(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
    setCurrentPage(1);
  };

  const uniqueCreators = useMemo(() => {
    const seen = new Set<string>();
    return projects.filter(p => {
      if (seen.has(p.created_by_user_id)) return false;
      seen.add(p.created_by_user_id);
      return true;
    }).map(p => ({ id: p.created_by_user_id, ...p.creator }));
  }, [projects]);

  const counts = useMemo(() => ({
    active: projects.filter(p => p.dealstage !== 'Gewonnen' && p.dealstage !== 'Verloren').length,
    won: projects.filter(p => p.dealstage === 'Gewonnen').length,
    lost: projects.filter(p => p.dealstage === 'Verloren').length,
  }), [projects]);

  const projectsInTab = useMemo(() => {
    return projects.filter(p => {
      if (activeTab === 'active') return p.dealstage !== 'Gewonnen' && p.dealstage !== 'Verloren';
      if (activeTab === 'won') return p.dealstage === 'Gewonnen';
      if (activeTab === 'lost') return p.dealstage === 'Verloren';
      return true;
    });
  }, [projects, activeTab]);

  const filteredProjects = useMemo(() => {
    return projectsInTab.filter(project => {
      const matchesSearch =
        project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (project.company_name || project.unternehmen_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.location_city.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        selectedStatuses.length === 0 ||
        selectedStatuses.includes(project.dealstage);

      const matchesCreator =
        selectedCreators.length === 0 ||
        selectedCreators.includes(project.created_by_user_id);

      return matchesSearch && matchesStatus && matchesCreator;
    });
  }, [projectsInTab, searchTerm, selectedStatuses, selectedCreators]);

  const getCapacityValue = (project: Project): number => {
    if (project.offered_capacity) return project.offered_capacity;
    const estimatedValues: Record<string, number> = {
      '100 - 500 kWh': 300,
      '500 - 1000 kWh': 750,
      '1000 - 5000 kWh': 3000,
      '>5000 kWh': 7500,
    };
    return project.estimated_capacity ? estimatedValues[project.estimated_capacity] || 0 : 0;
  };

  const statusOrder: Record<ProjectStatus, number> = {
    'Eingangsprüfung': 1,
    'Technische Klärung': 2,
    'Angebotsklärung': 3,
    'Closing': 4,
    'Gewonnen': 5,
    'Verloren': 6,
  };

  const sortedProjects = useMemo(() => {
    const sorted = [...filteredProjects].sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case 'name':
          comparison = a.name.localeCompare(b.name, 'de');
          break;
        case 'capacity':
          comparison = getCapacityValue(a) - getCapacityValue(b);
          break;
        case 'location':
          comparison = a.location_city.localeCompare(b.location_city, 'de');
          break;
        case 'status':
          comparison = statusOrder[a.dealstage] - statusOrder[b.dealstage];
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredProjects, sortColumn, sortDirection]);

  const paginatedProjects = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedProjects.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [sortedProjects, currentPage]);

  const totalPages = Math.ceil(sortedProjects.length / ITEMS_PER_PAGE);

  const displayRange = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const end = Math.min(currentPage * ITEMS_PER_PAGE, sortedProjects.length);
    return { start, end, total: sortedProjects.length };
  }, [currentPage, sortedProjects.length]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSelectedStatuses([]);
    setSelectedCreators([]);
    setCurrentPage(1);
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'created_at' ? 'desc' : 'asc');
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return <span className="text-slate-300 ml-1"><ChevronUp size={10} /></span>;
    }
    return sortDirection === 'asc'
      ? <span className="text-[#82a8a4] ml-1"><ChevronUp size={10} /></span>
      : <span className="text-[#82a8a4] ml-1"><ChevronDown size={10} /></span>;
  };

  if (loading && projects.length === 0) {
    return <LoadingSpinner text="Projekte werden geladen…" />;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Projekte</h2>
          <p className="text-xs text-slate-400 mt-0.5">Verwalten Sie Ihre aktuellen Kundenanfragen und realisierten Projekte.</p>
        </div>
        <button
          onClick={() => router.push('/projekte/neu')}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#82a8a4] text-white rounded-xl font-semibold text-xs shadow-md shadow-[#82a8a4]/20 hover:bg-[#6d9490] transition-all active:scale-95"
        >
          <Plus size={14} /> Projekt anlegen
        </button>
      </div>

      {/* Filter-Box mit Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center border-b border-slate-100">
          {(['active', 'won', 'lost'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold transition-all relative ${
                activeTab === tab
                  ? 'text-[#82a8a4]'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <span>{tab === 'active' ? 'Aktiv' : tab === 'won' ? 'Gewonnen' : 'Verloren'}</span>
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                activeTab === tab ? 'bg-[#82a8a4]/10 text-[#82a8a4]' : 'bg-slate-100 text-slate-500'
              }`}>
                {counts[tab]}
              </span>
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#82a8a4]" />
              )}
            </button>
          ))}
        </div>

        {/* Suchleiste und Filter */}
        <div className="p-3 flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder={`${activeTab === 'active' ? 'Aktive Projekte' : activeTab === 'won' ? 'Gewonnene Deals' : 'Verlorene Projekte'} durchsuchen...`}
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/20 focus:border-[#82a8a4] transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Status-Dropdown */}
          {isVermittler && activeTab === 'active' && (
            <div className="relative shrink-0" ref={statusDropdownRef}>
              {selectedStatuses.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-[#82a8a4] text-white text-[8px] font-bold flex items-center justify-center z-10 pointer-events-none">
                  {selectedStatuses.length}
                </span>
              )}
              <button
                onClick={() => setOpenDropdown(o => o === 'status' ? null : 'status')}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold rounded-lg border transition-colors ${
                  selectedStatuses.length > 0
                    ? 'bg-[#82a8a4]/10 border-[#82a8a4]/30 text-[#5a7a76]'
                    : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'
                }`}
              >
                Status
                <ChevronDown size={12} className={`transition-transform ${openDropdown === 'status' ? 'rotate-180' : ''}`} />
              </button>

              {openDropdown === 'status' && (
                <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl shadow-lg border border-slate-100 py-1.5 z-50 min-w-[180px]">
                  {ALL_PROJECT_STATUSES.filter(s => s !== 'Gewonnen' && s !== 'Verloren').map(status => (
                    <button
                      key={status}
                      onClick={() => toggleStatus(status)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors text-left"
                    >
                      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        selectedStatuses.includes(status)
                          ? 'bg-[#82a8a4] border-[#82a8a4]'
                          : 'border-slate-200'
                      }`}>
                        {selectedStatuses.includes(status) && <Check size={9} className="text-white" strokeWidth={3} />}
                      </span>
                      <span className="text-xs text-slate-700">{status}</span>
                    </button>
                  ))}
                  <div className="border-t border-slate-100 mt-1 pt-1 px-3">
                    <button
                      onClick={() => { setSelectedStatuses([]); setCurrentPage(1); }}
                      className={`text-[10px] transition-colors py-1 ${selectedStatuses.length > 0 ? 'text-slate-400 hover:text-red-400' : 'invisible'}`}
                    >
                      Auswahl zurücksetzen
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Ersteller-Dropdown */}
          {uniqueCreators.length >= 2 && (
            <div className="relative shrink-0" ref={creatorDropdownRef}>
              {selectedCreators.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-[#82a8a4] text-white text-[8px] font-bold flex items-center justify-center z-10 pointer-events-none">
                  {selectedCreators.length}
                </span>
              )}
              <button
                onClick={() => setOpenDropdown(o => o === 'creator' ? null : 'creator')}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold rounded-lg border transition-colors ${
                  selectedCreators.length > 0
                    ? 'bg-[#82a8a4]/10 border-[#82a8a4]/30 text-[#5a7a76]'
                    : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'
                }`}
              >
                Ersteller
                <ChevronDown size={12} className={`transition-transform ${openDropdown === 'creator' ? 'rotate-180' : ''}`} />
              </button>

              {openDropdown === 'creator' && (
                <div className="absolute top-full right-0 mt-1.5 bg-white rounded-xl shadow-lg border border-slate-100 py-1.5 z-50 min-w-[180px]">
                  {uniqueCreators.map(creator => (
                    <button
                      key={creator.id}
                      onClick={() => toggleCreator(creator.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors text-left"
                    >
                      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        selectedCreators.includes(creator.id)
                          ? 'bg-[#82a8a4] border-[#82a8a4]'
                          : 'border-slate-200'
                      }`}>
                        {selectedCreators.includes(creator.id) && <Check size={9} className="text-white" strokeWidth={3} />}
                      </span>
                      <span className="w-5 h-5 rounded-full bg-[#82a8a4]/15 text-[#5a7a76] flex items-center justify-center text-[8px] font-bold shrink-0">
                        {creator.fname[0]}{creator.lname[0]}
                      </span>
                      <span className="text-xs text-slate-700">{creator.fname} {creator.lname}</span>
                    </button>
                  ))}
                  <div className="border-t border-slate-100 mt-1 pt-1 px-3">
                    <button
                      onClick={() => { setSelectedCreators([]); setCurrentPage(1); }}
                      className={`text-[10px] transition-colors py-1 ${selectedCreators.length > 0 ? 'text-slate-400 hover:text-red-400' : 'invisible'}`}
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

      {/* Haupt-Tabelle */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left table-fixed">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                <th className="px-5 py-3.5 w-[25%]">
                  <button onClick={() => handleSort('name')} className="flex items-center hover:text-slate-600 transition-colors font-semibold">
                    Projekt & Kunde <SortIcon column="name" />
                  </button>
                </th>
                <th className="px-5 py-3.5 w-[20%]">
                  <button onClick={() => handleSort('capacity')} className="flex items-center hover:text-slate-600 transition-colors font-semibold">
                    Kapazität <SortIcon column="capacity" />
                  </button>
                </th>
                <th className="px-5 py-3.5 w-[15%]">
                  <button onClick={() => handleSort('location')} className="flex items-center hover:text-slate-600 transition-colors font-semibold">
                    Standort <SortIcon column="location" />
                  </button>
                </th>
                <th className="px-5 py-3.5 w-[20%]">
                  <button onClick={() => handleSort('status')} className="flex items-center hover:text-slate-600 transition-colors font-semibold">
                    Status <SortIcon column="status" />
                  </button>
                </th>
                <th className="px-5 py-3.5 w-[20%]">
                  <button onClick={() => handleSort('created_at')} className="flex items-center hover:text-slate-600 transition-colors font-semibold">
                    Erstellt <SortIcon column="created_at" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sortedProjects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-400 text-xs font-medium italic">
                    Keine {activeTab === 'active' ? 'aktiven' : activeTab === 'won' ? 'gewonnenen' : 'verlorenen'} Projekte gefunden.
                  </td>
                </tr>
              ) : (
                paginatedProjects.map((project) => (
                  <tr
                    key={project.id}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    onClick={() => router.push(`/projekte/${project.id}`)}
                  >
                    <td className="px-5 py-3">
                      <p className="text-xs font-bold text-slate-800 group-hover:text-[#82a8a4] transition-colors truncate">{project.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium truncate">{project.company_name || project.unternehmen_name}</p>
                    </td>
                    <td className="px-5 py-3 text-xs font-bold text-slate-700">
                      {project.offered_capacity
                        ? `${project.offered_capacity.toLocaleString('de-DE')} kWh`
                        : project.estimated_capacity
                          ? <span className="text-slate-500 font-medium text-[11px]">{project.estimated_capacity} <span className="text-[9px] text-slate-400">(vorl.)</span></span>
                          : <span className="text-slate-300 font-normal italic text-[10px]">–</span>
                      }
                    </td>
                    <td className="px-5 py-3 text-xs font-medium text-slate-600 truncate">{project.location_city}</td>
                    <td className="px-5 py-3"><StatusBadge status={project.dealstage} /></td>
                    <td className="px-5 py-3">
                      <p className="text-xs font-medium text-slate-500">{formatDate(project.created_at)}</p>
                      <p className="text-[10px] text-slate-400 font-medium truncate">
                        {project.creator.fname} {project.creator.lname}
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {sortedProjects.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="text-[10px] font-medium text-slate-500">
              {displayRange.start}–{displayRange.end} von {displayRange.total} Projekten
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-500"
              >
                <ChevronLeft size={12} /> Zurück
              </button>
              <span className="text-[10px] font-bold text-slate-600 px-2">
                Seite {currentPage} von {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-500"
              >
                Weiter <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
