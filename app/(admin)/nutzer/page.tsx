'use client';

import React, { useEffect, useState } from 'react';
import {
  Search, RefreshCw, CheckCircle2, Clock, ShieldOff,
  ChevronLeft, ChevronRight, X, User, Mail, Phone,
  Save, AlertCircle, Building2, Eye, EyeOff, Trash2, Plus,
} from 'lucide-react';
import { AdminUser, AdminCompany } from '@/types';
import { getAllUsers, getAllCompanies, unlockUser, lockUser, updateUser, deleteUser, previewContact, importUser } from '@/lib/api/admin';
import { useImpersonation } from '@/contexts/ImpersonationContext';

const ITEMS_PER_PAGE = 10;
const CACHE_KEY_USERS = 'admin_users';
const CACHE_KEY_COMPANIES = 'admin_companies';

// ── Shared helpers ────────────────────────────────────────────────────────────

const InfoRow: React.FC<{ label: string; value?: string | number | null }> = ({ label, value }) => (
  <div className="flex items-start justify-between py-2.5 border-b border-slate-50 last:border-0 gap-4">
    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 pt-0.5 w-32">{label}</span>
    <span className="text-xs font-medium text-slate-700 text-right break-all">{value ?? '—'}</span>
  </div>
);

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (status === 'Aktiv') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
        <CheckCircle2 size={10} /> Aktiv
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
      <Clock size={10} /> Ausstehend
    </span>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminNutzerPage() {
  const { startImpersonation } = useImpersonation();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'Aktiv' | 'Ausstehend'>('all');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Detail state
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [editHubspotId, setEditHubspotId] = useState('');
  const [editCompanyId, setEditCompanyId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

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

  const load = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const [u, c] = await Promise.all([getAllUsers(), getAllCompanies()]);
      setUsers(u);
      setCompanies(c);
      sessionStorage.setItem(CACHE_KEY_USERS, JSON.stringify(u));
      sessionStorage.setItem(CACHE_KEY_COMPANIES, JSON.stringify(c));
    } catch (e: unknown) {
      if (showLoading) setError(e instanceof Error ? e.message : 'Fehler beim Laden');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    let hasCached = false;
    try {
      const cachedUsers = sessionStorage.getItem(CACHE_KEY_USERS);
      const cachedCompanies = sessionStorage.getItem(CACHE_KEY_COMPANIES);
      if (cachedUsers && cachedCompanies) {
        const parsedUsers = JSON.parse(cachedUsers) as AdminUser[];
        const parsedCompanies = JSON.parse(cachedCompanies) as AdminCompany[];
        setUsers(parsedUsers);
        setCompanies(parsedCompanies);
        setLoading(false);
        hasCached = parsedUsers.length > 0;
      }
    } catch { /* ignore */ }
    load(!hasCached);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = users.filter((u) => {
    const name = `${u.fname} ${u.lname} ${u.email ?? ''}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchStatus =
      filterStatus === 'all' ||
      (filterStatus === 'Aktiv' && u.vermittlerportal_status === 'Aktiv') ||
      (filterStatus === 'Ausstehend' && u.vermittlerportal_status !== 'Aktiv');
    const matchCompany = filterCompany === 'all' || u.company_id === filterCompany;
    return matchSearch && matchStatus && matchCompany;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const openDetail = (user: AdminUser) => {
    setSelected(user);
    setEditHubspotId(user.hubspot_id != null ? String(user.hubspot_id) : '');
    setEditCompanyId(user.company_id ?? '');
    setSaveError(null);
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const newHubspotId = editHubspotId.trim() === '' ? null : Number(editHubspotId);
      const newCompanyId = editCompanyId || null; // empty string → null

      await updateUser(selected.id, {
        hubspot_id: newHubspotId,
        company_id: newCompanyId,
      });

      const company = companies.find((c) => c.id === newCompanyId);
      const updated = {
        ...selected,
        hubspot_id: newHubspotId ?? undefined,
        company_id: newCompanyId ?? undefined,
        company_name: company?.name,
      };
      const updatedList = users.map((u) => (u.id === selected.id ? updated : u));
      setUsers(updatedList);
      sessionStorage.setItem(CACHE_KEY_USERS, JSON.stringify(updatedList));
      setSelected(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlock = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await unlockUser(selected.id);
      const updated = { ...selected, vermittlerportal_status: 'Aktiv' as const };
      const updatedList = users.map((u) => (u.id === selected.id ? updated : u));
      setUsers(updatedList);
      sessionStorage.setItem(CACHE_KEY_USERS, JSON.stringify(updatedList));
      setSelected(updated);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLock = async () => {
    if (!selected) return;
    if (!confirm(`${selected.fname} ${selected.lname} wirklich sperren?`)) return;
    setActionLoading(true);
    try {
      await lockUser(selected.id);
      const updated = { ...selected, vermittlerportal_status: 'Freischaltung ausstehend' as const };
      const updatedList = users.map((u) => (u.id === selected.id ? updated : u));
      setUsers(updatedList);
      sessionStorage.setItem(CACHE_KEY_USERS, JSON.stringify(updatedList));
      setSelected(updated);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (user: AdminUser) => {
    if (!confirm(`${user.fname} ${user.lname} wirklich unwiderruflich löschen?\n\nDer Nutzer wird aus Supabase (User + Auth) gelöscht. HubSpot bleibt unberührt.`)) return;
    setActionLoading(true);
    try {
      await deleteUser(user.id);
      const updatedList = users.filter((u) => u.id !== user.id);
      setUsers(updatedList);
      sessionStorage.setItem(CACHE_KEY_USERS, JSON.stringify(updatedList));
      sessionStorage.removeItem(CACHE_KEY_COMPANIES); // user_count changed — force reload next time
      if (selected?.id === user.id) setSelected(null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Fehler beim Löschen');
    } finally {
      setActionLoading(false);
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
      await importUser({ hubspot_contact_id: id, password: importUserPassword, company_id: null });
      resetImportUserModal();
      load(false); // Liste im Hintergrund aktualisieren
    } catch (e: unknown) {
      setImportUserError(e instanceof Error ? e.message : 'Fehler beim Importieren');
    } finally {
      setImportUserLoading(false);
    }
  };

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-[3px] border-[#82a8a4]/20 border-t-[#82a8a4] rounded-full animate-spin" />
      </div>
    );
  }
  if (error && users.length === 0) {
    return <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-red-700 text-xs font-medium">{error}</div>;
  }

  // ── Detail View ───────────────────────────────────────────────────────────────
  if (selected) {
    const isActive = selected.vermittlerportal_status === 'Aktiv';
    const company = companies.find((c) => c.id === selected.company_id);

    return (
      <div className="space-y-4">
        {/* Back link */}
        <button
          onClick={() => setSelected(null)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-[#82a8a4] transition-colors"
        >
          ← Zurück zur Übersicht
        </button>

        {/* Hero card */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-[#82a8a4] to-[#a0bfbc]" />
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-slate-500 uppercase">
                {selected.fname[0]}{selected.lname[0]}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <h1 className="text-base font-bold text-slate-900 tracking-tight">
                  {selected.salutation ? `${selected.salutation} ` : ''}{selected.fname} {selected.lname}
                </h1>
                <StatusBadge status={selected.vermittlerportal_status} />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                {selected.email && <span className="flex items-center gap-1"><Mail size={10} />{selected.email}</span>}
                {selected.phone && <span className="flex items-center gap-1"><Phone size={10} />{selected.phone}</span>}
                {(company?.name ?? selected.company_name) && (
                  <span className="flex items-center gap-1"><Building2 size={10} />{company?.name ?? selected.company_name}</span>
                )}
                {selected.rolle_im_unternehmen && (
                  <span className="flex items-center gap-1"><User size={10} />{selected.rolle_im_unternehmen}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <button
                onClick={() => startImpersonation(selected)}
                title="Als dieser Nutzer anzeigen"
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <Eye size={14} />
                Portal anzeigen
              </button>
              {actionLoading ? (
                <div className="w-4 h-4 border-2 border-[#82a8a4]/30 border-t-[#82a8a4] rounded-full animate-spin" />
              ) : (
                <>
                  {isActive ? (
                    <button
                      onClick={handleLock}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-red-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50 border border-slate-200 hover:border-red-100"
                    >
                      <ShieldOff size={12} /> Nutzer sperren
                    </button>
                  ) : (
                    <button
                      onClick={handleUnlock}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 transition-colors"
                    >
                      <CheckCircle2 size={12} /> Nutzer freischalten
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(selected)}
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
          {/* Details — single merged card */}
          <div className="lg:col-span-2 h-full">
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden h-full">
              <div className="px-5 py-3 border-b border-slate-50 flex items-center gap-2">
                <User size={12} className="text-slate-400" />
                <h2 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Details</h2>
              </div>
              <div className="grid grid-cols-2 gap-x-6 px-5 py-3">
                {[
                  { label: 'Anrede', value: selected.salutation },
                  { label: 'Rolle', value: selected.rolle_im_unternehmen },
                  { label: 'E-Mail', value: selected.email },
                  { label: 'Telefon', value: selected.phone },
                  { label: 'Unternehmen', value: company?.name ?? selected.company_name },
                  { label: 'Partnertyp', value: company?.partnerType },
                  { label: 'Registriert', value: new Date(selected.created_at).toLocaleDateString('de-DE') },
                  { label: 'HubSpot-ID', value: selected.hubspot_id ?? null },
                ].map(({ label, value }) => (
                  <div key={label} className="py-2 border-b border-slate-50 last:border-0">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
                    <p className="text-xs font-medium text-slate-700">{value ?? '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div className="h-full">
            {/* Supabase-editable fields */}
            <div className="bg-white border-2 border-[#82a8a4]/25 rounded-2xl shadow-sm overflow-hidden h-full flex flex-col">
              <div className="px-5 py-3 bg-[#82a8a4]/[0.06] border-b border-[#82a8a4]/15 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#82a8a4]" />
                <h2 className="text-[10px] font-semibold text-[#4a7370] uppercase tracking-widest">Supabase-Konfiguration</h2>
              </div>
              <div className="p-4 space-y-3 flex-1">
                {/* HubSpot ID */}
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    HubSpot Kontakt-ID
                  </label>
                  <input
                    type="number"
                    value={editHubspotId}
                    onChange={(e) => setEditHubspotId(e.target.value)}
                    placeholder="z. B. 98765432"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/30 focus:border-[#82a8a4] transition-all font-mono"
                  />
                </div>

                {/* Company assignment */}
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Unternehmen
                  </label>
                  <select
                    value={editCompanyId}
                    onChange={(e) => setEditCompanyId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/30 focus:border-[#82a8a4] transition-all appearance-none bg-white"
                  >
                    <option value="">Kein Unternehmen</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name ?? c.id}</option>
                    ))}
                  </select>
                </div>

                {/* Supabase ID */}
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Supabase-ID
                  </label>
                  <code className="block px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-mono text-slate-600 break-all">
                    {selected.id}
                  </code>
                </div>

                {/* Feedback */}
                {saveError && (
                  <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg">
                    <AlertCircle size={12} className="text-red-500 mt-0.5 shrink-0" />
                    <p className="text-[10px] text-red-600 font-medium">{saveError}</p>
                  </div>
                )}
                {saveSuccess && (
                  <p className="text-[10px] text-emerald-600 font-semibold px-1">Gespeichert ✓</p>
                )}
              </div>
              <div className="px-4 pb-4">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-[#82a8a4] hover:bg-[#6d9490] text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-60"
                >
                  <Save size={13} />
                  {saving ? 'Speichert…' : 'In Supabase speichern'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Table View ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
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
                autoFocus
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/30 focus:border-[#82a8a4] transition-colors disabled:bg-slate-50 disabled:text-slate-400"
              />
              {!importUserPreview ? (
                <button onClick={handlePreviewContact} disabled={importUserPreviewLoading || !importUserHubspotId.trim()} className="px-3 py-2 text-[10px] font-bold text-white bg-[#82a8a4] hover:bg-[#6d9490] rounded-lg transition-colors disabled:opacity-50">
                  {importUserPreviewLoading ? '…' : 'Suchen'}
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
                    <Plus size={13} /> {importUserLoading ? '…' : 'Importieren'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Nutzer</h2>
          <p className="text-xs text-slate-400 mt-0.5">{users.length} registrierte Nutzer</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load(true)} className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            <RefreshCw size={13} /> Aktualisieren
          </button>
          <button onClick={() => setShowImportUserModal(true)} className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-white bg-[#82a8a4] hover:bg-[#6d9490] rounded-xl transition-colors">
            <Plus size={13} /> Importieren
          </button>
        </div>
      </div>

      {/* Filter Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="p-3 flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Name oder E-Mail suchen…"
              className="w-full pl-9 pr-8 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-[#82a8a4]/20 focus:border-[#82a8a4] transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={11} />
              </button>
            )}
          </div>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value as typeof filterStatus); setCurrentPage(1); }}
            className="px-2.5 py-1.5 text-[10px] font-bold text-slate-500 border border-slate-200 rounded-lg focus:outline-none bg-white focus:ring-2 focus:ring-[#82a8a4]/20 focus:border-[#82a8a4] transition-colors"
          >
            <option value="all">Alle Status</option>
            <option value="Aktiv">Aktiv</option>
            <option value="Ausstehend">Ausstehend</option>
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
                <th className="px-5 py-3.5 w-2/5">Nutzer</th>
                <th className="px-5 py-3.5 w-1/4 hidden md:table-cell">Unternehmen</th>
                <th className="px-5 py-3.5 w-1/6">Status</th>
                <th className="px-5 py-3.5 w-1/6 hidden lg:table-cell">Erstellt</th>
                <th className="px-5 py-3.5 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-xs font-medium text-slate-400 italic">
                    Keine Nutzer gefunden.
                  </td>
                </tr>
              ) : (
                paginated.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    onClick={() => openDetail(user)}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-[9px] font-bold text-slate-500 uppercase flex-shrink-0">
                          {user.fname[0]}{user.lname[0]}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 group-hover:text-[#82a8a4] transition-colors truncate">{user.fname} {user.lname}</p>
                          <p className="text-[10px] text-slate-400 font-medium truncate">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell">
                      <p className="text-xs font-medium text-slate-600 truncate">{user.company_name ?? '—'}</p>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={user.vermittlerportal_status} />
                    </td>
                    <td className="px-5 py-3 hidden lg:table-cell">
                      <p className="text-xs font-medium text-slate-500">{new Date(user.created_at).toLocaleDateString('de-DE')}</p>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); startImpersonation(user); }}
                          title="Als dieser Nutzer anzeigen"
                          className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-all"
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(user); }}
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
        {filtered.length > ITEMS_PER_PAGE && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="text-[10px] font-medium text-slate-500">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} von {filtered.length} Nutzern
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
