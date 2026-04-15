'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Building2, Search, RefreshCw, ChevronRight, ChevronLeft,
  X, ExternalLink, Globe, MapPin, Save, AlertCircle,
  Pencil, Check, Info, Eye, EyeOff, CheckCircle2, Clock,
  Mail, Phone, User, ShieldOff, Trash2, Plus, UserPlus,
  Upload, Download, Loader2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const ANGEBOTE_PDF_BUCKET = 'angebote-pdfs';
import { AdminCompany, AdminProject, AdminUser, Angebot } from '@/types';
import {
  getAllCompanies, updateCompany,
  getAllProjects, getCompanyDeals, getCompanyAngebote, updateProject,
  getAllUsers, unlockUser, lockUser, updateUser, deleteUser, importCompany, deleteCompany,
  previewContact, importUser, bulkImport, bulkPreview, BulkImportRow, BulkImportCompanyResult, BulkPreviewCompanyResult,
} from '@/lib/api/admin';
import { useImpersonation } from '@/contexts/ImpersonationContext';

const ITEMS_PER_PAGE = 10;
const CACHE_KEY = 'admin_companies';

// ── Shared helpers ───────────────────────────────────────────────────────────

const PartnerBadge: React.FC<{ type?: string }> = ({ type }) => (
  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
    type === 'Vertriebspartner' ? 'bg-[#82a8a4]/15 text-[#4a7370]' : 'bg-slate-100 text-slate-600'
  }`}>
    {type ?? 'Vermittler'}
  </span>
);

const Spinner: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => (
  <div className={`${size === 'sm' ? 'w-4 h-4 border-2' : 'w-7 h-7 border-[3px]'} border-[#82a8a4]/20 border-t-[#82a8a4] rounded-full animate-spin`} />
);

const CompactField: React.FC<{ label: string; value?: string | number | null }> = ({ label, value }) => (
  <div>
    <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
    <p className="text-[11px] font-medium text-slate-700 leading-snug">{value ?? '—'}</p>
  </div>
);

const InfoRow: React.FC<{ label: string; value?: string | number | null }> = ({ label, value }) => (
  <div className="flex items-start justify-between py-2.5 border-b border-slate-50 last:border-0 gap-4">
    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 pt-0.5 w-32">{label}</span>
    <span className="text-xs font-medium text-slate-700 text-right break-all">{value ?? '—'}</span>
  </div>
);

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (status === 'Aktiv') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
        <CheckCircle2 size={9} /> Aktiv
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
      <Clock size={9} /> Ausstehend
    </span>
  );
};

// ── Main component ───────────────────────────────────────────────────────────

export default function AdminUnternehmenPage() {
  const { startImpersonation } = useImpersonation();
  const supabase = createClient();

  // ── Company list state ──
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'Vermittler' | 'Vertriebspartner'>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // ── Company detail state ──
  const [selected, setSelected] = useState<AdminCompany | null>(null);
  const [editHubspotId, setEditHubspotId] = useState('');
  const [editPartnerType, setEditPartnerType] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'nutzer' | 'projekte' | 'angebote'>('nutzer');

  // ── Tab data ──
  const [companyUsers, setCompanyUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);

  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingHubspotValue, setEditingHubspotValue] = useState('');
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);

  const [angebote, setAngebote] = useState<Angebot[]>([]);
  const [angeboteLoading, setAngeboteLoading] = useState(false);
  const [angeboteLoaded, setAngeboteLoaded] = useState(false);
  const [angebotUploadingId, setAngebotUploadingId] = useState<string | null>(null);
  const [angebotUploadedIds, setAngebotUploadedIds] = useState<Set<string>>(new Set());
  const [angebotUploadError, setAngebotUploadError] = useState<string | null>(null);
  const angebotFileInputRef = useRef<HTMLInputElement>(null);
  const pendingAngebotRef = useRef<Angebot | null>(null);

  // ── Import choice modal ──
  const [showImportChoiceModal, setShowImportChoiceModal] = useState(false);

  // ── Import modal state ──
  const [showImportModal, setShowImportModal] = useState(false);
  const [importHubspotId, setImportHubspotId] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // ── Bulk import state ──
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [bulkStep, setBulkStep] = useState<'upload' | 'preview' | 'results'>('upload');
  const [bulkRows, setBulkRows] = useState<BulkImportRow[]>([]);
  const [bulkParseError, setBulkParseError] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkImportCompanyResult[] | null>(null);
  const [bulkPreviewData, setBulkPreviewData] = useState<BulkPreviewCompanyResult[] | null>(null);
  const [bulkPreviewLoading, setBulkPreviewLoading] = useState(false);
  const [bulkPreviewError, setBulkPreviewError] = useState<string | null>(null);
  const [templateDownloaded, setTemplateDownloaded] = useState(false);

  // ── Delete company state ──
  const [showDeleteCompanyConfirm, setShowDeleteCompanyConfirm] = useState(false);
  const [deletingCompany, setDeletingCompany] = useState(false);
  const [deleteCompanyError, setDeleteCompanyError] = useState<string | null>(null);

  // ── Add user to company state ──
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [addUserSearch, setAddUserSearch] = useState('');
  const [unassignedUsers, setUnassignedUsers] = useState<AdminUser[]>([]);
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [addUserSaving, setAddUserSaving] = useState<string | null>(null);

  // ── Import user modal state ──
  const [showImportUserModal, setShowImportUserModal] = useState(false);
  const [importUserHubspotId, setImportUserHubspotId] = useState('');
  const [importUserPreview, setImportUserPreview] = useState<{ email: string; fname: string | null; lname: string | null } | null>(null);
  const [importUserPreviewLoading, setImportUserPreviewLoading] = useState(false);
  const [importUserPreviewError, setImportUserPreviewError] = useState<string | null>(null);
  const [importUserPassword, setImportUserPassword] = useState('');
  const [importUserLoading, setImportUserLoading] = useState(false);
  const [importUserError, setImportUserError] = useState<string | null>(null);
  const [showImportPassword, setShowImportPassword] = useState(false);

  // ── User detail state ──
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [editUserHubspotId, setEditUserHubspotId] = useState('');
  const [editUserCompanyId, setEditUserCompanyId] = useState('');
  const [savingUser, setSavingUser] = useState(false);
  const [saveUserError, setSaveUserError] = useState<string | null>(null);
  const [saveUserSuccess, setSaveUserSuccess] = useState(false);
  const [actionUserLoading, setActionUserLoading] = useState(false);

  // ── Company list loading ──
  const load = async (showLoading = true, isRefresh = false) => {
    if (showLoading) setLoading(true);
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      sessionStorage.removeItem(CACHE_KEY);
      const data = await getAllCompanies();
      setCompanies(data);
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden');
    } finally {
      if (showLoading) setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  };

  const handleImport = async () => {
    const id = Number(importHubspotId.trim());
    if (!id) { setImportError('Bitte eine gültige HubSpot-ID eingeben.'); return; }
    setImportLoading(true);
    setImportError(null);
    try {
      await importCompany(id);
      setShowImportModal(false);
      setImportHubspotId('');
      load(true, true);
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : 'Fehler beim Importieren');
    } finally {
      setImportLoading(false);
    }
  };

  const handleDeleteCompany = async () => {
    if (!selected) return;
    setDeletingCompany(true);
    setDeleteCompanyError(null);
    try {
      await deleteCompany(selected.id);
      sessionStorage.removeItem(CACHE_KEY);
      setSelected(null);
      setShowDeleteCompanyConfirm(false);
      load(true, true);
    } catch (e: unknown) {
      setDeleteCompanyError(e instanceof Error ? e.message : 'Fehler beim Löschen');
    } finally {
      setDeletingCompany(false);
    }
  };

  const handleOpenAddUser = async () => {
    setShowAddUserModal(true);
    setAddUserSearch('');
    setAddUserLoading(true);
    try {
      const users = await getAllUsers();
      setUnassignedUsers(users.filter(u => !u.company_id));
    } finally {
      setAddUserLoading(false);
    }
  };

  const handleAssignUser = async (userId: string) => {
    if (!selected) return;
    setAddUserSaving(userId);
    try {
      await updateUser(userId, { company_id: selected.id });
      const assignedUser = unassignedUsers.find(u => u.id === userId);
      if (assignedUser) {
        setCompanyUsers(prev => [...prev, { ...assignedUser, company_id: selected.id }]);
        setUnassignedUsers(prev => prev.filter(u => u.id !== userId));
      }
    } catch { /* ignore */ }
    finally { setAddUserSaving(null); }
  };

  const downloadExcelTemplate = () => {
    const data = [
      {
        'Datensatz-ID': 49749753610,
        'Eindeutiger Unternehmensname (Bsp. Voltfang GmbH)': 'Voltfang GmbH',
        'Associated Contact': 'Max Mustermann (max@example.com);David Sanders (david@example.com)',
        'Associated Contact IDs': '210566477621;208066162491',
      },
      {
        'Datensatz-ID': 23456789,
        'Eindeutiger Unternehmensname (Bsp. Voltfang GmbH)': 'Beispiel AG',
        'Associated Contact': '',
        'Associated Contact IDs': '',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(data, {
      header: ['Datensatz-ID', 'Eindeutiger Unternehmensname (Bsp. Voltfang GmbH)', 'Associated Contact', 'Associated Contact IDs'],
    });
    ws['!cols'] = [{ wch: 16 }, { wch: 32 }, { wch: 50 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import');
    XLSX.writeFile(wb, 'voltfang_import_template.xlsx');
    setTemplateDownloaded(true);
    setTimeout(() => setTemplateDownloaded(false), 3000);
  };

const resetBulkModal = () => {
    setShowBulkImportModal(false);
    setBulkStep('upload');
    setBulkRows([]);
    setBulkParseError(null);
    setBulkLoading(false);
    setBulkResults(null);
    setBulkPreviewData(null);
    setBulkPreviewError(null);
    setBulkPreviewLoading(false);
    setTemplateDownloaded(false);
  };

  const handleBulkImport = async () => {
    setBulkLoading(true);
    try {
      const results = await bulkImport(bulkRows);
      setBulkResults(results);
      setBulkStep('results');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Fehler beim Import';
      setBulkParseError(message);
    } finally {
      setBulkLoading(false);
    }
  };

  const resetImportUserModal = () => {
    setShowImportUserModal(false);
    setImportUserHubspotId('');
    setImportUserPreview(null);
    setImportUserPreviewError(null);
    setImportUserPassword('');
    setImportUserError(null);
    setShowImportPassword(false);
  };

  const handlePreviewContact = async () => {
    const id = Number(importUserHubspotId.trim());
    if (!id) { setImportUserPreviewError('Bitte eine gültige HubSpot-ID eingeben.'); return; }
    setImportUserPreviewLoading(true);
    setImportUserPreviewError(null);
    setImportUserPreview(null);
    try {
      const result = await previewContact(id);
      if (!result.email) { setImportUserPreviewError('Dieser Kontakt hat keine E-Mail-Adresse in HubSpot.'); return; }
      setImportUserPreview(result as { email: string; fname: string | null; lname: string | null });
    } catch (e: unknown) {
      setImportUserPreviewError(e instanceof Error ? e.message : 'Kontakt nicht gefunden');
    } finally {
      setImportUserPreviewLoading(false);
    }
  };

  const handleImportUser = async () => {
    if (!importUserPreview) return;
    const id = Number(importUserHubspotId.trim());
    if (importUserPassword.length < 8) { setImportUserError('Passwort muss mindestens 8 Zeichen haben.'); return; }
    setImportUserLoading(true);
    setImportUserError(null);
    try {
      await importUser({ hubspot_contact_id: id, password: importUserPassword, company_id: selected?.id ?? null });
      resetImportUserModal();
      if (selected) {
        setUsersLoading(true);
        getAllUsers()
          .then(all => { setCompanyUsers(all.filter(u => u.company_id === selected.id)); setUsersLoaded(true); })
          .finally(() => setUsersLoading(false));
      }
    } catch (e: unknown) {
      setImportUserError(e instanceof Error ? e.message : 'Fehler beim Importieren');
    } finally {
      setImportUserLoading(false);
    }
  };

  useEffect(() => {
    const cached = sessionStorage.getItem(CACHE_KEY);
    let hasCached = false;
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as AdminCompany[];
        setCompanies(parsed);
        setLoading(false);
        hasCached = parsed.length > 0;
      } catch { /* ignore */ }
    }
    load(!hasCached);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load all tab data in parallel when opening a company ──
  const loadAllData = (company: AdminCompany) => {
    sessionStorage.removeItem('admin_users'); // always load fresh when entering company detail
    // Users
    setUsersLoading(true);
    getAllUsers()
      .then((all) => {
        setCompanyUsers(all.filter((u) => u.company_id === company.id));
        setUsersLoaded(true);
      })
      .catch(() => { /* ignore */ })
      .finally(() => setUsersLoading(false));

    // Projects / Deals
    setProjectsLoading(true);
    (company.hubspot_id
      ? getCompanyDeals(company.hubspot_id)
      : getAllProjects().then((all) => all.filter((p) => p.company_id === company.id))
    )
      .then((loaded) => {
        setProjects(loaded);
        setProjectsLoaded(true);
      })
      .catch(() => { /* ignore */ })
      .finally(() => setProjectsLoading(false));

    // Angebote (only if hubspot_id available)
    if (company.hubspot_id) {
      setAngeboteLoading(true);
      getCompanyAngebote(company.hubspot_id)
        .then(async (data) => {
          setAngebote(data);
          setAngeboteLoaded(true);
          // Check which angebote already have a PDF
          const found = new Set<string>();
          await Promise.all(
            data.map(async (a) => {
              const { error } = await supabase.storage
                .from(ANGEBOTE_PDF_BUCKET)
                .createSignedUrl(`${company.hubspot_id}/${a.hubspotId}.pdf`, 60);
              if (!error) found.add(a.hubspotId);
            }),
          );
          setAngebotUploadedIds(found);
        })
        .catch(() => { /* ignore */ })
        .finally(() => setAngeboteLoading(false));
    } else {
      setAngeboteLoaded(true);
    }
  };

  const openDetail = (company: AdminCompany) => {
    setSelected(company);
    setSelectedUser(null);
    setEditHubspotId(company.hubspot_id != null ? String(company.hubspot_id) : '');
    setEditPartnerType(company.partnerType ?? 'Vermittler');
    setSaveError(null);
    setSaveSuccess(false);
    setActiveTab('nutzer');
    setCompanyUsers([]);
    setProjects([]);
    setAngebote([]);
    setAngebotUploadedIds(new Set());
    setAngebotUploadError(null);
    setUsersLoaded(false);
    setProjectsLoaded(false);
    setAngeboteLoaded(false);
    setEditingProjectId(null);
    loadAllData(company);
  };

  // ── Angebot PDF upload ──
  const handleAngebotUploadClick = (angebot: Angebot) => {
    pendingAngebotRef.current = angebot;
    setAngebotUploadError(null);
    angebotFileInputRef.current?.click();
  };

  const handleAngebotFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const angebot = pendingAngebotRef.current;
    const partnerHubspotId = selected?.hubspot_id;
    if (!file || !angebot || !partnerHubspotId) return;
    e.target.value = '';

    setAngebotUploadingId(angebot.hubspotId);
    setAngebotUploadError(null);
    try {
      const path = `${partnerHubspotId}/${angebot.hubspotId}.pdf`;
      const { error } = await supabase.storage
        .from(ANGEBOTE_PDF_BUCKET)
        .upload(path, file, { upsert: true, contentType: 'application/pdf' });
      if (error) throw error;
      setAngebotUploadedIds((prev) => new Set(prev).add(angebot.hubspotId));
    } catch (err: unknown) {
      setAngebotUploadError(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
    } finally {
      setAngebotUploadingId(null);
      pendingAngebotRef.current = null;
    }
  };

  // ── Company save ──
  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const newHubspotId = editHubspotId.trim() === '' ? null : Number(editHubspotId);
      await updateCompany(selected.id, { hubspot_id: newHubspotId, partnerType: editPartnerType });
      const updated = { ...selected, hubspot_id: newHubspotId ?? undefined, partnerType: editPartnerType as AdminCompany['partnerType'] };
      setCompanies((prev) => prev.map((c) => (c.id === selected.id ? updated : c)));
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(companies.map((c) => (c.id === selected.id ? updated : c))));
      setSelected(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  // ── Project inline edit ──
  const startEditProject = (project: AdminProject) => {
    setEditingProjectId(project.id);
    setEditingHubspotValue(project.hubspot_id != null ? String(project.hubspot_id) : '');
  };
  const cancelEditProject = () => { setEditingProjectId(null); setEditingHubspotValue(''); };
  const saveProject = async (project: AdminProject) => {
    setSavingProjectId(project.id);
    try {
      const newVal = editingHubspotValue.trim() === '' ? null : Number(editingHubspotValue);
      await updateProject(project.id, { hubspot_id: newVal });
      setProjects((prev) => prev.map((p) => p.id === project.id ? { ...p, hubspot_id: newVal ?? undefined } : p));
      setEditingProjectId(null);
    } catch { /* ignore */ } finally {
      setSavingProjectId(null);
    }
  };

  // ── Open user detail ──
  const openUserDetail = (user: AdminUser) => {
    setSelectedUser(user);
    setEditUserHubspotId(user.hubspot_id != null ? String(user.hubspot_id) : '');
    setEditUserCompanyId(user.company_id ?? '');
    setSaveUserError(null);
    setSaveUserSuccess(false);
  };

  // ── User detail: save ──
  const handleUserSave = async () => {
    if (!selectedUser) return;
    setSavingUser(true);
    setSaveUserError(null);
    setSaveUserSuccess(false);
    try {
      const newHubspotId = editUserHubspotId.trim() === '' ? null : Number(editUserHubspotId);
      const newCompanyId = editUserCompanyId || null;
      await updateUser(selectedUser.id, { hubspot_id: newHubspotId, company_id: newCompanyId });
      const company = companies.find((c) => c.id === newCompanyId);
      const updated = { ...selectedUser, hubspot_id: newHubspotId ?? undefined, company_id: newCompanyId ?? undefined, company_name: company?.name };
      setSelectedUser(updated);
      setCompanyUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
      setSaveUserSuccess(true);
      setTimeout(() => setSaveUserSuccess(false), 3000);
    } catch (e: unknown) {
      setSaveUserError(e instanceof Error ? e.message : 'Fehler beim Speichern');
    } finally {
      setSavingUser(false);
    }
  };

  // ── User detail: unlock / lock ──
  const handleUserUnlock = async () => {
    if (!selectedUser) return;
    setActionUserLoading(true);
    try {
      await unlockUser(selectedUser.id);
      const updated = { ...selectedUser, vermittlerportal_status: 'Aktiv' as const };
      setSelectedUser(updated);
      setCompanyUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Fehler'); }
    finally { setActionUserLoading(false); }
  };
  const handleUserLock = async () => {
    if (!selectedUser) return;
    if (!confirm(`${selectedUser.fname} ${selectedUser.lname} wirklich sperren?`)) return;
    setActionUserLoading(true);
    try {
      await lockUser(selectedUser.id);
      const updated = { ...selectedUser, vermittlerportal_status: 'Freischaltung ausstehend' as const };
      setSelectedUser(updated);
      setCompanyUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Fehler'); }
    finally { setActionUserLoading(false); }
  };

  const handleUserDelete = async (user: AdminUser) => {
    if (!confirm(`${user.fname} ${user.lname} wirklich unwiderruflich löschen?\n\nDer Nutzer wird aus Supabase (User + Auth) gelöscht. HubSpot bleibt unberührt.`)) return;
    setActionUserLoading(true);
    try {
      await deleteUser(user.id);
      setCompanyUsers((prev) => prev.filter((u) => u.id !== user.id));
      if (selectedUser?.id === user.id) setSelectedUser(null);
      // Update company user_count in list + cache
      if (selected) {
        const updatedCompany = { ...selected, user_count: Math.max(0, (selected.user_count ?? 1) - 1) };
        setSelected(updatedCompany);
        setCompanies((prev) => {
          const updatedList = prev.map((c) => (c.id === selected.id ? updatedCompany : c));
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(updatedList));
          return updatedList;
        });
      }
      sessionStorage.removeItem('admin_users'); // invalidate cross-view cache
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Fehler beim Löschen');
    } finally {
      setActionUserLoading(false);
    }
  };

  // ── Filtered list ──
  const filtered = companies.filter((c) => {
    const matchSearch = !search || (c.name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || c.partnerType === filterType;
    return matchSearch && matchType;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // ── Loading / error states ──
  if (loading && companies.length === 0) {
    return <div className="flex items-center justify-center h-64"><Spinner /></div>;
  }
  if (error && companies.length === 0) {
    return <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-red-700 text-xs font-medium">{error}</div>;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ── User Detail View (inline) ─────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════════
  if (selectedUser && selected) {
    const isActive = selectedUser.vermittlerportal_status === 'Aktiv';
    const userCompany = companies.find((c) => c.id === selectedUser.company_id);
    return (
      <div className="space-y-5">
        <button
          onClick={() => setSelectedUser(null)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-[#82a8a4] transition-colors"
        >
          ← Zurück zu {selected.name}
        </button>

        {/* Hero */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-[#82a8a4] to-[#a0bfbc]" />
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-slate-500 uppercase">
                {selectedUser.fname?.[0]}{selectedUser.lname?.[0]}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <h1 className="text-base font-bold text-slate-900 tracking-tight">
                  {selectedUser.salutation ? `${selectedUser.salutation} ` : ''}{selectedUser.fname} {selectedUser.lname}
                </h1>
                <StatusBadge status={selectedUser.vermittlerportal_status} />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                {selectedUser.email && <span className="flex items-center gap-1"><Mail size={10} />{selectedUser.email}</span>}
                {selectedUser.phone && <span className="flex items-center gap-1"><Phone size={10} />{selectedUser.phone}</span>}
                {userCompany && <span className="flex items-center gap-1"><Building2 size={10} />{userCompany.name}</span>}
                {selectedUser.rolle_im_unternehmen && <span className="flex items-center gap-1"><User size={10} />{selectedUser.rolle_im_unternehmen}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <button
                onClick={() => startImpersonation(selectedUser)}
                title="Als dieser Nutzer anzeigen"
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <Eye size={14} /> Portal anzeigen
              </button>
              {actionUserLoading ? (
                <div className="w-4 h-4 border-2 border-[#82a8a4]/30 border-t-[#82a8a4] rounded-full animate-spin" />
              ) : (
                <>
                  {isActive ? (
                    <button
                      onClick={handleUserLock}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-red-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50 border border-slate-200 hover:border-red-100"
                    >
                      <ShieldOff size={12} /> Nutzer sperren
                    </button>
                  ) : (
                    <button
                      onClick={handleUserUnlock}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 transition-colors"
                    >
                      <CheckCircle2 size={12} /> Nutzer freischalten
                    </button>
                  )}
                  <button
                    onClick={() => handleUserDelete(selectedUser)}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-red-500 hover:text-red-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50 border border-red-200 hover:border-red-300"
                  >
                    <Trash2 size={12} /> Nutzer löschen
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {/* Left */}
          <div className="lg:col-span-2 h-full">
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden h-full">
              <div className="px-5 py-3 border-b border-slate-50 flex items-center gap-2">
                <User size={12} className="text-slate-400" />
                <h2 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Details</h2>
              </div>
              <div className="grid grid-cols-2 gap-x-6 px-5 py-3">
                {[
                  { label: 'Anrede', value: selectedUser.salutation },
                  { label: 'Rolle', value: selectedUser.rolle_im_unternehmen },
                  { label: 'E-Mail', value: selectedUser.email },
                  { label: 'Telefon', value: selectedUser.phone },
                  { label: 'Unternehmen', value: userCompany?.name ?? selectedUser.company_name },
                  { label: 'Partnertyp', value: userCompany?.partnerType },
                  { label: 'Registriert', value: new Date(selectedUser.created_at).toLocaleDateString('de-DE') },
                  { label: 'HubSpot-ID', value: selectedUser.hubspot_id ?? null },
                ].map(({ label, value }) => (
                  <div key={label} className="py-2 border-b border-slate-50 last:border-0">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
                    <p className="text-xs font-medium text-slate-700">{value ?? '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right */}
          <div className="h-full">
            {/* Supabase-Konfiguration */}
            <div className="bg-white border-2 border-[#82a8a4]/25 rounded-2xl shadow-sm overflow-hidden h-full flex flex-col">
              <div className="px-5 py-3 bg-[#82a8a4]/[0.06] border-b border-[#82a8a4]/15 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#82a8a4]" />
                <h2 className="text-[10px] font-semibold text-[#4a7370] uppercase tracking-widest">Supabase-Konfiguration</h2>
              </div>
              <div className="p-5 space-y-4 flex-1">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">HubSpot Kontakt-ID</label>
                  <input type="number" value={editUserHubspotId} onChange={(e) => setEditUserHubspotId(e.target.value)}
                    placeholder="z. B. 98765432"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/30 focus:border-[#82a8a4] transition-all font-mono" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Unternehmen</label>
                  <select value={editUserCompanyId} onChange={(e) => setEditUserCompanyId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/30 focus:border-[#82a8a4] transition-all appearance-none bg-white">
                    <option value="">Kein Unternehmen</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name ?? c.id}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Supabase-ID</label>
                  <code className="block px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-mono text-slate-600 break-all">{selectedUser.id}</code>
                </div>
                {saveUserError && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                    <AlertCircle size={12} className="text-red-500 mt-0.5 shrink-0" />
                    <p className="text-[10px] text-red-600 font-medium">{saveUserError}</p>
                  </div>
                )}
                {saveUserSuccess && <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl"><p className="text-[10px] text-emerald-600 font-semibold">Gespeichert ✓</p></div>}
              </div>
              <div className="px-5 pb-5">
                <button onClick={handleUserSave} disabled={savingUser}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#82a8a4] hover:bg-[#6d9490] text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-60">
                  <Save size={13} /> {savingUser ? 'Speichert…' : 'In Supabase speichern'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ── Company Detail View ───────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════════
  if (selected) {
    const tabCls = (tab: 'nutzer' | 'projekte' | 'angebote') =>
      `px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
        activeTab === tab
          ? 'border-[#82a8a4] text-[#82a8a4]'
          : 'border-transparent text-slate-400 hover:text-slate-600'
      }`;

    return (
      <div className="space-y-5">
        <button onClick={() => { setSelected(null); setShowDeleteCompanyConfirm(false); setDeleteCompanyError(null); resetImportUserModal(); }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-[#82a8a4] transition-colors">
          ← Zurück zur Übersicht
        </button>

        {/* Hero card */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-[#82a8a4] to-[#a0bfbc]" />
          <div className="px-6 pt-5 pb-4 flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#82a8a4]/10 border border-[#82a8a4]/20 flex items-center justify-center shrink-0">
              <Building2 size={22} className="text-[#82a8a4]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight truncate">{selected.name ?? '—'}</h1>
                <PartnerBadge type={selected.partnerType} />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 font-medium">
                {selected.city && <span className="flex items-center gap-1"><MapPin size={10} />{selected.city}{selected.bundesland ? `, ${selected.bundesland}` : ''}</span>}
                {selected.website && (
                  <a href={selected.website.startsWith('http') ? selected.website : `https://${selected.website}`}
                    target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-[#82a8a4] transition-colors">
                    <Globe size={10} />{selected.website}
                  </a>
                )}
                {selected.hubspot_id && (
                  <a href={`https://app.hubspot.com/contacts/crm/objects/2-57928699/${selected.hubspot_id}`}
                    target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-[#82a8a4] transition-colors">
                    <ExternalLink size={10} />HubSpot
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Info + Config */}
          <div className="border-t border-slate-50 px-6 py-4 grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-3">
              <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Adresse &amp; Unternehmen</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                <CompactField label="Straße" value={selected.street} />
                <CompactField label="PLZ / Stadt" value={selected.zip && selected.city ? `${selected.zip} ${selected.city}` : (selected.city ?? selected.zip)} />
                <CompactField label="Bundesland" value={selected.bundesland} />
                <CompactField label="Land" value={selected.country} />
                <CompactField label="Branche" value={selected.branche_partner} />
                <CompactField label="Invite-Code" value={selected.invite_code} />
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Statistiken &amp; IDs</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                <CompactField label="Nutzer" value={selected.user_count} />
                <CompactField label="Projekte" value={selected.project_count} />
                <CompactField label="Registriert" value={new Date(selected.created_at).toLocaleDateString('de-DE')} />
                <CompactField label="HubSpot-ID" value={selected.hubspot_id} />
              </div>
              <div>
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Supabase-ID</p>
                <code className="text-[10px] font-mono text-slate-500 break-all leading-snug">{selected.id}</code>
              </div>
            </div>
            <div className="bg-[#82a8a4]/[0.06] border border-[#82a8a4]/15 rounded-xl p-4 space-y-3">
              <p className="text-[9px] font-bold text-[#4a7370] uppercase tracking-widest">Supabase-Konfiguration</p>
              <div className="space-y-1">
                <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider block">HubSpot Partner-ID</label>
                <input type="number" value={editHubspotId} onChange={(e) => setEditHubspotId(e.target.value)}
                  placeholder="z. B. 12345678"
                  className="w-full px-2.5 py-1.5 text-xs border border-[#82a8a4]/25 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/30 focus:border-[#82a8a4] transition-all font-mono" />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider block">Partnertyp</label>
                <select value={editPartnerType} onChange={(e) => setEditPartnerType(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-[#82a8a4]/25 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/30 focus:border-[#82a8a4] transition-all appearance-none">
                  <option value="Vermittler">Vermittler</option>
                  <option value="Vertriebspartner">Vertriebspartner</option>
                </select>
              </div>
              {saveError && (
                <div className="flex items-start gap-1.5 p-2 bg-red-50 border border-red-100 rounded-lg">
                  <AlertCircle size={11} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-[10px] text-red-600 font-medium">{saveError}</p>
                </div>
              )}
              {saveSuccess && <p className="text-[10px] text-emerald-600 font-semibold">Gespeichert ✓</p>}
              <button onClick={handleSave} disabled={saving}
                className="w-full flex items-center justify-center gap-1.5 py-2 bg-[#82a8a4] hover:bg-[#6d9490] text-white text-[10px] font-bold rounded-lg transition-colors disabled:opacity-60">
                <Save size={11} /> {saving ? 'Speichert…' : 'Speichern'}
              </button>
              <div className="pt-1 border-t border-[#82a8a4]/10">
                {showDeleteCompanyConfirm ? (
                  <div className="bg-red-50 border border-red-100 rounded-lg p-3 space-y-2">
                    <p className="text-[10px] font-bold text-red-700">Wirklich löschen?</p>
                    <p className="text-[10px] text-red-500 leading-relaxed">Nur in Supabase. HubSpot bleibt unberührt. Nutzer werden ohne Unternehmen angezeigt.</p>
                    {deleteCompanyError && <p className="text-[10px] text-red-700 font-semibold">{deleteCompanyError}</p>}
                    <div className="flex gap-2">
                      <button onClick={() => { setShowDeleteCompanyConfirm(false); setDeleteCompanyError(null); }} className="flex-1 py-1.5 text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-lg">Abbrechen</button>
                      <button onClick={handleDeleteCompany} disabled={deletingCompany} className="flex-1 py-1.5 text-[10px] font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50">
                        {deletingCompany ? 'Wird gelöscht…' : 'Ja, löschen'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowDeleteCompanyConfirm(true)} className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold text-red-500 bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg transition-colors">
                    <Trash2 size={11} /> Unternehmen löschen
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Add User Modal */}
        {showAddUserModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowAddUserModal(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-800">Nutzer hinzufügen</h3>
                <button onClick={() => setShowAddUserModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={16} /></button>
              </div>
              <p className="text-xs text-slate-500 mb-3">Nur Nutzer ohne Unternehmen werden angezeigt.</p>
              <input
                value={addUserSearch}
                onChange={(e) => setAddUserSearch(e.target.value)}
                placeholder="Name oder E-Mail suchen…"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/30 focus:border-[#82a8a4] transition-colors mb-2"
              />
              {addUserLoading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : (
                <div className="overflow-y-auto flex-1 space-y-1 mt-1">
                  {unassignedUsers
                    .filter((u) => `${u.fname} ${u.lname} ${u.email ?? ''}`.toLowerCase().includes(addUserSearch.toLowerCase()))
                    .map((u) => (
                      <div key={u.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                        <div>
                          <p className="text-xs font-semibold text-slate-700">{u.fname} {u.lname}</p>
                          <p className="text-[10px] text-slate-400">{u.email ?? '—'}</p>
                        </div>
                        <button
                          onClick={() => handleAssignUser(u.id)}
                          disabled={addUserSaving === u.id}
                          className="px-3 py-1 text-[10px] font-bold text-white bg-[#82a8a4] hover:bg-[#6d9490] rounded-lg transition-colors disabled:opacity-50"
                        >
                          {addUserSaving === u.id ? '…' : 'Hinzufügen'}
                        </button>
                      </div>
                    ))}
                  {unassignedUsers.filter((u) => `${u.fname} ${u.lname} ${u.email ?? ''}`.toLowerCase().includes(addUserSearch.toLowerCase())).length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-6 italic">Keine Nutzer ohne Unternehmen gefunden.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Import User Modal */}
        {showImportUserModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={resetImportUserModal}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-800">Nutzer importieren</h3>
                <button onClick={resetImportUserModal} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={16} /></button>
              </div>
              <p className="text-xs text-slate-500 mb-4">HubSpot-Kontakt-ID eingeben. Der Nutzer wird direkt freigeschaltet.</p>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">HubSpot-Kontakt-ID</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="number"
                  value={importUserHubspotId}
                  onChange={(e) => setImportUserHubspotId(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !importUserPreview) handlePreviewContact(); }}
                  disabled={!!importUserPreview}
                  placeholder="z.B. 12345678"
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/30 focus:border-[#82a8a4] transition-colors disabled:bg-slate-50 disabled:text-slate-400"
                />
                {!importUserPreview ? (
                  <button onClick={handlePreviewContact} disabled={importUserPreviewLoading || !importUserHubspotId.trim()} className="px-3 py-2 text-[10px] font-bold text-white bg-[#82a8a4] hover:bg-[#6d9490] rounded-lg transition-colors disabled:opacity-50">
                    {importUserPreviewLoading ? <Spinner size="sm" /> : 'Suchen'}
                  </button>
                ) : (
                  <button onClick={() => { setImportUserPreview(null); setImportUserPassword(''); setImportUserError(null); }} className="px-3 py-2 text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                    Ändern
                  </button>
                )}
              </div>
              {importUserPreviewError && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                  <AlertCircle size={13} className="shrink-0" /> {importUserPreviewError}
                </div>
              )}
              {importUserPreview && (
                <>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 mb-3">
                    <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">E-Mail (aus HubSpot)</p>
                    <p className="text-xs font-semibold text-slate-700">{importUserPreview.email}</p>
                    {(importUserPreview.fname || importUserPreview.lname) && (
                      <p className="text-[10px] text-slate-500 mt-0.5">{importUserPreview.fname} {importUserPreview.lname}</p>
                    )}
                  </div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Passwort</label>
                  <div className="relative mb-3">
                    <input
                      type={showImportPassword ? 'text' : 'password'}
                      value={importUserPassword}
                      onChange={(e) => setImportUserPassword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleImportUser(); }}
                      placeholder="Mindestens 8 Zeichen"
                      autoFocus
                      className="w-full px-3 py-2 pr-9 border border-slate-200 rounded-lg text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/30 focus:border-[#82a8a4] transition-colors"
                    />
                    <button type="button" onClick={() => setShowImportPassword(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                      {showImportPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {importUserError && (
                    <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                      <AlertCircle size={13} className="shrink-0" /> {importUserError}
                    </div>
                  )}
                  <div className="flex gap-2 justify-end">
                    <button onClick={resetImportUserModal} className="px-4 py-2 text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">Abbrechen</button>
                    <button onClick={handleImportUser} disabled={importUserLoading || importUserPassword.length < 8} className="flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold text-white bg-[#82a8a4] hover:bg-[#6d9490] rounded-xl transition-colors disabled:opacity-50">
                      {importUserLoading ? <Spinner size="sm" /> : <Plus size={13} />} Importieren
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center border-b border-slate-100 px-2">
            <div className="flex flex-1">
            <button className={tabCls('nutzer')} onClick={() => setActiveTab('nutzer')}>
              Nutzer{usersLoaded ? ` (${companyUsers.length})` : ''}
              {usersLoading && <span className="ml-1.5 inline-block w-2.5 h-2.5 border border-slate-300 border-t-[#82a8a4] rounded-full animate-spin align-middle" />}
            </button>
            <button className={tabCls('projekte')} onClick={() => setActiveTab('projekte')}>
              Projekte{projectsLoaded ? ` (${projects.length})` : ''}
              {projectsLoading && <span className="ml-1.5 inline-block w-2.5 h-2.5 border border-slate-300 border-t-[#82a8a4] rounded-full animate-spin align-middle" />}
            </button>
            <button className={tabCls('angebote')} onClick={() => setActiveTab('angebote')}>
              Angebote{angeboteLoaded ? ` (${angebote.length})` : ''}
              {angeboteLoading && <span className="ml-1.5 inline-block w-2.5 h-2.5 border border-slate-300 border-t-[#82a8a4] rounded-full animate-spin align-middle" />}
            </button>
            </div>
            {activeTab === 'nutzer' && (
              <div className="flex items-center gap-3 mr-2 shrink-0">
                <button onClick={handleOpenAddUser} className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-[#82a8a4] transition-colors">
                  <UserPlus size={12} /> Hinzufügen
                </button>
                <button onClick={() => { setShowImportUserModal(true); }} className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-[#82a8a4] transition-colors">
                  <Plus size={12} /> Importieren
                </button>
              </div>
            )}
          </div>

          {/* ── Nutzer ── */}
          {activeTab === 'nutzer' && (
            <div className="p-5">
              {usersLoading ? (
                <div className="flex justify-center py-10"><Spinner /></div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-widest bg-slate-50/50">
                        <th className="px-4 py-3">Nutzer</th>
                        <th className="px-4 py-3 hidden md:table-cell">Status</th>
                        <th className="px-4 py-3 hidden lg:table-cell">Erstellt</th>
                        <th className="px-4 py-3 w-16" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {companyUsers.length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-10 text-center text-xs font-medium text-slate-400 italic">Keine Nutzer gefunden.</td></tr>
                      ) : (
                        companyUsers.map((user) => (
                          <tr key={user.id}
                            className="hover:bg-slate-50/60 transition-colors cursor-pointer group"
                            onClick={() => openUserDetail(user)}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-[9px] font-bold text-slate-500 uppercase shrink-0">
                                  {user.fname?.[0]}{user.lname?.[0]}
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-slate-800 group-hover:text-[#82a8a4] transition-colors truncate">{user.fname} {user.lname}</p>
                                  <p className="text-[10px] text-slate-400 font-medium truncate">{user.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              <StatusBadge status={user.vermittlerportal_status} />
                            </td>
                            <td className="px-4 py-3 hidden lg:table-cell">
                              <span className="text-xs text-slate-500">{new Date(user.created_at).toLocaleDateString('de-DE')}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); startImpersonation(user); }}
                                  title="Als dieser Nutzer anzeigen"
                                  className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-all"
                                >
                                  <Eye size={13} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleUserDelete(user); }}
                                  title="Nutzer löschen"
                                  className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                >
                                  <Trash2 size={13} />
                                </button>
                                <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Projekte ── */}
          {activeTab === 'projekte' && (
            <div className="p-5">
              {projectsLoading ? (
                <div className="flex justify-center py-10"><Spinner /></div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-widest bg-slate-50/50">
                        <th className="px-4 py-3">Projektname</th>
                        <th className="px-4 py-3">HubSpot Deal-ID</th>
                        <th className="px-4 py-3 hidden md:table-cell">Ort</th>
                        <th className="px-4 py-3 hidden lg:table-cell">Erstellt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {projects.length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-10 text-center text-xs font-medium text-slate-400 italic">Keine Projekte gefunden.</td></tr>
                      ) : (
                        projects.map((project) => (
                          <tr key={project.hubspot_id ?? project.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-4 py-3">
                              <p className="text-xs font-semibold text-slate-800 truncate max-w-[200px]">{project.name}</p>
                            </td>
                            <td className="px-4 py-3">
                              {editingProjectId === project.id ? (
                                <div className="flex items-center gap-1.5">
                                  <input type="number" value={editingHubspotValue} onChange={(e) => setEditingHubspotValue(e.target.value)}
                                    autoFocus className="w-32 px-2 py-1 text-xs border border-[#82a8a4]/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/30 font-mono" placeholder="Deal-ID" />
                                  {savingProjectId === project.id ? <Spinner size="sm" /> : (
                                    <>
                                      <button onClick={() => saveProject(project)} className="p-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors"><Check size={13} /></button>
                                      <button onClick={cancelEditProject} className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"><X size={13} /></button>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 group/cell">
                                  <span className="text-xs font-mono text-slate-600">{project.hubspot_id ?? '—'}</span>
                                  {project.id && (
                                    <button onClick={() => startEditProject(project)}
                                      className="opacity-0 group-hover/cell:opacity-100 p-1 rounded-lg hover:bg-[#82a8a4]/10 text-slate-400 hover:text-[#82a8a4] transition-all" title="Bearbeiten">
                                      <Pencil size={11} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              <span className="text-xs text-slate-500">{project.location_city ?? '—'}</span>
                            </td>
                            <td className="px-4 py-3 hidden lg:table-cell">
                              <span className="text-xs text-slate-500">{new Date(project.created_at).toLocaleDateString('de-DE')}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Angebote ── */}
          {activeTab === 'angebote' && (
            <div className="p-5">
              <input
                ref={angebotFileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleAngebotFileChange}
              />
              {!selected.hubspot_id ? (
                <div className="flex items-start gap-3 p-4 bg-[#82a8a4]/[0.06] border border-[#82a8a4]/15 rounded-xl">
                  <Info size={14} className="text-[#82a8a4] mt-0.5 shrink-0" />
                  <p className="text-xs text-[#4a7370] font-medium">Keine HubSpot-ID konfiguriert — Angebote können nicht geladen werden.</p>
                </div>
              ) : angeboteLoading ? (
                <div className="flex justify-center py-10"><Spinner /></div>
              ) : (
                <>
                  {angebotUploadError && (
                    <div className="mb-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 font-medium">
                      Upload fehlgeschlagen: {angebotUploadError}
                    </div>
                  )}
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-widest bg-slate-50/50">
                        <th className="px-4 py-3">Angebot-ID</th>
                        <th className="px-4 py-3">Produkt</th>
                        <th className="px-4 py-3 hidden md:table-cell">Status</th>
                        <th className="px-4 py-3 hidden lg:table-cell">Kapazität</th>
                        <th className="px-4 py-3">Verknüpfter Deal</th>
                        <th className="px-4 py-3 text-center w-16">PDF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {angebote.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-10 text-center text-xs font-medium text-slate-400 italic">Keine Angebote gefunden.</td></tr>
                      ) : (
                        angebote.map((angebot) => {
                          const matchingProject = projects.find((p) => p.hubspot_id != null && String(p.hubspot_id) === angebot.dealHubspotId);
                          const dealLabel = matchingProject?.name ?? `Deal ${angebot.dealHubspotId}`;
                          return (
                            <tr key={angebot.hubspotId} className="hover:bg-slate-50/60 transition-colors">
                              <td className="px-4 py-3"><span className="text-xs font-mono text-slate-600">{angebot.hubspotId}</span></td>
                              <td className="px-4 py-3"><span className="text-xs font-medium text-slate-700">{angebot.produkt ?? '—'}</span></td>
                              <td className="px-4 py-3 hidden md:table-cell">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  angebot.status === 'Gewonnen' ? 'bg-emerald-100 text-emerald-700' :
                                  angebot.status === 'Abgelaufen' ? 'bg-slate-100 text-slate-500' :
                                  'bg-[#82a8a4]/15 text-[#4a7370]'
                                }`}>{angebot.status}</span>
                              </td>
                              <td className="px-4 py-3 hidden lg:table-cell">
                                <span className="text-xs text-slate-500">{angebot.nettokapazitaetKwh != null ? `${angebot.nettokapazitaetKwh} kWh` : '—'}</span>
                              </td>
                              <td className="px-4 py-3"><span className="text-xs text-slate-500">{dealLabel}</span></td>
                              <td className="px-4 py-3 text-center">
                                {angebotUploadingId === angebot.hubspotId ? (
                                  <Loader2 size={14} className="text-[#82a8a4] animate-spin mx-auto" />
                                ) : angebotUploadedIds.has(angebot.hubspotId) ? (
                                  <button
                                    onClick={() => handleAngebotUploadClick(angebot)}
                                    title="PDF ersetzen"
                                    className="text-emerald-600 hover:text-[#82a8a4] transition-colors"
                                  >
                                    <Check size={14} strokeWidth={3} />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleAngebotUploadClick(angebot)}
                                    title="PDF hochladen"
                                    className="text-slate-400 hover:text-[#82a8a4] transition-colors"
                                  >
                                    <Upload size={14} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ── Company Table View ────────────────────────────────────────════════════
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-5">
      {/* Import Choice Modal */}
      {showImportChoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowImportChoiceModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800">Unternehmen importieren</h3>
              <button onClick={() => setShowImportChoiceModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <button onClick={() => { setShowImportChoiceModal(false); setImportError(null); setImportHubspotId(''); setShowImportModal(true); }}
                className="w-full flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:border-[#82a8a4] hover:bg-[#82a8a4]/5 transition-all text-left">
                <div className="w-8 h-8 bg-[#82a8a4]/10 rounded-lg flex items-center justify-center shrink-0">
                  <Plus size={16} className="text-[#4a7370]" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">Einzelimport</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Ein Unternehmen per HubSpot-ID importieren</p>
                </div>
              </button>
              <button onClick={() => { setShowImportChoiceModal(false); setShowBulkImportModal(true); }}
                className="w-full flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:border-[#82a8a4] hover:bg-[#82a8a4]/5 transition-all text-left">
                <div className="w-8 h-8 bg-[#82a8a4]/10 rounded-lg flex items-center justify-center shrink-0">
                  <Upload size={16} className="text-[#4a7370]" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">Massenimport</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Mehrere Unternehmen und Nutzer via CSV importieren</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { if (!bulkLoading) resetBulkModal(); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-slate-800">Massenimport</h3>
              <button onClick={() => { if (!bulkLoading) resetBulkModal(); }} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={16} /></button>
            </div>
            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-5 mt-3">
              {(['upload', 'preview', 'results'] as const).map((step, i) => (
                <React.Fragment key={step}>
                  <div className={`flex items-center gap-1.5 text-[10px] font-bold ${bulkStep === step ? 'text-[#4a7370]' : bulkStep === 'results' || (bulkStep === 'preview' && i === 0) ? 'text-slate-400' : 'text-slate-300'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${bulkStep === step ? 'bg-[#82a8a4] text-white' : bulkStep === 'results' || (bulkStep === 'preview' && i === 0) ? 'bg-slate-200 text-slate-500' : 'bg-slate-100 text-slate-300'}`}>{i + 1}</div>
                    {step === 'upload' ? 'CSV hochladen' : step === 'preview' ? 'Vorschau' : 'Ergebnis'}
                  </div>
                  {i < 2 && <div className="flex-1 h-px bg-slate-100" />}
                </React.Fragment>
              ))}
            </div>

            {/* Step 1: Upload */}
            {bulkStep === 'upload' && (
              <div>
                <p className="text-xs text-slate-500 mb-4">Lade eine CSV-Datei mit Unternehmen- und Nutzer-IDs hoch. Pro Zeile ein Eintrag.</p>
                <button onClick={downloadExcelTemplate} className={`flex items-center gap-2 px-3 py-2 text-[10px] font-bold rounded-xl transition-all mb-4 ${templateDownloaded ? 'text-emerald-700 border border-emerald-200 bg-emerald-50' : 'text-[#4a7370] border border-[#82a8a4]/40 hover:bg-[#82a8a4]/5'}`}>
                  {templateDownloaded ? <Check size={13} /> : <Download size={13} />}
                  {templateDownloaded ? 'Template heruntergeladen' : 'Excel-Template herunterladen'}
                </button>
                <label className="block w-full cursor-pointer">
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-[#82a8a4] hover:bg-[#82a8a4]/5 transition-all">
                    <Upload size={24} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-xs font-semibold text-slate-500">Excel-Datei auswählen</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">oder hier ablegen (.xlsx)</p>
                  </div>
                  <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => {
                    setBulkParseError(null);
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async (ev) => {
                      try {
                        const wb = XLSX.read(ev.target?.result, { type: 'array' });
                        const ws = wb.Sheets[wb.SheetNames[0]];
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
                        if (rawRows.length === 0) throw new Error('Excel enthält keine Datenzeilen');
                        const rows: BulkImportRow[] = rawRows
                          .map((r) => {
                            // HubSpot exports use "Datensatz-ID" (with hyphen); fall back to "Datensatz ID" (with space)
                            const companyId = Number(r['Datensatz-ID'] ?? r['Datensatz ID'] ?? '');
                            const contactIdsRaw = r['Associated Contact IDs'] ?? r['Associated Contact ID'] ?? '';
                            return {
                              company_hubspot_id: companyId,
                              contact_ids: contactIdsRaw
                                ? String(contactIdsRaw).split(';').map((s: string) => s.trim()).filter(Boolean).map(Number).filter(Boolean)
                                : [],
                            };
                          })
                          .filter((r) => r.company_hubspot_id);
                        if (rows.length === 0) throw new Error('Keine gültigen Zeilen gefunden');
                        setBulkRows(rows);
                        setBulkPreviewData(null);
                        setBulkPreviewError(null);
                        setBulkStep('preview');
                        setBulkPreviewLoading(true);
                        try {
                          const preview = await bulkPreview(rows);
                          setBulkPreviewData(preview);
                        } catch (err: unknown) {
                          const message = err instanceof Error ? err.message : 'HubSpot-Prüfung fehlgeschlagen';
                          setBulkPreviewError(message);
                        } finally {
                          setBulkPreviewLoading(false);
                        }
                      } catch (err: unknown) {
                        const message = err instanceof Error ? err.message : 'Fehler beim Lesen der Datei';
                        setBulkParseError(message);
                      }
                    };
                    reader.readAsArrayBuffer(file);
                    e.target.value = '';
                  }} />
                </label>
                {bulkParseError && (
                  <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-3">
                    <AlertCircle size={13} className="shrink-0" /> {bulkParseError}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Preview */}
            {bulkStep === 'preview' && (
              <div>
                {bulkPreviewLoading ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <Spinner />
                    <p className="text-xs text-slate-400">HubSpot wird geprüft…</p>
                  </div>
                ) : bulkPreviewError ? (
                  <div>
                    <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-3 mb-4">
                      <AlertCircle size={13} className="shrink-0" /> {bulkPreviewError}
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setBulkStep('upload'); setBulkPreviewError(null); }} className="px-4 py-2 text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                        Zurück
                      </button>
                    </div>
                  </div>
                ) : bulkPreviewData ? (
                  <div>
                    {(() => {
                      const totalCompanies = bulkPreviewData.length;
                      const totalUsers = bulkPreviewData.reduce((a, c) => a + c.users.length, 0);
                      const missingCompanies = bulkPreviewData.filter(c => !c.company_found).length;
                      const missingContacts = bulkPreviewData.reduce((a, c) => a + c.users.filter(u => !u.contact_found).length, 0);
                      return (
                        <div className="flex items-center gap-3 mb-3">
                          <p className="text-xs text-slate-500 flex-1">
                            <span className="font-bold text-slate-700">{totalCompanies}</span> Unternehmen, <span className="font-bold text-slate-700">{totalUsers}</span> Nutzer
                          </p>
                          {(missingCompanies > 0 || missingContacts > 0) && (
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg flex items-center gap-1">
                              <AlertCircle size={11} /> {missingCompanies + missingContacts} nicht gefunden
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    <div className="overflow-auto max-h-72 space-y-2 pr-0.5">
                      {bulkPreviewData.map((company, i) => (
                        <div key={i} className={`rounded-xl border overflow-hidden ${company.company_found ? 'border-slate-100' : 'border-red-100'}`}>
                          {/* Company row */}
                          <div className={`flex items-center gap-3 px-3 py-2 ${company.company_found ? 'bg-slate-50' : 'bg-red-50'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${company.company_found ? 'bg-emerald-400' : 'bg-red-400'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-bold text-slate-700 truncate">
                                {company.company_found ? (company.company_name ?? `ID ${company.company_hubspot_id}`) : `ID ${company.company_hubspot_id}`}
                              </p>
                              <p className="text-[9px] text-slate-400 font-mono">{company.company_hubspot_id}</p>
                            </div>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${company.company_found ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                              {company.company_found ? 'Gefunden' : 'Nicht gefunden'}
                            </span>
                          </div>
                          {/* Contact rows */}
                          {company.users.length > 0 && (
                            <div className="divide-y divide-slate-50">
                              {company.users.map((user, j) => (
                                <div key={j} className={`flex items-center gap-3 px-3 py-1.5 ${user.contact_found ? 'bg-white' : 'bg-red-50/50'}`}>
                                  <div className="w-1.5 shrink-0" />
                                  <div className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                    <User size={9} className="text-slate-400" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] text-slate-600 truncate">
                                      {user.contact_found ? (user.email ?? '—') : `Kontakt-ID ${user.contact_id}`}
                                    </p>
                                    <p className="text-[9px] text-slate-400 font-mono">{user.contact_id}</p>
                                  </div>
                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${user.contact_found ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                                    {user.contact_found ? 'Gefunden' : 'Nicht gefunden'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 justify-end mt-4">
                      <button onClick={() => { setBulkStep('upload'); setBulkPreviewData(null); }} className="px-4 py-2 text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                        Zurück
                      </button>
                      <button onClick={handleBulkImport} disabled={bulkLoading} className="flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold text-white bg-[#82a8a4] hover:bg-[#6d9490] rounded-xl transition-colors disabled:opacity-50">
                        {bulkLoading ? <Spinner size="sm" /> : <Upload size={13} />}
                        Importieren starten
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Step 3: Results */}
            {bulkStep === 'results' && bulkResults && (
              <div>
                {(() => {
                  const imported = bulkResults.filter(r => r.company_status === 'imported').length;
                  const usersImported = bulkResults.reduce((acc, r) => acc + r.users.filter(u => u.status === 'imported').length, 0);
                  return (
                    <p className="text-xs text-slate-500 mb-3">
                      <span className="font-bold text-emerald-600">{imported}</span> Unternehmen importiert, <span className="font-bold text-emerald-600">{usersImported}</span> Nutzer angelegt.
                    </p>
                  );
                })()}
                <div className="overflow-auto max-h-72 space-y-3 pr-1">
                  {bulkResults.map((company, i) => (
                    <div key={i} className="border border-slate-100 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-slate-50">
                        <div>
                          <p className="text-[10px] font-bold text-slate-700">{company.company_name ?? `ID ${company.company_hubspot_id}`}</p>
                          <p className="text-[9px] text-slate-400 font-mono">{company.company_hubspot_id}</p>
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          company.company_status === 'imported' ? 'bg-emerald-100 text-emerald-700' :
                          company.company_status === 'already_exists' ? 'bg-slate-100 text-slate-500' :
                          'bg-red-100 text-red-600'
                        }`}>
                          {company.company_status === 'imported' ? 'Importiert' : company.company_status === 'already_exists' ? 'Bereits vorhanden' : 'Fehler'}
                        </span>
                      </div>
                      {company.company_error && (
                        <div className="px-3 py-1.5 text-[10px] text-red-600">{company.company_error}</div>
                      )}
                      {company.users.length > 0 && (
                        <div className="divide-y divide-slate-50">
                          {company.users.map((user, j) => (
                            <div key={j} className="flex items-center justify-between px-3 py-1.5">
                              <div>
                                <p className="text-[10px] text-slate-600">{user.email ?? `Kontakt ${user.contact_id}`}</p>
                                {user.error && <p className="text-[9px] text-red-500">{user.error}</p>}
                              </div>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                user.status === 'imported' ? 'bg-emerald-100 text-emerald-700' :
                                user.status === 'already_exists' ? 'bg-slate-100 text-slate-500' :
                                'bg-red-100 text-red-600'
                              }`}>
                                {user.status === 'imported' ? 'Angelegt' : user.status === 'already_exists' ? 'Bereits vorhanden' : 'Fehler'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end mt-4">
                  <button onClick={() => { resetBulkModal(); load(true, true); }} className="px-4 py-2 text-[10px] font-bold text-white bg-[#82a8a4] hover:bg-[#6d9490] rounded-xl transition-colors">
                    Schließen und aktualisieren
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setShowImportModal(false); setImportHubspotId(''); setImportError(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800">Unternehmen importieren</h3>
              <button onClick={() => { setShowImportModal(false); setImportHubspotId(''); setImportError(null); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">Gib die HubSpot-ID des Partner-Objekts ein. Das Unternehmen wird in Supabase angelegt und mit HubSpot verknüpft.</p>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">HubSpot-ID</label>
            <input
              type="number"
              value={importHubspotId}
              onChange={(e) => setImportHubspotId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleImport(); }}
              placeholder="z.B. 12345678"
              autoFocus
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/30 focus:border-[#82a8a4] transition-colors mb-3"
            />
            {importError && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                <AlertCircle size={13} className="shrink-0" /> {importError}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowImportModal(false); setImportHubspotId(''); setImportError(null); }} className="px-4 py-2 text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                Abbrechen
              </button>
              <button onClick={handleImport} disabled={importLoading || !importHubspotId.trim()} className="flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold text-white bg-[#82a8a4] hover:bg-[#6d9490] rounded-xl transition-colors disabled:opacity-50">
                {importLoading ? <Spinner size="sm" /> : <Plus size={13} />}
                Importieren
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Unternehmen</h2>
          <p className="text-xs text-slate-400 mt-0.5">{companies.length} Partner-Firmen</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load(true, true)} disabled={refreshing} className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50">
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Aktualisieren
          </button>
          <button onClick={() => setShowImportChoiceModal(true)} className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-white bg-[#82a8a4] hover:bg-[#6d9490] rounded-xl transition-colors">
            <Plus size={13} /> Importieren
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="p-3 flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Unternehmen suchen…"
              className="w-full pl-9 pr-8 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/20 focus:border-[#82a8a4] transition-colors" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={11} /></button>
            )}
          </div>
          <select value={filterType} onChange={(e) => { setFilterType(e.target.value as typeof filterType); setCurrentPage(1); }}
            className="px-2.5 py-1.5 text-[10px] font-bold text-slate-500 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/20 focus:border-[#82a8a4] transition-colors bg-white">
            <option value="all">Alle Typen</option>
            <option value="Vermittler">Vermittler</option>
            <option value="Vertriebspartner">Vertriebspartner</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left table-fixed">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                <th className="px-5 py-3.5 w-2/5">Unternehmen</th>
                <th className="px-5 py-3.5 w-1/5 hidden md:table-cell">Typ</th>
                <th className="px-5 py-3.5 w-1/5 hidden lg:table-cell">Nutzer</th>
                <th className="px-5 py-3.5 w-1/5 hidden lg:table-cell">Projekte</th>
                <th className="px-5 py-3.5 w-1/5 hidden xl:table-cell">Erstellt</th>
                <th className="px-5 py-3.5 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginated.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-xs font-medium text-slate-400 italic">Keine Unternehmen gefunden.</td></tr>
              ) : (
                paginated.map((company) => (
                  <tr key={company.id} className="hover:bg-slate-50/80 transition-colors cursor-pointer group" onClick={() => openDetail(company)}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#82a8a4]/10 flex items-center justify-center flex-shrink-0">
                          <Building2 size={13} className="text-[#82a8a4]" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 group-hover:text-[#82a8a4] transition-colors truncate">{company.name ?? '—'}</p>
                          {company.city && <p className="text-[10px] text-slate-400 font-medium truncate">{company.city}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell"><PartnerBadge type={company.partnerType} /></td>
                    <td className="px-5 py-3 hidden lg:table-cell"><p className="text-xs font-bold text-slate-700">{company.user_count}</p></td>
                    <td className="px-5 py-3 hidden lg:table-cell"><p className="text-xs font-bold text-slate-700">{company.project_count}</p></td>
                    <td className="px-5 py-3 hidden xl:table-cell"><p className="text-xs font-medium text-slate-500">{new Date(company.created_at).toLocaleDateString('de-DE')}</p></td>
                    <td className="px-5 py-3 text-right">
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors ml-auto" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > ITEMS_PER_PAGE && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="text-[10px] font-medium text-slate-500">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} von {filtered.length} Unternehmen
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
