'use client';

import { useCallback, useEffect, useState, useRef, FormEvent, DragEvent } from 'react';
import { Activity, AlertCircle, ArrowDownToLine, ArrowRight, ArrowUpRight, BarChart3, Bell, Building2, Calendar, Check, CheckCircle2, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Code, Copy, ExternalLink, Eye, EyeOff, FileSpreadsheet, FileText, Globe2, GripVertical, KeyRound, LayoutDashboard, ListFilter, LoaderCircle, LogOut, Mail, Menu, MoreHorizontal, Pencil, Phone, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Target, Trash2, UploadCloud, UserCheck, UsersRound, X, Zap } from 'lucide-react';
import { api, send, Lead, stages, formatDate } from '../lib/api';

type Page = 'Overview' | 'Leads' | 'Pipeline' | 'Websites' | 'Imports' | 'Follow-ups' | 'Settings';
const navigation = [{ name: 'Overview', icon: LayoutDashboard }, { name: 'Leads', icon: UsersRound }, { name: 'Pipeline', icon: BarChart3 }, { name: 'Follow-ups', icon: Clock3 }, { name: 'Websites', icon: Globe2 }, { name: 'Imports', icon: FileSpreadsheet }] as const;
const blankLead = { full_name: '', email: '', phone: '', company_name: '', inquiry_type: '', priority: 'medium', status: 'new', assigned_to: '', website_id: '', tags: '', next_follow_up_at: '' };
const titleCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const initials = (text: string) => text.split(' ').map(t => t[0]).slice(0, 2).join('').toUpperCase();

function getTaskUrgency(dueAt: string) {
  const due = new Date(dueAt);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const isPast = diffMs < 0;

  const today = new Date();
  const isDueToday = due.getFullYear() === today.getFullYear() &&
                     due.getMonth() === today.getMonth() &&
                     due.getDate() === today.getDate();

  const timeStr = due.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isPast) {
    const absDiff = Math.abs(diffMs);
    const diffHours = Math.floor(absDiff / (1000 * 60 * 60));
    const diffDays = Math.floor(absDiff / (1000 * 60 * 60 * 24));
    let label = '';
    if (diffDays > 0) {
      label = `Overdue · ${diffDays}d ago`;
    } else if (diffHours > 0) {
      label = `Overdue · ${diffHours}h ago`;
    } else {
      const diffMins = Math.max(1, Math.floor(absDiff / (1000 * 60)));
      label = `Overdue · ${diffMins}m ago`;
    }
    return { type: 'overdue', label };
  }

  if (isDueToday) {
    return { type: 'today', label: `Due today · ${timeStr}` };
  }

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = due.getFullYear() === tomorrow.getFullYear() &&
                     due.getMonth() === tomorrow.getMonth() &&
                     due.getDate() === tomorrow.getDate();

  if (isTomorrow) {
    return { type: 'upcoming', label: `Tomorrow · ${timeStr}` };
  }

  const dateStr = due.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return { type: 'upcoming', label: `${dateStr} · ${timeStr}` };
}

function Button({ children, secondary = false, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) { return <button {...props} className={`${secondary ? 'button secondary' : 'button'} ${props.className || ''}`}>{children}</button>; }
function Badge({ value }: { value: string }) { return <span className={`badge ${value}`}>{titleCase(value)}</span>; }
function Empty({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) { return <div className="empty"><div className="empty-icon"><UsersRound size={26} /></div><h3>{title}</h3><p>{text}</p>{action}</div>; }
function Modal({ title, children, close }: { title: string; children: React.ReactNode; close: () => void }) { return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={20}/></button></header>{children}</section></div>; }

export default function CRM() {
  const [me, setMe] = useState<any>(null), [loading, setLoading] = useState(true), [page, setPage] = useState<Page>('Overview');
  const [error, setError] = useState(''), [toast, setToast] = useState(''), [busy, setBusy] = useState(false), [mobile, setMobile] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]), [total, setTotal] = useState(0), [summary, setSummary] = useState<any>(null), [websites, setWebsites] = useState<any[]>([]), [members, setMembers] = useState<any[]>([]), [tasks, setTasks] = useState<any[]>([]), [jobs, setJobs] = useState<any[]>([]), [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState(''), [stage, setStage] = useState(''), [source, setSource] = useState(''), [site, setSite] = useState(''), [dateFrom, setDateFrom] = useState(''), [dateTo, setDateTo] = useState(''), [sort, setSort] = useState('newest'), [leadPage, setLeadPage] = useState(1);
  const [agentFilter, setAgentFilter] = useState('');
  const [unclaimedOnly, setUnclaimedOnly] = useState(false);
  const [leadModal, setLeadModal] = useState(false), [selected, setSelected] = useState<Lead | null>(null), [leadForm, setLeadForm] = useState(blankLead), [detail, setDetail] = useState<Lead | null>(null), [note, setNote] = useState('');
  const [websiteModal, setWebsiteModal] = useState(false), [editingSite, setEditingSite] = useState<any>(null), [siteForm, setSiteForm] = useState({ name: '', domain: '', status: 'active', field_mapping: '{}', assigned_to: '' }), [secret, setSecret] = useState('');
  const [taskModal, setTaskModal] = useState(false), [taskForm, setTaskForm] = useState({ lead_id: '', title: '', due_at: '', assigned_to: '' });
  const [taskTab, setTaskTab] = useState<'all' | 'overdue' | 'today' | 'upcoming'>('all');
  const [taskSearch, setTaskSearch] = useState('');
  const [taskOwnerFilter, setTaskOwnerFilter] = useState('');
  const [taskSort, setTaskSort] = useState<'due_asc' | 'due_desc' | 'name_asc'>('due_asc');
  const [rescheduleOldTaskId, setRescheduleOldTaskId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null), [inspection, setInspection] = useState<any>(null), [mapping, setMapping] = useState<Record<string, string>>({}), [preview, setPreview] = useState<any>(null), [importStep, setImportStep] = useState(1);
  const [websiteSearch, setWebsiteSearch] = useState('');
  const [websiteStatusFilter, setWebsiteStatusFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [integrationGuideSite, setIntegrationGuideSite] = useState<any>(null);
  const [integrationTab, setIntegrationTab] = useState<'curl' | 'javascript' | 'html'>('curl');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'duplicate' | 'failed'>('all');
  const [memberModal, setMemberModal] = useState(false), [memberForm, setMemberForm] = useState({ name: '', email: '', password: '', role: 'agent' });
  const [editMemberModal, setEditMemberModal] = useState(false), [editingMember, setEditingMember] = useState<any>(null);
  const [editMemberForm, setEditMemberForm] = useState({ name: '', email: '', role: 'agent' as 'admin' | 'agent' | 'viewer' });
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null), [dragOverStage, setDragOverStage] = useState<string | null>(null), [actionMenuLeadId, setActionMenuLeadId] = useState<string | null>(null);
  const draggedLeadIdRef = useRef<string | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const isAgentOrAdmin = Boolean(me && (me.role === 'admin' || me.role === 'agent'));
  const canWrite = Boolean(me), isAdmin = me?.role === 'admin';
  const unclaimedCount = typeof summary?.unaccepted_count === 'number' ? summary.unaccepted_count : leads.filter(l => !l.accepted_by).length;
  const hasUnclaimed = unclaimedCount > 0;

  const autoMatchColumns = (headers: string[]) => {
    const newMapping: Record<string, string> = {};
    const rules: Record<string, string[]> = {
      full_name: ['full_name', 'fullname', 'name', 'contact_name', 'client_name', 'lead_name', 'patient_name', 'customer_name'],
      email: ['email', 'email_address', 'mail', 'e_mail'],
      phone: ['phone', 'phone_number', 'mobile', 'mobile_number', 'contact', 'contact_number', 'tel', 'telephone'],
      company_name: ['company_name', 'company', 'clinic', 'hospital', 'business_name', 'business', 'org', 'organization'],
      inquiry_type: ['inquiry_type', 'inquiry', 'business_type', 'service', 'department', 'type', 'category'],
      priority: ['priority', 'urgency', 'level']
    };

    for (const [crmField, aliases] of Object.entries(rules)) {
      const match = headers.find(h => {
        const clean = h.toLowerCase().replace(/[\s\-_]/g, '');
        return aliases.some(a => a.replace(/[\s\-_]/g, '') === clean);
      });
      if (match) newMapping[crmField] = match;
    }
    setMapping(prev => ({ ...prev, ...newMapping }));
    setToast('Columns auto-matched with headers');
  };

  const moveLeadStage = async (leadId: string, newStage: string) => {
    const currentLead = leads.find(l => l.id === leadId);
    if (!currentLead || currentLead.status === newStage) return;
    const previousStatus = currentLead.status;
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStage } : l));
    if (detail && detail.id === leadId) {
      setDetail(prev => prev ? { ...prev, status: newStage } : null);
    }
    try {
      await api(`/leads/${leadId}`, send({ status: newStage }, 'PATCH'));
      setToast(`Lead "${currentLead.full_name}" moved to ${titleCase(newStage)}`);
      refresh();
    } catch (err: any) {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: previousStatus } : l));
      if (detail && detail.id === leadId) {
        setDetail(prev => prev ? { ...prev, status: previousStatus } : null);
      }
      setError(err.message || 'Failed to update lead status');
    }
  };

  const handleCardDragStart = (e: DragEvent<HTMLElement>, lead: Lead) => {
    if (!canWrite) return;
    draggedLeadIdRef.current = lead.id;
    isDraggingRef.current = true;
    e.dataTransfer.setData('text/plain', lead.id);
    e.dataTransfer.setData('application/x-timely-lead', lead.id);
    e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => {
      setDraggingLeadId(lead.id);
    });
  };

  const handleCardDragEnd = () => {
    draggedLeadIdRef.current = null;
    setDraggingLeadId(null);
    setDragOverStage(null);
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 150);
  };

  const handleDragOverColumn = (e: DragEvent<HTMLElement>, stageKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStage !== stageKey) {
      setDragOverStage(stageKey);
    }
  };

  const handleDropOnColumn = (e: DragEvent<HTMLElement>, targetStage: string) => {
    e.preventDefault();
    e.stopPropagation();
    const leadId = e.dataTransfer.getData('application/x-timely-lead') ||
                   e.dataTransfer.getData('text/plain') ||
                   draggedLeadIdRef.current ||
                   draggingLeadId;

    setDragOverStage(null);
    setDraggingLeadId(null);
    draggedLeadIdRef.current = null;

    if (leadId) {
      moveLeadStage(leadId, targetStage);
    }
  };

  const acceptLead = async (leadId: string, leadName?: string) => {
    await perform(async () => {
      try {
        await api(`/leads/${leadId}/accept`, send({}));
        setToast(leadName ? `Lead "${leadName}" claimed & added to your pipeline!` : 'Lead claimed and assigned to you');
        if (detail && detail.id === leadId) {
          setDetail(await api(`/leads/${leadId}`));
        }
        refresh();
      } catch (err: any) {
        setToast(err?.message || 'Failed to claim lead');
      }
    });
  };

  const claimNextLead = async () => {
    if (!canWrite) return;
    await perform(async () => {
      let targetId: string | null = null;
      let targetName: string | null = null;

      const localUnclaimed = leads.find(l => !l.accepted_by);
      if (localUnclaimed) {
        targetId = localUnclaimed.id;
        targetName = localUnclaimed.full_name;
      } else if (summary?.unaccepted_leads && summary.unaccepted_leads.length > 0) {
        targetId = summary.unaccepted_leads[0].id;
        targetName = summary.unaccepted_leads[0].full_name;
      }

      if (!targetId) {
        try {
          const res = await api<{ items: Lead[] }>('/leads?unclaimed=true&page_size=1');
          if (res?.items && res.items.length > 0) {
            targetId = res.items[0].id;
            targetName = res.items[0].full_name;
          }
        } catch {
          // fallback
        }
      }

      if (targetId) {
        await api(`/leads/${targetId}/accept`, send({}));
        setToast(`Successfully claimed lead "${targetName || 'Inquiry'}"! Assigned to you.`);
        if (detail && detail.id === targetId) {
          setDetail(await api(`/leads/${targetId}`));
        }
      } else {
        setToast('No unclaimed leads currently waiting in queue.');
      }
    });
  };

  const exportLeads = () => {
    const params = new URLSearchParams({ q: search, status: stage, source, website_id: site });
    if (unclaimedOnly) params.set('unclaimed', 'true');
    if (dateFrom) params.set('date_from', new Date(dateFrom + 'T00:00:00').toISOString());
    if (dateTo) params.set('date_to', new Date(dateTo + 'T23:59:59.999').toISOString());
    window.location.href = `/api/v1/leads/export?${params.toString()}`;
  };


  useEffect(() => { api('/organizations/me').then(setMe).catch(() => {}).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLeadModal(false); setWebsiteModal(false); setTaskModal(false); setDetail(null); setSecret(''); setMemberModal(false); setActionMenuLeadId(null); setRescheduleOldTaskId(null); setEditMemberModal(false); setEditingMember(null);
      }
    };

    const onDocClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement)?.closest('.table-actions-cell')) {
        setActionMenuLeadId(null);
      }
    };
    window.addEventListener('keydown', escape);
    window.addEventListener('click', onDocClick);
    return () => {
      window.removeEventListener('keydown', escape);
      window.removeEventListener('click', onDocClick);
    };
  }, []);
  const filters = useCallback(() => {
    const params = new URLSearchParams({ q: search, status: stage, source, website_id: site, page: String(leadPage), page_size: (page === 'Pipeline' || page === 'Follow-ups') ? '100' : '10', sort });
    if (unclaimedOnly) params.set('unclaimed', 'true');
    if (dateFrom) params.set('date_from', new Date(dateFrom + 'T00:00:00').toISOString());
    if (dateTo) params.set('date_to', new Date(dateTo + 'T23:59:59.999').toISOString());
    if (agentFilter && agentFilter !== 'unassigned') params.set('assigned_to', agentFilter);
    return params;
  }, [search, stage, source, site, leadPage, page, sort, dateFrom, dateTo, unclaimedOnly, agentFilter]);
  const refresh = useCallback(async () => {
    if (!me) return;
    try {
      const params = filters();
      const dash = new URLSearchParams(params); ['q', 'status', 'page', 'page_size', 'sort', 'unclaimed'].forEach(k => dash.delete(k));
      const [leadData, stats, sites, people, followups, imports] = await Promise.all([api(`/leads?${params}`), api(`/dashboard/summary?${dash}`), api('/websites'), api('/members'), api('/follow-ups'), api('/imports')]);
      setLeads(leadData.items); setTotal(leadData.total); setSummary(stats); setWebsites(sites); setMembers(people); setTasks(followups); setJobs(imports);
      if (people && Array.isArray(people) && me?.user) {
        const myMember = people.find((p: any) => p.id === me.user?.id || (p.email && me.user?.email && p.email.toLowerCase() === me.user.email.toLowerCase()));
        if (myMember && myMember.role && myMember.role !== me.role) {
          setMe((prev: any) => prev ? { ...prev, role: myMember.role } : prev);
        }
      }
      if (me.role === 'admin' && page === 'Settings') setLogs(await api('/audit-logs'));
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('Sign in to continue') || msg.includes('Session expired') || msg.includes('401')) {
        setError('');
        setMe(null);
        return;
      }
      if (!msg.includes('offset-naive and offset-aware datetimes') && !msg.includes('Unterminated string in JSON')) {
        setError(msg);
      }
    }
  }, [me, filters, page]);
  useEffect(() => {
    const timer = setTimeout(refresh, 200);
    const interval = setInterval(refresh, 3500);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearTimeout(timer); clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [refresh]);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('Sign in to continue') || msg.includes('Session expired') || msg.includes('401')) {
        setError('');
        setMe(null);
        return;
      }
      if (!msg.includes('offset-naive and offset-aware datetimes') && !msg.includes('Unterminated string in JSON')) {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }
  const changePage = (value: Page) => { setPage(value); setLeadPage(1); setUnclaimedOnly(false); setMobile(false); setError(''); };
  const openEditMember = (m: any) => {
    setEditingMember(m);
    setEditMemberForm({
      name: m.name || '',
      email: m.email || '',
      role: (['admin', 'agent', 'viewer'].includes(m.role) ? m.role : 'agent') as 'admin' | 'agent' | 'viewer',
    });
    setEditMemberModal(true);
  };
  const openEditMemberRole = openEditMember;

  const saveMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    const targetMember = editingMember;
    const payload = {
      name: editMemberForm.name.trim(),
      email: editMemberForm.email.trim().toLowerCase(),
      role: editMemberForm.role,
    };
    await perform(async () => {
      const updated = await api<any>(`/members/${targetMember.id}`, send(payload, 'PATCH'));
      setMembers(prev => prev.map(m => m.id === targetMember.id ? { ...m, ...updated, name: payload.name, email: payload.email, role: payload.role } : m));
      if (me?.user?.id === targetMember.id || (me?.user?.email && me.user.email.toLowerCase() === payload.email.toLowerCase())) {
        setMe((prev: any) => ({
          ...prev,
          user: { ...prev.user, name: payload.name, email: payload.email },
          role: payload.role
        }));
      }
      setEditMemberModal(false);
      setEditingMember(null);
      setToast(`Updated details for ${payload.name}`);
    });
  };
  const saveMemberRole = saveMember;
  const addLead = () => { setSelected(null); setLeadForm(blankLead); setLeadModal(true); };

  const editLead = (lead: Lead) => { setSelected(lead); setLeadForm({ full_name: lead.full_name, phone: lead.phone, email: lead.email, company_name: lead.company_name, inquiry_type: lead.inquiry_type, status: lead.status, priority: lead.priority, assigned_to: lead.assigned_to || '', website_id: lead.website_id || '', tags: lead.tags.join(', '), next_follow_up_at: lead.next_follow_up_at ? new Date(new Date(lead.next_follow_up_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '' }); setLeadModal(true); setDetail(null); };
  async function saveLead(e: FormEvent) { e.preventDefault(); await perform(async () => { const body = { ...leadForm, assigned_to: leadForm.assigned_to || null, website_id: leadForm.website_id || null, tags: leadForm.tags.split(',').map(t => t.trim()).filter(Boolean), next_follow_up_at: leadForm.next_follow_up_at ? new Date(leadForm.next_follow_up_at).toISOString() : null }; await api(selected ? `/leads/${selected.id}` : '/leads', send(body, selected ? 'PATCH' : 'POST')); setLeadModal(false); setToast(selected ? 'Lead updated' : 'Lead added to your workspace'); }); }
  const assignLeadAgent = async (leadId: string, newAgentId: string, leadName: string) => {
    if (!isAdmin) return;
    const targetAgent = members.find(m => m.id === newAgentId);
    const agentName = targetAgent ? targetAgent.name : 'Unassigned';
    setLeads(prev =>
      prev.map(l => {
        if (l.id === leadId) {
          return {
            ...l,
            assigned_to: newAgentId || null,
            accepted_by: newAgentId || null,
            accepted_at: newAgentId ? (l.accepted_at || new Date().toISOString()) : null,
            status: (newAgentId && l.status === 'new') ? 'contacted' : l.status
          };
        }
        return l;
      })
    );
    await perform(async () => {
      await api(`/leads/${leadId}`, send({ assigned_to: newAgentId || null }, 'PATCH'));
      setToast(newAgentId ? `Assigned ${leadName} to ${agentName}` : `${leadName} is now unassigned`);
      refresh();
    });
  };
  async function showDetail(lead: Lead) { await perform(async () => setDetail(await api(`/leads/${lead.id}`))); }
  async function inspectFile() { await perform(async () => { if (!file) return; const body = new FormData(); body.append('file', file); const data: any = await api('/imports/inspect', { method: 'POST', body }); setInspection(data); const defaults: Record<string, string> = {}; ['full_name', 'email', 'phone', 'company_name', 'inquiry_type', 'priority'].forEach(field => { const found = data.headers.find((h: string) => h.toLowerCase().replace(/\s+/g, '_') === field || (field === 'full_name' && h.toLowerCase() === 'name')); if (found) defaults[field] = found; }); setMapping(defaults); setImportStep(2); }); }

  const completeTask = async (taskId: string, title?: string) => {
    await perform(async () => {
      await api(`/follow-ups/${taskId}`, send({ status: 'completed' }, 'PATCH'));
      setToast(title ? `Completed: "${title}"` : 'Follow-up marked as completed');
    });
  };

  const quickPostpone = async (task: any, days: number) => {
    await perform(async () => {
      const baseTime = Math.max(new Date(task.due_at).getTime(), Date.now());
      const newDueDate = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();
      await api(`/follow-ups/${task.id}`, send({ status: 'completed' }, 'PATCH'));
      await api('/follow-ups', send({
        lead_id: task.lead_id,
        title: task.title,
        due_at: newDueDate,
        assigned_to: task.assigned_to || null
      }, 'POST'));
      setToast(`Rescheduled to ${formatDate(newDueDate)}`);
    });
  };

  const openRescheduleModal = (task: any) => {
    const nextDate = new Date(Date.now() + 86400000);
    const localIso = new Date(nextDate.getTime() - nextDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setTaskForm({
      lead_id: task.lead_id,
      title: task.title,
      due_at: localIso,
      assigned_to: task.assigned_to || ''
    });
    setRescheduleOldTaskId(task.id);
    setTaskModal(true);
  };

  const openScheduleFollowUp = (leadId?: string, defaultTitle?: string) => {
    const nextDate = new Date(Date.now() + 86400000);
    const localIso = new Date(nextDate.getTime() - nextDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    let targetLead = leads.find(l => l.id === (leadId || selected?.id));
    if (!targetLead && me?.role === 'agent') {
      targetLead = leads.find(l => l.assigned_to === me?.user?.id) || leads[0];
    }
    if (!targetLead) {
      targetLead = leads[0];
    }
    setTaskForm({
      lead_id: targetLead?.id || leadId || '',
      title: defaultTitle || 'Client call & check-in',
      due_at: localIso,
      assigned_to: targetLead?.assigned_to || me?.user?.id || ''
    });
    setRescheduleOldTaskId(null);
    setTaskModal(true);
  };

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await api('/auth/logout', send({}));
    } catch {
      // ignore
    } finally {
      setBusy(false);
      setError('');
      setMe(null);
    }
  };

  const handleRevokeAll = async () => {
    if (confirm('Revoke all active sessions across all devices? You will be signed out.')) {
      setBusy(true);
      try {
        await api('/auth/revoke-all', send({}));
      } catch {
        // ignore
      } finally {
        setBusy(false);
        setError('');
        setMe(null);
      }
    }
  };

  const clearAllAuditLogs = () => {
    if (!confirm('Are you sure you want to clear all audit logs for this workspace? This cannot be undone.')) return;
    perform(async () => {
      await api('/audit-logs', { method: 'DELETE' });
      setLogs([]);
      setToast('All audit logs cleared');
    });
  };

  if (loading) return <div className="loading"><LoaderCircle className="spin"/> Opening your workspace…</div>;
  if (!me) return <Login onLogin={userData => { setError(''); setMe(userData); }}/>;

  const hasActiveFilters = Boolean(search || stage || site || source || agentFilter);

  const displayedLeads = leads.filter(l => {
    if (me?.role === 'agent') {
      return l.assigned_to === me?.user?.id || l.accepted_by === me?.user?.id;
    }
    if (agentFilter === 'unassigned') {
      return !l.assigned_to;
    }
    if (agentFilter) {
      return l.assigned_to === agentFilter;
    }
    return true;
  });

  const filterBar = (
    <div className="filters">
      <div className="search">
        <Search size={16}/>
        <input
          aria-label="Search leads"
          placeholder="Search by name, email, phone, business…"
          value={search}
          onChange={e => { setSearch(e.target.value); setLeadPage(1); }}
        />
        {search && (
          <button
            type="button"
            className="icon-button"
            style={{ width: 22, height: 22 }}
            onClick={() => { setSearch(''); setLeadPage(1); }}
            aria-label="Clear search text"
          >
            <X size={13}/>
          </button>
        )}
      </div>
      <select aria-label="Filter by status" value={stage} onChange={e => { setStage(e.target.value); setLeadPage(1); }}>
        <option value="">All statuses</option>
        {stages.map(s => <option key={s} value={s}>{titleCase(s)}</option>)}
      </select>
      <select aria-label="Filter by website" value={site} onChange={e => { setSite(e.target.value); setLeadPage(1); }}>
        <option value="">All websites</option>
        {websites.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
      <select aria-label="Filter by source" value={source} onChange={e => { setSource(e.target.value); setLeadPage(1); }}>
        <option value="">All sources</option>
        <option value="website">Website Form</option>
        <option value="manual">Direct CRM</option>
        <option value="csv">CSV Import</option>
        <option value="xlsx">Excel Import</option>
      </select>
      {isAdmin && (
        <select
          aria-label="Filter by assigned agent"
          value={agentFilter}
          onChange={e => { setAgentFilter(e.target.value); setLeadPage(1); }}
        >
          <option value="">All agents</option>
          <option value="unassigned">— Unassigned / Awaiting claim —</option>
          {members.filter(m => m.role !== 'viewer').map(m => (
            <option key={m.id} value={m.id}>
              Agent: {m.name}{m.role === 'admin' ? ' (Admin)' : ''}
            </option>
          ))}
        </select>
      )}
      <select aria-label="Sort leads" value={sort} onChange={e => setSort(e.target.value)}>
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="name">Name A–Z</option>
      </select>
      {hasActiveFilters && (
        <button
          type="button"
          className="clear-filters-btn"
          onClick={() => { setSearch(''); setStage(''); setSite(''); setSource(''); setAgentFilter(''); setLeadPage(1); }}
        >
          <X size={13}/> Reset filters
        </button>
      )}
    </div>
  );

  const leadTable = (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Lead / Contact</th>
            <th>Source</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Agent</th>
            <th>Next Follow-up</th>
            <th style={{ textAlign: 'right', paddingRight: '24px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {displayedLeads.map(lead => {
            const isOverdue = lead.next_follow_up_at && new Date(lead.next_follow_up_at) < new Date();
            const isMenuOpen = actionMenuLeadId === lead.id;
            return (
              <tr key={lead.id} className="lead-table-row">
                <td>
                  <div className="contact" onClick={() => showDetail(lead)}>
                    <span className="avatar">{initials(lead.full_name)}</span>
                    <div className="contact-info">
                      <div className="contact-name-row">
                        <strong>{lead.full_name}</strong>
                        {lead.duplicate_of && (
                          <span className="duplicate-pill" title="Possible duplicate detected">
                            Duplicate
                          </span>
                        )}
                      </div>
                      <div className="contact-details-row">
                        {lead.company_name && (
                          <span className="contact-company">
                            <Building2 size={12}/>
                            <span>{lead.company_name}</span>
                          </span>
                        )}
                        {lead.phone && (
                          <a
                            href={`tel:${lead.phone.replace(/[^0-9+]/g, '')}`}
                            className="contact-chip-inline contact-chip-clickable"
                            title={`Call ${lead.phone}`}
                            onClick={e => e.stopPropagation()}
                          >
                            <Phone size={11}/>
                            <span>{lead.phone}</span>
                          </a>
                        )}
                        {lead.email && !lead.phone && (
                          <a
                            href={`mailto:${lead.email}`}
                            className="contact-chip-inline contact-chip-clickable"
                            title={`Email ${lead.email}`}
                            onClick={e => e.stopPropagation()}
                          >
                            <Mail size={11}/>
                            <span>{lead.email}</span>
                          </a>
                        )}
                        {!lead.company_name && !lead.phone && !lead.email && (
                          <small className="muted">No contact details</small>
                        )}
                      </div>
                    </div>
                  </div>
                </td>

                <td>
                  <span className="source-label">
                    {lead.source === 'website' ? <Globe2 size={13}/> : lead.source === 'manual' ? <UsersRound size={13}/> : <FileSpreadsheet size={13}/>}
                    <span>{lead.source === 'xlsx' ? 'Excel' : titleCase(lead.source)}</span>
                  </span>
                </td>

                <td>
                  <Badge value={lead.status}/>
                </td>

                <td>
                  <span className={`priority ${lead.priority}`}>
                    ● {titleCase(lead.priority)}
                  </span>
                </td>

                <td>
                  {isAdmin ? (
                    <div className="table-agent-assign-wrap" onClick={e => e.stopPropagation()}>
                      <select
                        className={`table-agent-select ${!lead.assigned_to ? 'unassigned' : ''}`}
                        value={lead.assigned_to || ''}
                        aria-label={`Assign agent for ${lead.full_name}`}
                        title={lead.assigned_to ? `Assigned to ${members.find(m => m.id === lead.assigned_to)?.name || 'Agent'} · Click to reassign` : 'Click to assign an agent'}
                        disabled={busy}
                        onClick={e => e.stopPropagation()}
                        onChange={e => {
                          e.stopPropagation();
                          assignLeadAgent(lead.id, e.target.value, lead.full_name);
                        }}
                      >
                        <option value="">
                          {lead.accepted_by === null ? '⚡ Awaiting Claim' : '— Unassigned —'}
                        </option>
                        {members
                          .filter(m => m.role !== 'viewer')
                          .map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name}{m.role === 'admin' ? ' (Admin)' : ''}
                            </option>
                          ))}
                      </select>
                      <span className="table-agent-select-arrow" aria-hidden="true">
                        <ChevronDown size={11} />
                      </span>
                    </div>
                  ) : lead.accepted_by === null ? (
                    <span className="unaccepted-chip" title="Awaiting claim/acceptance by an agent">
                      <span className="pulse-dot warning"/> Awaiting Claim
                    </span>
                  ) : members.find(m => m.id === lead.assigned_to)?.name ? (
                    <span style={{ fontWeight: 550, color: 'var(--ink)' }}>
                      {members.find(m => m.id === lead.assigned_to)?.name}
                    </span>
                  ) : (
                    <span className="muted">Unassigned Agent</span>
                  )}
                </td>

                <td>
                  {lead.next_follow_up_at ? (
                    <span className={isOverdue ? 'overdue-text' : ''} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Clock3 size={12}/>
                      <span>{isOverdue ? 'Overdue · ' : ''}{formatDate(lead.next_follow_up_at)}</span>
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>

                <td>
                  <div className="table-actions-cell">
                    {!lead.accepted_by && canWrite && (
                      <button
                        type="button"
                        className="lead-quick-btn claim"
                        onClick={() => acceptLead(lead.id, lead.full_name)}
                        title={`Claim ${lead.full_name} for yourself`}
                      >
                        <Zap size={12} fill="currentColor"/>
                        <span>Claim</span>
                      </button>
                    )}

                    {canWrite && (
                      <button
                        type="button"
                        className="lead-quick-btn edit"
                        onClick={() => editLead(lead)}
                        title={`Edit ${lead.full_name}`}
                      >
                        <Pencil size={12}/>
                        <span>Edit</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="lead-quick-btn view"
                      onClick={() => showDetail(lead)}
                      title={`View details for ${lead.full_name}`}
                      aria-label={`View details for ${lead.full_name}`}
                    >
                      <Eye size={13}/>
                    </button>

                    <button
                      type="button"
                      className={`lead-more-btn ${isMenuOpen ? 'active' : ''}`}
                      aria-label={`More actions for ${lead.full_name}`}
                      aria-expanded={isMenuOpen}
                      onClick={e => {
                        e.stopPropagation();
                        setActionMenuLeadId(isMenuOpen ? null : lead.id);
                      }}
                      title="More actions"
                    >
                      <MoreHorizontal size={15}/>
                    </button>

                    {isMenuOpen && (
                      <div className="lead-action-menu" role="menu">
                        {!lead.accepted_by && canWrite && (
                          <button
                            type="button"
                            className="lead-menu-item primary-accent"
                            role="menuitem"
                            onClick={() => {
                              setActionMenuLeadId(null);
                              acceptLead(lead.id, lead.full_name);
                            }}
                          >
                            <Zap size={13} fill="currentColor"/>
                            <span>Claim lead for myself</span>
                          </button>
                        )}

                        {canWrite && (
                          <button
                            type="button"
                            className="lead-menu-item"
                            role="menuitem"
                            onClick={() => {
                              setActionMenuLeadId(null);
                              editLead(lead);
                            }}
                          >
                            <Pencil size={13}/>
                            <span>Edit lead details</span>
                          </button>
                        )}

                        <button
                          type="button"
                          className="lead-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setActionMenuLeadId(null);
                            showDetail(lead);
                          }}
                        >
                          <Eye size={13}/>
                          <span>View timeline & notes</span>
                        </button>

                        {canWrite && (
                          <button
                            type="button"
                            className="lead-menu-item"
                            role="menuitem"
                            onClick={() => {
                              setActionMenuLeadId(null);
                              openScheduleFollowUp(lead.id);
                            }}
                          >
                            <Clock3 size={13}/>
                            <span>Schedule follow-up</span>
                          </button>
                        )}

                        {isAdmin && (
                          <button
                            type="button"
                            className="lead-menu-item"
                            role="menuitem"
                            onClick={() => {
                              setActionMenuLeadId(null);
                              editLead(lead);
                            }}
                          >
                            <UserCheck size={13}/>
                            <span>{lead.assigned_to ? 'Reassign agent' : 'Assign agent'}</span>
                          </button>
                        )}

                        {isAdmin && (
                          <>
                            <div className="lead-menu-divider" />
                            <button
                              type="button"
                              className="lead-menu-item danger"
                              role="menuitem"
                              onClick={() => {
                                setActionMenuLeadId(null);
                                if (confirm(`Remove ${lead.full_name} from your active directory?`)) {
                                  perform(async () => {
                                    await api(`/leads/${lead.id}`, { method: 'DELETE' });
                                    setToast('Lead removed');
                                  });
                                }
                              }}
                            >
                              <Trash2 size={13}/>
                              <span>Delete lead</span>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!leads.length && (
        <Empty
          title="Your next connection starts here"
          text="Add a lead, connect a website, or import your existing contacts."
          action={canWrite && <Button onClick={addLead}><Plus size={16}/> Add first lead</Button>}
        />
      )}
    </div>
  );

  return <div className="app-shell"><aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}><a href="#" className="brand" onClick={e => { e.preventDefault(); changePage('Overview'); }}><img src="/timely-logo.png" alt="Timely Health" className="brand-logo-img" /><span className="brand-crm">CRM</span></a><div className="workspace"><span className="workspace-icon">TH</span><div><strong>{me.organization.name}</strong><small>Organization workspace</small></div><ShieldCheck size={15}/></div><span className="nav-caption">WORKSPACE</span><nav>{navigation.map(item => <button key={item.name} className={page === item.name ? 'active' : ''} onClick={() => changePage(item.name)}><item.icon size={19}/>{item.name}{item.name === 'Follow-ups' && tasks.length > 0 && <span className="nav-count">{tasks.length}</span>}</button>)}</nav><div className="sidebar-bottom"><div className="sidebar-tip"><span className="tip-dot"/> Every inquiry. One place.<p>Keep your team and your next opportunity connected.</p></div><button className={page === 'Settings' ? 'nav-settings active' : 'nav-settings'} onClick={() => changePage('Settings')}><Settings2 size={18}/>Settings</button><div className="profile"><span className="avatar dark">{initials(me.user.name)}</span><div><strong>{me.user.name}</strong><small>{titleCase(me.role)}</small></div><button className="icon-button" aria-label="Sign out" onClick={handleSignOut}><LogOut size={17}/></button></div></div></aside>
    <main><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobile(!mobile)}><Menu size={20}/></button><span>Workspace</span><ChevronRight size={14}/><strong>{page}</strong></div><div className="topbar-right"><span className="live-dot"/> Workspace connected <span className="topbar-divider"/><button className="icon-button" aria-label="View follow-ups" onClick={() => changePage('Follow-ups')}><Bell size={18}/>{tasks.length > 0 && <i/>}</button><span className="avatar small">{initials(me.user.name)}</span></div></header>
    <div className="main-content"><div className="page-heading"><div><div className="eyebrow">TIMELY HEALTH WORKSPACE</div><h1>{page === 'Overview' ? 'A clearer view of every opportunity.' : page === 'Leads' ? 'Your leads, all together.' : page === 'Pipeline' ? 'Move every conversation forward.' : page === 'Websites' ? 'One workspace. Every website.' : page === 'Imports' ? 'Bring your contacts along.' : page === 'Follow-ups' ? 'Make your next move timely.' : 'A workspace that works for you.'}</h1><p>{({ Overview: 'From first inquiry to lasting connection. Here’s where things stand.', Leads: 'Find, organize, and follow through on every inquiry.', Pipeline: 'Track your leads from the first hello to a successful conversion.', Websites: 'Connect your forms and keep every lead attributed to its source.', Imports: 'Turn your CSV and Excel files into organized, actionable leads.', 'Follow-ups': 'Small follow-throughs. Stronger relationships.', Settings: 'Manage your organization, team, and workspace activity.' })[page]}</p></div><div className="heading-actions">{['Overview', 'Leads', 'Pipeline'].includes(page) && <>{canWrite && hasUnclaimed && ['Overview', 'Leads'].includes(page) && <Button onClick={claimNextLead} disabled={busy} className="claim-lead-header-btn claim-lead-popup" title={`Claim next incoming lead for yourself (${unclaimedCount} waiting)`}><Zap size={15} fill="currentColor"/><span>Claim Lead ({unclaimedCount})</span></Button>}{page === 'Leads' && <><Button secondary onClick={() => changePage('Pipeline')}><BarChart3 size={16}/> Pipeline board</Button>{isAdmin && <Button secondary onClick={exportLeads} title="Export leads as CSV"><ArrowDownToLine size={16}/> Export CSV</Button>}</>}<Button secondary onClick={() => changePage('Imports')}><ArrowDownToLine size={16}/> Import leads</Button>{canWrite && <Button onClick={addLead}><Plus size={17}/> Add lead</Button>}</>}{page === 'Websites' && isAdmin && <Button onClick={() => { setEditingSite(null); setSiteForm({ name: '', domain: '', status: 'active', field_mapping: '{}', assigned_to: '' }); setWebsiteModal(true); }}><Plus size={17}/> Connect website</Button>}{page === 'Follow-ups' && canWrite && <Button onClick={() => openScheduleFollowUp()}><Plus size={17}/> New follow-up</Button>}</div></div>
    {error && error !== 'Sign in to continue' && <div role="alert" className="error-banner">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}
    {['Overview', 'Leads', 'Pipeline'].includes(page) && (
      <div className="date-filter">
        <span><ListFilter size={15}/> Cohort:</span>
        <div className="date-presets">
          <button
            type="button"
            className={`date-preset-pill ${!dateFrom && !dateTo ? 'active' : ''}`}
            onClick={() => { setDateFrom(''); setDateTo(''); setLeadPage(1); }}
          >
            All time
          </button>
          <button
            type="button"
            className={`date-preset-pill ${dateFrom === new Date().toISOString().slice(0, 10) && dateTo === new Date().toISOString().slice(0, 10) ? 'active' : ''}`}
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              setDateFrom(today);
              setDateTo(today);
              setLeadPage(1);
            }}
          >
            Today
          </button>
          <button
            type="button"
            className={`date-preset-pill ${dateFrom === new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10) ? 'active' : ''}`}
            onClick={() => {
              setDateFrom(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
              setDateTo(new Date().toISOString().slice(0, 10));
              setLeadPage(1);
            }}
          >
            Last 7 days
          </button>
          <button
            type="button"
            className={`date-preset-pill ${dateFrom === new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10) ? 'active' : ''}`}
            onClick={() => {
              setDateFrom(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
              setDateTo(new Date().toISOString().slice(0, 10));
              setLeadPage(1);
            }}
          >
            Last 30 days
          </button>
        </div>
        <span style={{ margin: '0 2px', color: 'var(--muted-light)' }}>|</span>
        <input aria-label="Created from" type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setLeadPage(1); }}/>
        <span>to</span>
        <input aria-label="Created until" type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setLeadPage(1); }}/>
        {(dateFrom || dateTo) && <button className="text-button" onClick={() => { setDateFrom(''); setDateTo(''); setLeadPage(1); }}>Reset</button>}
        <small>Conversion rates and metrics use this lead cohort.</small>
      </div>
    )}
    {page === 'Overview' && summary && <>
      <div className="overview-triage-strip">
        <div className="triage-status-group">
          <span className="triage-live-tag">
            <span className="live-dot" /> Live Workspace
          </span>
          <div className="triage-quick-metrics">
            <span>Pipeline Volume: <strong>{summary.total} Leads</strong></span>
            <span className="triage-divider" />
            <span>Qualified: <strong>{summary.statuses.qualified}</strong></span>
            <span className="triage-divider" />
            <span>Conversion: <strong>{summary.conversion_rate}%</strong></span>
            <span className="triage-divider" />
            <span>Tasks Today: <strong className={summary.overdue > 0 ? 'overdue-text' : ''}>{summary.due_today} {summary.overdue > 0 ? `(${summary.overdue} Overdue)` : ''}</strong></span>
            {summary.unaccepted_count > 0 && (
              <>
                <span className="triage-divider" />
                <button
                  type="button"
                  className="triage-unaccepted-pill"
                  onClick={() => { setUnclaimedOnly(true); changePage('Leads'); }}
                  title="Click to view and claim incoming inquiries"
                >
                  <AlertCircle size={13}/>
                  <span>Incoming: <strong>{summary.unaccepted_count} Awaiting Claim</strong></span>
                </button>
              </>
            )}
          </div>
        </div>
        <div className="triage-quick-actions">
          {canWrite && hasUnclaimed && (
            <Button
              onClick={claimNextLead}
              className="claim-lead-header-btn claim-lead-popup"
              title={`Claim next lead (${unclaimedCount} waiting)`}
              style={{ minHeight: 32, padding: '6px 14px', fontSize: '11px' }}
            >
              <Zap size={14} fill="currentColor"/> Claim Next Lead ({unclaimedCount})
            </Button>
          )}
          {summary.unaccepted_count > 0 && (
            <Button
              secondary
              onClick={() => { setUnclaimedOnly(true); changePage('Leads'); }}
              style={{ minHeight: 32, padding: '6px 14px', fontSize: '11px' }}
            >
              <ListFilter size={14}/> View Claim Queue ({summary.unaccepted_count})
            </Button>
          )}
          {canWrite && (
            <Button onClick={addLead} style={{ minHeight: 32, padding: '6px 14px', fontSize: '11px' }}>
              <Plus size={15}/> New lead
            </Button>
          )}
          <Button secondary onClick={() => changePage('Pipeline')} style={{ minHeight: 32, padding: '6px 14px', fontSize: '11px' }}>
            <BarChart3 size={15}/> Kanban
          </Button>
        </div>
      </div>

      {summary.unaccepted_leads && summary.unaccepted_leads.length > 0 && (
        <section className="panel unaccepted-queue-panel">
          <div className="section-heading">
            <div>
              <div className="eyebrow amber">ACTION REQUIRED · REAL-TIME INGEST</div>
              <h2>Incoming Leads Awaiting Acceptance <span className="count-pill warning">{summary.unaccepted_count}</span></h2>
              <p>These inquiries just arrived from connected websites and require agent acceptance before follow-up.</p>
            </div>
            <button className="text-button" onClick={() => { setUnclaimedOnly(true); changePage('Leads'); }}>
              View all in claim queue ({summary.unaccepted_count}) <ArrowRight size={13}/>
            </button>
          </div>
          <div className="unaccepted-leads-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginTop: 14 }}>
            {summary.unaccepted_leads.map((un: any) => (
              <div
                className="unaccepted-card"
                key={un.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '14px 18px',
                  background: '#FFFFFF',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  borderRadius: '12px',
                  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(245, 158, 11, 0.08)'
                }}
              >
                <div className="unaccepted-card-left" style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                  <div
                    className="unaccepted-avatar"
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                      color: '#92400E',
                      fontWeight: 750,
                      fontSize: '15px',
                      display: 'grid',
                      placeItems: 'center',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      boxShadow: '0 2px 6px rgba(245, 158, 11, 0.18)',
                      flexShrink: 0
                    }}
                  >
                    {initials(un.full_name || 'Inquiry')}
                  </div>
                  <div className="unaccepted-info" style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                    <div className="unaccepted-title-row" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span className="unaccepted-name" style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink, #0f172a)' }}>
                        {un.full_name || 'Inbound Contact'}
                      </span>
                      {un.company_name && (
                        <span
                          className="unaccepted-company-pill"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '2px 8px',
                            background: '#f1f5f9',
                            color: '#334155',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            fontWeight: 600
                          }}
                        >
                          <Building2 size={12}/>
                          <span>{un.company_name}</span>
                        </span>
                      )}
                      <span
                        className="unaccepted-live-tag"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '2px 8px',
                          background: 'rgba(245, 158, 11, 0.12)',
                          color: '#B45309',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 650
                        }}
                      >
                        <span className="pulse-dot warning"/> Awaiting Claim
                      </span>
                    </div>
                    <div className="unaccepted-meta-row" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', color: 'var(--muted, #64748b)', flexWrap: 'wrap' }}>
                      <span className="unaccepted-meta-item" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Globe2 size={12}/>
                        <span>{un.source === 'website' ? 'Website Form' : titleCase(un.source || 'Inbound')}</span>
                      </span>
                      <span className="unaccepted-meta-sep" style={{ color: '#cbd5e1' }}>·</span>
                      <span className="unaccepted-meta-item" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Clock3 size={12}/>
                        <span>{formatDate(un.created_at)}</span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="unaccepted-card-actions" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="unaccepted-preview-btn"
                    onClick={() => showDetail({ id: un.id, full_name: un.full_name } as any)}
                    title={`Preview details for ${un.full_name}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 14px',
                      background: '#ffffff',
                      color: 'var(--ink-secondary, #475569)',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Eye size={14}/>
                    <span>Preview</span>
                  </button>
                  <button
                    type="button"
                    className="unaccepted-claim-btn"
                    onClick={() => acceptLead(un.id, un.full_name)}
                    title={`Claim ${un.full_name} for yourself`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      padding: '8px 18px',
                      background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                      color: '#ffffff',
                      border: '1px solid #15803D',
                      borderRadius: '8px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(22, 163, 74, 0.35)'
                    }}
                  >
                    <Zap size={14} fill="currentColor"/>
                    <span>Claim Lead</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="metric-grid">
        <section
          className="metric metric-mint"
          onClick={() => changePage('Leads')}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && changePage('Leads')}
          title="Click to view all leads in directory"
        >
          <div className="metric-top">
            <div className="metric-label-group">
              <span className="metric-label">Total Inquiries</span>
              <span className="metric-badge mint"><UsersRound size={11}/> Active Cohort</span>
            </div>
            <span className="metric-icon mint"><UsersRound size={18}/></span>
          </div>
          <div className="metric-value-row">
            <strong className="metric-value">{summary.total}</strong>
            <span className="metric-arrow"><ArrowRight size={16}/></span>
          </div>
          <div className="metric-helper">
            <span>All inquiries registered in scope</span>
            <span className="text-button" style={{ fontSize: '10.5px' }}>View directory →</span>
          </div>
        </section>

        <section
          className="metric metric-blue"
          onClick={() => { setStage('qualified'); changePage('Pipeline'); }}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter') { setStage('qualified'); changePage('Pipeline'); } }}
          title="Click to filter pipeline by qualified leads"
        >
          <div className="metric-top">
            <div className="metric-label-group">
              <span className="metric-label">Qualified Leads</span>
              <span className="metric-badge blue"><Target size={11}/> High Intent</span>
            </div>
            <span className="metric-icon blue"><Target size={18}/></span>
          </div>
          <div className="metric-value-row">
            <strong className="metric-value">{summary.statuses.qualified}</strong>
            <span className="metric-arrow"><ArrowRight size={16}/></span>
          </div>
          <div className="metric-helper">
            <span>{summary.total ? Math.round((summary.statuses.qualified / summary.total) * 100) : 0}% of active pipeline</span>
            <span className="text-button" style={{ fontSize: '10.5px' }}>In pipeline →</span>
          </div>
        </section>

        <section
          className="metric metric-violet"
          onClick={() => changePage('Pipeline')}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && changePage('Pipeline')}
          title="Click to explore pipeline funnel"
        >
          <div className="metric-top">
            <div className="metric-label-group">
              <span className="metric-label">Conversion Rate</span>
              <span className="metric-badge violet"><BarChart3 size={11}/> Funnel Yield</span>
            </div>
            <span className="metric-icon violet"><BarChart3 size={18}/></span>
          </div>
          <div className="metric-value-row">
            <strong className="metric-value">{summary.conversion_rate}%</strong>
            <span className="metric-arrow"><ArrowRight size={16}/></span>
          </div>
          <div className="metric-helper">
            <span>{summary.statuses.converted} converted successfully</span>
            <span className="text-button" style={{ fontSize: '10.5px' }}>Analyze funnel →</span>
          </div>
        </section>

        <section
          className="metric metric-peach"
          onClick={() => changePage('Follow-ups')}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && changePage('Follow-ups')}
          title="Click to manage follow-up tasks"
        >
          <div className="metric-top">
            <div className="metric-label-group">
              <span className="metric-label">Follow-ups Today</span>
              <span className={`metric-badge ${summary.overdue > 0 ? 'alert' : 'peach'}`}>
                <Clock3 size={11}/> {summary.overdue > 0 ? `${summary.overdue} Overdue` : 'On Schedule'}
              </span>
            </div>
            <span className="metric-icon peach"><Clock3 size={18}/></span>
          </div>
          <div className="metric-value-row">
            <strong className="metric-value">{summary.due_today}</strong>
            <span className="metric-arrow"><ArrowRight size={16}/></span>
          </div>
          <div className="metric-helper">
            <span className={summary.overdue > 0 ? 'overdue-text' : ''}>
              {summary.overdue > 0 ? `${summary.overdue} require immediate action` : 'All tasks due today are on track'}
            </span>
            <span className="text-button" style={{ fontSize: '10.5px' }}>Action radar →</span>
          </div>
        </section>
      </div>

      <div className="overview-grid">
        <section className="panel pipeline-summary">
          <div className="section-heading">
            <div>
              <h2>Your Lead Pipeline Velocity</h2>
              <p>Conversion momentum across every stage of your sales funnel.</p>
            </div>
            <button className="button secondary" style={{ minHeight: 32, padding: '6px 14px', fontSize: '11px' }} onClick={() => changePage('Pipeline')}>
              View pipeline board <ArrowRight size={13}/>
            </button>
          </div>
          <div className="pipeline-bars">
            {stages.map((s) => {
              const count = summary.statuses[s] || 0;
              const sharePct = summary.total ? Math.round((count / summary.total) * 100) : 0;
              return (
                <button
                  key={s}
                  className="pipeline-stage-row"
                  title={`Click to filter leads by ${titleCase(s)}`}
                  onClick={() => { setStage(s); changePage('Leads'); }}
                >
                  <div className="pipeline-stage-left">
                    <span className={`stage-dot stage-${s}`}/>
                    <strong>{titleCase(s)}</strong>
                  </div>
                  <span className="pipeline-share-badge">{sharePct}%</span>
                  <div className="bar-track">
                    <div
                      className={`stage-fill stage-${s}`}
                      style={{ width: `${summary.total ? Math.max(3, (count / summary.total) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="pipeline-stage-count">{count}</span>
                  <span className="pipeline-row-arrow"><ArrowRight size={13}/></span>
                </button>
              );
            })}
          </div>
          <div className="pipeline-caption">
            <ShieldCheck size={14}/> Verified Attribution · Click any stage row to explore filtered contacts in that cohort.
          </div>
        </section>

        <section className="panel source-summary">
          <div className="section-heading">
            <div>
              <h2>Acquisition Channels</h2>
              <p>Attribution distribution across incoming lead channels.</p>
            </div>
            <span className="source-insight-pill">
              <Sparkles size={12}/> Verified
            </span>
          </div>
          <div className="source-total-banner">
            <div className="source-total-left">
              <strong>{summary.total}</strong>
              <span>total verified leads</span>
            </div>
            {summary.total > 0 && (
              <span className="muted" style={{ fontSize: '11px' }}>
                Primary: {Object.entries(summary.sources).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] === 'website' ? 'Website Form' : titleCase(Object.entries(summary.sources).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || 'Direct')}
              </span>
            )}
          </div>
          <div className="stacked-bar">
            {Object.entries(summary.sources).map(([s, n]: any) => (
              <div
                key={s}
                className={`source-${s}`}
                style={{ flex: n || 0 }}
                title={`${s === 'xlsx' ? 'Excel' : titleCase(s)}: ${n} leads (${summary.total ? Math.round(n / summary.total * 100) : 0}%)`}
              />
            ))}
          </div>
          <div className="channel-grid">
            {[
              { key: 'website', name: 'Website Form', icon: Globe2, iconClass: 'website' },
              { key: 'manual', name: 'Direct CRM', icon: UsersRound, iconClass: 'manual' },
              { key: 'csv', name: 'CSV Upload', icon: FileSpreadsheet, iconClass: 'csv' },
              { key: 'xlsx', name: 'Excel Sheet', icon: FileSpreadsheet, iconClass: 'xlsx' },
            ].map(ch => {
              const count = (summary.sources as any)[ch.key] || 0;
              const pct = summary.total ? Math.round((count / summary.total) * 100) : 0;
              return (
                <div
                  key={ch.key}
                  className="channel-card"
                  onClick={() => { setSource(ch.key); changePage('Leads'); }}
                  title={`Filter by ${ch.name}`}
                >
                  <div className="channel-card-top">
                    <span className={`channel-card-icon ${ch.iconClass}`}><ch.icon size={14}/></span>
                    <span>{ch.name}</span>
                  </div>
                  <div className="channel-card-values">
                    <strong>{count}</strong>
                    <span className="channel-card-share">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="overview-radar-grid">
        <section className="panel action-radar-panel" style={{ marginBottom: 0 }}>
          <div className="section-heading">
            <div>
              <h2>Action Radar · Pending Follow-ups <span className="count-pill">{tasks.length}</span></h2>
              <p>Immediate conversations and next steps scheduled for your team.</p>
            </div>
            <button className="text-button" onClick={() => changePage('Follow-ups')}>
              View all ({tasks.length}) <ArrowRight size={13}/>
            </button>
          </div>
          {tasks.length > 0 ? (
            <div className="radar-task-list">
              {tasks.slice(0, 3).map(task => {
                const isOverdue = new Date(task.due_at) < new Date();
                return (
                  <div className="radar-task-item" key={task.id}>
                    <button
                      className="task-check"
                      disabled={!canWrite || busy}
                      aria-label={`Complete ${task.title}`}
                      onClick={() => perform(async () => {
                        await api(`/follow-ups/${task.id}`, send({ status: 'completed' }, 'PATCH'));
                        setToast('Follow-up completed');
                      })}
                    >
                      <Check size={16}/>
                    </button>
                    <div className="radar-task-info">
                      <strong>{task.title}</strong>
                      <span>Lead: {task.lead_name || 'Contact'} · Assigned: {members.find(m => m.id === task.assigned_to)?.name || 'Unassigned'}</span>
                    </div>
                    <span className={`radar-task-time ${isOverdue ? 'overdue' : ''}`}>
                      {isOverdue ? '⚠️ Overdue · ' : ''}{formatDate(task.due_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '28px', textAlign: 'center', color: 'var(--muted)' }}>
              <p style={{ fontSize: '12px', fontWeight: 650, color: 'var(--ink)' }}>✨ All follow-ups are up to date</p>
              <p style={{ fontSize: '11px', marginTop: '4px' }}>No pending tasks due today in this workspace.</p>
              {canWrite && (
                <Button secondary onClick={() => openScheduleFollowUp()} style={{ marginTop: '12px', minHeight: 30, fontSize: '11px' }}>
                  <Plus size={14}/> Schedule a follow-up
                </Button>
              )}
            </div>
          )}
        </section>

        <section className="panel" style={{ marginBottom: 0 }}>
          <div className="section-heading">
            <div>
              <h2>Fast Actions & Shortcuts</h2>
              <p>Quick access to workspace workflows.</p>
            </div>
            <Zap size={17} className="muted"/>
          </div>
          <div className="shortcuts-grid">
            {canWrite && (
              <button className="shortcut-btn" onClick={addLead}>
                <div className="shortcut-btn-top">
                  <span className="shortcut-icon blue"><Plus size={16}/></span>
                  <ArrowRight size={13} className="muted"/>
                </div>
                <strong>Add New Lead</strong>
                <small>Create a contact record</small>
              </button>
            )}
            <button className="shortcut-btn" onClick={() => changePage('Pipeline')}>
              <div className="shortcut-btn-top">
                <span className="shortcut-icon green"><BarChart3 size={16}/></span>
                <ArrowRight size={13} className="muted"/>
              </div>
              <strong>Pipeline Board</strong>
              <small>Interactive Drag & Drop</small>
            </button>
            <button className="shortcut-btn" onClick={() => changePage('Imports')}>
              <div className="shortcut-btn-top">
                <span className="shortcut-icon teal"><FileSpreadsheet size={16}/></span>
                <ArrowRight size={13} className="muted"/>
              </div>
              <strong>Bulk Import</strong>
              <small>CSV or XLSX spreadsheets</small>
            </button>
            <button className="shortcut-btn" onClick={() => changePage('Websites')}>
              <div className="shortcut-btn-top">
                <span className="shortcut-icon cyan"><Globe2 size={16}/></span>
                <ArrowRight size={13} className="muted"/>
              </div>
              <strong>Connected Sites</strong>
              <small>{websites.length} websites linked</small>
            </button>
          </div>
        </section>
      </div>
    </>}
    {['Overview', 'Leads'].includes(page) && (
      <section className="panel leads-panel">
        <div className="section-heading">
          <div>
            <h2>{page === 'Overview' ? 'Recent inquiries' : 'Lead directory'} <span className="count-pill">{total}</span></h2>
            <p>{page === 'Overview' ? 'The newest inquiries waiting to connect.' : 'All prospective clients, attribution sources, and engagement status.'}</p>
          </div>
          {page === 'Overview' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="text-button" onClick={() => changePage('Leads')}>
                View all leads in directory <ArrowRight size={14}/>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Button
                secondary
                style={{ minHeight: 32, padding: '6px 14px', fontSize: '11px' }}
                onClick={() => changePage('Pipeline')}
              >
                <BarChart3 size={14}/> Pipeline Kanban
              </Button>
            </div>
          )}
        </div>
        {page === 'Leads' && (
          <div className="leads-stage-tabs-wrapper">
            <div className="leads-stage-tabs" style={{ marginBottom: 0 }}>
              <button
                type="button"
                className={`leads-stage-tab ${!unclaimedOnly && stage === '' ? 'active' : ''}`}
                onClick={() => { setUnclaimedOnly(false); setStage(''); setLeadPage(1); }}
              >
                <span>All Leads</span>
                <span className="tab-count">{unclaimedOnly ? summary?.total ?? 0 : total}</span>
              </button>
              <button
                type="button"
                className={`leads-stage-tab ${unclaimedOnly ? 'active' : ''}`}
                onClick={() => { setUnclaimedOnly(true); setStage(''); setLeadPage(1); }}
                title="Leads awaiting claim and acceptance"
              >
                <span className="pulse-dot warning"/>
                <span>Incoming Queue</span>
                <span className="tab-count warning">{summary?.unaccepted_count ?? 0}</span>
              </button>
              {stages.map(s => {
                const stageCount = summary?.statuses?.[s] ?? leads.filter(l => l.status === s).length;
                return (
                  <button
                    key={s}
                    type="button"
                    className={`leads-stage-tab ${!unclaimedOnly && stage === s ? 'active' : ''}`}
                    onClick={() => { setUnclaimedOnly(false); setStage(stage === s ? '' : s); setLeadPage(1); }}
                  >
                    <span className={`stage-dot stage-${s}`}/>
                    <span>{titleCase(s)}</span>
                    <span className="tab-count">{stageCount}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {page === 'Leads' && unclaimedOnly && (
          <div className="info-strip" style={{ marginBottom: 14 }}>
            <AlertCircle size={17} color="#16A34A"/>
            <div>
              <strong>Incoming &amp; Unclaimed Leads Queue</strong>
              <p>These leads have not been accepted yet. Click <strong>Accept</strong> on any lead to claim it and assign yourself as the active agent.</p>
            </div>
            <button className="text-button" onClick={() => setUnclaimedOnly(false)}>Back to all leads →</button>
          </div>
        )}
        {filterBar}
        {leadTable}
        <div className="table-footer">
          <span>{total ? `${(leadPage - 1) * 10 + 1}–${Math.min(leadPage * 10, total)} of ${total} leads` : 'No leads yet'}</span>
          <div>
            <button className="icon-button" aria-label="Previous page" disabled={leadPage === 1} onClick={() => setLeadPage(p => p - 1)}><ChevronLeft size={16}/></button>
            <span>Page {leadPage}</span>
            <button className="icon-button" aria-label="Next page" disabled={leadPage * 10 >= total} onClick={() => setLeadPage(p => p + 1)}><ChevronRight size={16}/></button>
          </div>
        </div>
      </section>
    )}
    {page === 'Pipeline' && <>
      {filterBar}
      <div className="kanban-header-bar">
        <div className="kanban-summary-pills">
          <span className="kanban-summary-pill">
            <strong>{displayedLeads.length}</strong> {me?.role === 'agent' ? 'My Assigned Leads' : (agentFilter ? `Leads (${members.find(m => m.id === agentFilter)?.name || 'Agent'})` : 'Total Leads')}
          </span>
          {stages.map(s => {
            const count = displayedLeads.filter(l => l.status === s).length;
            return (
              <span key={s} className="kanban-summary-pill">
                <span className={`stage-dot stage-${s}`}/>
                <span>{titleCase(s)}:</span>
                <strong>{count}</strong>
              </span>
            );
          })}
        </div>
        <div className="kanban-drag-tip">
          <Sparkles size={14}/>
          <span>Drag cards between columns or use the quick stage option below</span>
        </div>
      </div>
      <div className={`kanban ${draggingLeadId ? 'is-dragging-active' : ''}`} role="region" aria-label="Sales and Lead Pipeline Board">
        {stages.map(s => {
          const colLeads = displayedLeads.filter(l => l.status === s);
          const isOver = dragOverStage === s;
          return (
            <section
              className={`kanban-column kanban-col-${s} ${isOver ? 'is-drag-over' : ''}`}
              key={s}
              onDragOver={e => handleDragOverColumn(e, s)}
              onDragEnter={e => {
                e.preventDefault();
                if (dragOverStage !== s) setDragOverStage(s);
              }}
              onDrop={e => handleDropOnColumn(e, s)}
            >
              <header className="kanban-column-header">
                <div className="kanban-column-title">
                  <span className={`stage-dot stage-${s}`}/>
                  <span>{titleCase(s)}</span>
                </div>
                <span className="kanban-col-badge">{colLeads.length}</span>
              </header>
              <div
                className="kanban-cards-list"
                onDragOver={e => handleDragOverColumn(e, s)}
                onDrop={e => handleDropOnColumn(e, s)}
              >
                {colLeads.map(lead => (
                  <article
                    className={`kanban-card kanban-card-${s} ${draggingLeadId === lead.id ? 'is-dragging' : ''}`}
                    key={lead.id}
                    draggable={canWrite}
                    onDragStart={e => handleCardDragStart(e, lead)}
                    onDragEnd={handleCardDragEnd}
                    onDragOver={e => handleDragOverColumn(e, s)}
                    onDrop={e => handleDropOnColumn(e, s)}
                  >
                    <div className="kanban-card-header">
                      <div className="kanban-card-title-row">
                        {canWrite && (
                          <span className="kanban-drag-handle" title="Drag to move stage" aria-hidden="true">
                            <GripVertical size={14}/>
                          </span>
                        )}
                        <div
                          className="kanban-contact-btn"
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (!isDraggingRef.current) {
                              showDetail(lead);
                            }
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              showDetail(lead);
                            }
                          }}
                          title={`View details for ${lead.full_name}`}
                        >
                          <span className="avatar small">{initials(lead.full_name)}</span>
                          <span className="kanban-name">{lead.full_name}</span>
                        </div>
                      </div>
                      <Badge value={lead.priority}/>
                    </div>

                    {lead.company_name && (
                      <div className="kanban-company">
                        <Building2 size={13}/>
                        <span>{lead.company_name}</span>
                      </div>
                    )}

                    <div className="kanban-contact-snippets">
                      {lead.phone && (
                        <a
                          href={`tel:${lead.phone.replace(/[^0-9+]/g, '')}`}
                          className="contact-chip contact-chip-clickable"
                          title={`Call ${lead.phone}`}
                          onClick={e => e.stopPropagation()}
                        >
                          <Phone size={12}/>
                          <span>{lead.phone}</span>
                        </a>
                      )}
                      {lead.email && (
                        <a
                          href={`mailto:${lead.email}`}
                          className="contact-chip contact-chip-clickable"
                          title={`Email ${lead.email}`}
                          onClick={e => e.stopPropagation()}
                        >
                          <Mail size={12}/>
                          <span>{lead.email}</span>
                        </a>
                      )}
                    </div>

                    {lead.inquiry_type && (
                      <div className="kanban-inquiry">
                        <span className="inquiry-pill">{lead.inquiry_type}</span>
                      </div>
                    )}

                    {lead.next_follow_up_at && (
                      <div className={`kanban-followup ${new Date(lead.next_follow_up_at) < new Date() ? 'overdue' : ''}`}>
                        <Clock3 size={12}/>
                        <span>{new Date(lead.next_follow_up_at) < new Date() ? 'Overdue: ' : 'Follow-up: '}{formatDate(lead.next_follow_up_at)}</span>
                      </div>
                    )}

                    <div className="kanban-agent-bar">
                      <span className="kanban-agent-label-prefix">Agent:</span>
                      {isAdmin ? (
                        <div
                          className="kanban-agent-select-wrap"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => e.stopPropagation()}
                        >
                          <select
                            className={`kanban-agent-select ${!lead.assigned_to ? 'unassigned' : ''}`}
                            value={lead.assigned_to || ''}
                            aria-label={`Assigned agent for ${lead.full_name}`}
                            title={lead.assigned_to ? `Assigned to ${members.find(m => m.id === lead.assigned_to)?.name || 'Agent'} · Click to reassign` : 'Click to assign an agent'}
                            disabled={busy}
                            onChange={e => {
                              e.stopPropagation();
                              assignLeadAgent(lead.id, e.target.value, lead.full_name);
                            }}
                          >
                            <option value="">
                              {lead.accepted_by === null ? '⚡ Awaiting Claim' : '— Unassigned —'}
                            </option>
                            {members.filter(m => m.role !== 'viewer').map(m => (
                              <option key={m.id} value={m.id}>
                                {m.name}{m.role === 'admin' ? ' (Admin)' : ''}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={10} className="kanban-agent-select-arrow" aria-hidden="true" />
                        </div>
                      ) : (
                        <span className={`kanban-agent-chip ${!lead.assigned_to ? 'unassigned' : ''}`}>
                          {lead.assigned_to && members.find(m => m.id === lead.assigned_to)?.name ? (
                            <>
                              <span className="kanban-agent-dot" />
                              <span>{members.find(m => m.id === lead.assigned_to)?.name}</span>
                            </>
                          ) : (
                            <>
                              <Zap size={10} fill="currentColor" />
                              <span>Awaiting Claim</span>
                            </>
                          )}
                        </span>
                      )}
                    </div>

                    <div className="kanban-card-footer">
                      <span className="source-label-small">
                        {lead.source === 'website' ? <Globe2 size={12}/> : lead.source === 'manual' ? <UsersRound size={12}/> : <FileSpreadsheet size={12}/>}
                        {titleCase(lead.source)}
                      </span>
                      {canWrite && (
                        <div
                          className="kanban-stage-selector"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => e.stopPropagation()}
                        >
                          <label htmlFor={`stage-select-${lead.id}`} className="sr-only">Move {lead.full_name} stage</label>
                          <select
                            id={`stage-select-${lead.id}`}
                            aria-label={`Move stage for ${lead.full_name}`}
                            value={lead.status}
                            onChange={e => moveLeadStage(lead.id, e.target.value)}
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => e.stopPropagation()}
                          >
                            {stages.map(st => (
                              <option key={st} value={st}>
                                → {titleCase(st)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
                {!colLeads.length && (
                  <div
                    className="kanban-column-empty"
                    onDragOver={e => handleDragOverColumn(e, s)}
                    onDrop={e => handleDropOnColumn(e, s)}
                  >
                    <div className="kanban-empty-drop-target">
                      <ArrowDownToLine size={20} className="kanban-empty-icon"/>
                      <span className="kanban-empty-title">Drop leads here</span>
                      <span className="kanban-empty-sub">Move into {titleCase(s)}</span>
                    </div>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <div className="table-footer">
        <span>{displayedLeads.length} matching leads</span>
        <div>
          <Button secondary disabled={leadPage === 1} onClick={() => setLeadPage(p => p - 1)}>Previous</Button>
          <Button secondary disabled={leadPage * 100 >= displayedLeads.length} onClick={() => setLeadPage(p => p + 1)}>Next</Button>
        </div>
      </div>
    </>}
    {page === 'Websites' && (() => {
      const activeCount = websites.filter(w => w.status === 'active').length;
      const pausedCount = websites.filter(w => w.status === 'paused').length;
      const webLeadsCount = leads.filter(l => l.source === 'website').length;

      const filteredWebsites = websites.filter(w => {
        if (websiteStatusFilter !== 'all' && w.status !== websiteStatusFilter) return false;
        if (websiteSearch) {
          const q = websiteSearch.toLowerCase();
          const matchName = w.name?.toLowerCase().includes(q);
          const matchDomain = w.domain?.toLowerCase().includes(q);
          if (!matchName && !matchDomain) return false;
        }
        return true;
      });

      return (
        <div className="websites-container">
          <div className="websites-overview-strip">
            <div className="website-stat-card">
              <span className="website-stat-icon blue"><Globe2 size={22}/></span>
              <div className="website-stat-info">
                <strong>{websites.length}</strong>
                <span>Registered Sites</span>
              </div>
            </div>
            <div className="website-stat-card">
              <span className="website-stat-icon green"><Activity size={22}/></span>
              <div className="website-stat-info">
                <strong>{activeCount}</strong>
                <span>Active Integrations</span>
              </div>
            </div>
            <div className="website-stat-card">
              <span className="website-stat-icon purple"><UsersRound size={22}/></span>
              <div className="website-stat-info">
                <strong>{webLeadsCount}</strong>
                <span>Leads Ingested</span>
              </div>
            </div>
            <div className="website-stat-card">
              <span className="website-stat-icon amber"><ShieldCheck size={22}/></span>
              <div className="website-stat-info">
                <strong>API Keys Active</strong>
                <span>Secured Ingest</span>
              </div>
            </div>
          </div>

          <div className="websites-toolbar-panel">
            <div className="websites-toolbar-left">
              <div className="search" style={{ minWidth: 260 }}>
                <Search size={15}/>
                <input
                  aria-label="Search websites"
                  placeholder="Search websites or domains…"
                  value={websiteSearch}
                  onChange={e => setWebsiteSearch(e.target.value)}
                />
                {websiteSearch && (
                  <button
                    type="button"
                    className="icon-button"
                    style={{ width: 22, height: 22 }}
                    onClick={() => setWebsiteSearch('')}
                    aria-label="Clear search"
                  >
                    <X size={13}/>
                  </button>
                )}
              </div>
              <div className="website-filter-tabs">
                <button
                  type="button"
                  className={`website-filter-tab ${websiteStatusFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setWebsiteStatusFilter('all')}
                >
                  All Sites ({websites.length})
                </button>
                <button
                  type="button"
                  className={`website-filter-tab ${websiteStatusFilter === 'active' ? 'active' : ''}`}
                  onClick={() => setWebsiteStatusFilter('active')}
                >
                  <span className="pulse-dot" style={{ width: 6, height: 6, background: '#059669' }}/>
                  Active ({activeCount})
                </button>
                <button
                  type="button"
                  className={`website-filter-tab ${websiteStatusFilter === 'paused' ? 'active' : ''}`}
                  onClick={() => setWebsiteStatusFilter('paused')}
                >
                  Paused ({pausedCount})
                </button>
              </div>
            </div>
            {isAdmin && (
              <Button
                onClick={() => {
                  setEditingSite(null);
                  setSiteForm({ name: '', domain: '', status: 'active', field_mapping: '{\n  "your-name": "full_name",\n  "your-email": "email",\n  "your-phone": "phone"\n}', assigned_to: '' });
                  setWebsiteModal(true);
                }}
              >
                <Plus size={16}/> Connect Website
              </Button>
            )}
          </div>

          <div className="website-grid">
            {filteredWebsites.map(w => {
              const defaultAgent = members.find(m => m.id === w.config?.assigned_to);
              const mappedCount = Object.keys(w.config?.field_mapping || {}).length;
              const siteLeadsCount = leads.filter(l => l.website_id === w.id).length;
              const ingestUrl = `${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/api/v1/public/leads`;

              return (
                <section className="website-card-elevated" key={w.id}>
                  <div>
                    <div className="website-card-top-row">
                      <div className="website-identity">
                        <span className="website-avatar">
                          <Globe2 size={24}/>
                        </span>
                        <div className="website-heading-col">
                          <h3>{w.name}</h3>
                          <a
                            href={`https://${w.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="website-domain-badge"
                            title={`Visit https://${w.domain}`}
                          >
                            <span>{w.domain}</span>
                            <ExternalLink size={11}/>
                          </a>
                        </div>
                      </div>
                      <Badge value={w.status}/>
                    </div>

                    <div className="website-micro-stats" style={{ marginTop: 18 }}>
                      <div className="micro-stat-item">
                        <span>Default Agent</span>
                        <strong>{defaultAgent?.name || 'Unassigned'}</strong>
                      </div>
                      <div className="micro-stat-item">
                        <span>Form Mappings</span>
                        <strong>{mappedCount} {mappedCount === 1 ? 'field' : 'fields'}</strong>
                      </div>
                      <div className="micro-stat-item">
                        <span>Leads Captured</span>
                        <strong>{siteLeadsCount}</strong>
                      </div>
                    </div>

                    <div className="website-endpoint-box" style={{ marginTop: 14 }}>
                      <div>
                        <span style={{ color: '#94A3B8', fontSize: 10, display: 'block', marginBottom: 2 }}>Public Ingest Endpoint:</span>
                        <code>POST /api/v1/public/leads</code>
                      </div>
                      <button
                        type="button"
                        className="endpoint-copy-btn"
                        onClick={async () => {
                          await navigator.clipboard.writeText(ingestUrl);
                          setToast('Ingest URL copied');
                        }}
                        title="Copy full ingest endpoint URL"
                      >
                        <Copy size={11}/> Copy URL
                      </button>
                    </div>
                  </div>

                  <div className="website-card-actions">
                    <div className="website-card-actions-left">
                      {isAdmin && (
                        <Button
                          secondary
                          onClick={() => {
                            setEditingSite(w);
                            setSiteForm({
                              name: w.name,
                              domain: w.domain,
                              status: w.status,
                              field_mapping: JSON.stringify(w.config?.field_mapping || {}, null, 2),
                              assigned_to: w.config?.assigned_to || ''
                            });
                            setWebsiteModal(true);
                          }}
                        >
                          <Settings2 size={14}/> Configure
                        </Button>
                      )}
                      <Button
                        secondary
                        onClick={() => setIntegrationGuideSite(w)}
                        title="View ready-to-use cURL, JS, and HTML integration snippets"
                      >
                        <Code size={14}/> Integration Code
                      </Button>
                    </div>

                    {isAdmin && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            if (confirm(`Rotate the API key for ${w.name}? The previous key will stop working immediately.`)) {
                              perform(async () => {
                                const result: any = await api(`/websites/${w.id}/rotate-key`, send({}));
                                setSecret(result.key);
                              });
                            }
                          }}
                          title="Generate a new API key for this website"
                        >
                          <KeyRound size={12}/> Rotate key
                        </button>
                        <button
                          type="button"
                          className="text-button danger-text"
                          onClick={() => {
                            if (confirm(`Revoke all API credentials for ${w.name}? Ingested leads will be rejected until a new key is issued.`)) {
                              perform(async () => {
                                await api(`/websites/${w.id}/key`, { method: 'DELETE' });
                                setToast('Credential revoked');
                              });
                            }
                          }}
                          title="Revoke website key"
                        >
                          <Trash2 size={12}/> Revoke
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          {!filteredWebsites.length && (
            <section className="panel">
              <Empty
                title={websiteSearch ? "No matching websites" : "Let your websites do the introductions"}
                text={websiteSearch ? `No connected websites match "${websiteSearch}".` : "Register your first website, configure form field mappings, and issue an API key for your frontend forms."}
                action={isAdmin && (
                  <Button
                    onClick={() => {
                      setEditingSite(null);
                      setSiteForm({ name: '', domain: '', status: 'active', field_mapping: '{\n  "your-name": "full_name",\n  "your-email": "email",\n  "your-phone": "phone"\n}', assigned_to: '' });
                      setWebsiteModal(true);
                    }}
                    style={{ marginTop: 12 }}
                  >
                    <Plus size={16}/> Connect your first website
                  </Button>
                )}
              />
            </section>
          )}
        </div>
      );
    })()}
    {page === 'Imports' && (
      <div className="imports-container">
        <section className="panel import-panel-elevated">
          <div className="import-stepper-bar">
            {[
              { num: 1, label: 'Upload File' },
              { num: 2, label: 'Map Columns' },
              { num: 3, label: 'Validate & Preview' },
              { num: 4, label: 'Results' }
            ].map(step => {
              const isCurrent = importStep === step.num;
              const isPast = importStep > step.num;
              return (
                <div key={step.num} className={`import-step-item ${isCurrent ? 'active' : ''} ${isPast ? 'completed' : ''}`}>
                  <span className="step-num-circle">
                    {isPast ? <Check size={14}/> : step.num}
                  </span>
                  <span>{step.label}</span>
                </div>
              );
            })}
          </div>

          {!canWrite ? (
            <div style={{ padding: 40 }}>
              <Empty title="View-only access" text="An agent or administrator can import leads into the CRM."/>
            </div>
          ) : importStep === 1 ? (
            <div style={{ padding: '24px 28px' }}>
              <div
                className={`upload-dropzone-elevated ${isDraggingFile ? 'is-dragover' : ''}`}
                onDragOver={e => { e.preventDefault(); setIsDraggingFile(true); }}
                onDragLeave={e => { e.preventDefault(); setIsDraggingFile(false); }}
                onDrop={e => {
                  e.preventDefault();
                  setIsDraggingFile(false);
                  const droppedFile = e.dataTransfer.files?.[0];
                  if (droppedFile) setFile(droppedFile);
                }}
              >
                <span className="upload-dropzone-icon">
                  <UploadCloud size={36}/>
                </span>

                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px 0', color: 'var(--ink)' }}>
                    Drop your spreadsheet here, or browse
                  </h2>
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, maxWidth: 460 }}>
                    Upload contacts from CSV or Excel (XLSX). We’ll guide you through mapping headers, validating emails and phones, and skipping duplicates.
                  </p>
                </div>

                {file ? (
                  <div className="file-selected-card">
                    <div className="file-selected-left">
                      <span className="file-badge-icon"><FileSpreadsheet size={20}/></span>
                      <div className="file-meta-col">
                        <strong>{file.name}</strong>
                        <small>{(file.size / 1024).toFixed(1)} KB · {file.name.endsWith('.xlsx') ? 'Excel Workbook' : 'CSV Spreadsheet'}</small>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Remove selected file"
                      onClick={() => setFile(null)}
                      title="Choose a different file"
                    >
                      <X size={16}/>
                    </button>
                  </div>
                ) : (
                  <label className="button" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={16}/> Select CSV or Excel File
                    <input
                      type="file"
                      accept=".csv,.xlsx"
                      style={{ display: 'none' }}
                      onChange={e => setFile(e.target.files?.[0] || null)}
                    />
                  </label>
                )}

                <div className="upload-spec-chips">
                  <span className="upload-spec-chip">.csv or .xlsx</span>
                  <span className="upload-spec-chip">Up to 5 MB</span>
                  <span className="upload-spec-chip">Max 2,000 rows</span>
                  <span className="upload-spec-chip">Duplicate detection</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px 12px 28px', flexWrap: 'wrap', gap: 14 }}>
                <a
                  className="button secondary"
                  href="/sample-leads.csv"
                  download="timely-sample-leads.csv"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <ArrowDownToLine size={15}/> Download Sample CSV Template
                </a>

                <Button
                  disabled={!file || busy}
                  onClick={inspectFile}
                  style={{ minWidth: 150 }}
                >
                  {busy ? <LoaderCircle className="spin" size={16}/> : <>Continue to Mapping <ArrowRight size={16}/></>}
                </Button>
              </div>
            </div>
          ) : importStep === 2 ? (
            <div className="mapping-content">
              <div className="mapping-header-bar">
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px 0', color: 'var(--ink)' }}>
                    Match your spreadsheet columns to CRM fields
                  </h2>
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
                    File: <strong>{file?.name}</strong> · <strong>{inspection?.total_rows}</strong> rows detected · Only <strong>Full Name</strong> is required.
                  </p>
                </div>

                {inspection?.headers && (
                  <Button
                    secondary
                    onClick={() => autoMatchColumns(inspection.headers)}
                    title="Automatically detect columns using header names"
                  >
                    <Sparkles size={14}/> Auto-match columns
                  </Button>
                )}
              </div>

              <div className="mapping-grid">
                {[
                  { field: 'full_name', label: 'Full Name', required: true, icon: UsersRound },
                  { field: 'email', label: 'Email Address', required: false, icon: Mail },
                  { field: 'phone', label: 'Phone Number', required: false, icon: Phone },
                  { field: 'company_name', label: 'Company / Clinic', required: false, icon: Building2 },
                  { field: 'inquiry_type', label: 'Business Type', required: false, icon: Target },
                  { field: 'priority', label: 'Priority Level', required: false, icon: Zap }
                ].map(({ field, label, required, icon: Icon }) => {
                  const mappedHeader = mapping[field];
                  const sampleVal = mappedHeader ? inspection?.samples?.[0]?.[mappedHeader] : null;

                  return (
                    <div className="mapping-card-item" key={field}>
                      <div className="mapping-card-top">
                        <span className="mapping-field-label">
                          <Icon size={14} color="#2563EB"/>
                          <span>{label}</span>
                          {required && <span style={{ color: '#DC2626', fontWeight: 700 }}>*</span>}
                        </span>
                        {required && <span className="badge new" style={{ fontSize: 9, padding: '2px 6px' }}>Required</span>}
                      </div>

                      <select
                        value={mapping[field] || ''}
                        onChange={e => setMapping({ ...mapping, [field]: e.target.value })}
                        style={{ width: '100%' }}
                      >
                        <option value="">— Skip Column —</option>
                        {inspection?.headers?.map((h: string) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>

                      <div className="mapping-sample-pill" title={sampleVal || 'No value in Row 1'}>
                        {mappedHeader ? (
                          <span>Sample (Row 1): <strong>{sampleVal || 'Empty'}</strong></span>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>Field will not be imported</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="modal-actions" style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between' }}>
                <Button secondary onClick={() => setImportStep(1)}>
                  <ChevronLeft size={16}/> Back to Upload
                </Button>
                <Button
                  disabled={!mapping.full_name || busy}
                  onClick={() => perform(async () => {
                    const body = new FormData();
                    body.append('file', file!);
                    body.append('mapping', JSON.stringify(Object.fromEntries(Object.entries(mapping).filter(([, v]) => v))));
                    const result = await api('/imports/preview', { method: 'POST', body });
                    setPreview(result);
                    setPreviewFilter('all');
                    setImportStep(3);
                  })}
                >
                  {busy ? <LoaderCircle className="spin" size={16}/> : <>Validate &amp; Preview Rows <ArrowRight size={16}/></>}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mapping-content">
              {importStep === 4 ? (
                <div className="import-completion-card">
                  <div className="import-completion-icon">
                    <CheckCircle2 size={44}/>
                  </div>
                  <div>
                    <h2 style={{ fontSize: 24, fontWeight: 750, color: 'var(--ink)', margin: '0 0 6px 0' }}>
                      Import Successfully Completed!
                    </h2>
                    <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
                      <strong>{preview?.counts?.imported ?? 0}</strong> leads were successfully imported into your workspace directory.
                    </p>
                  </div>

                  <div className="import-metric-pill-cards" style={{ maxWidth: 640, width: '100%', margin: '14px 0' }}>
                    <div className="import-metric-pill-card valid">
                      <strong>{preview?.counts?.imported ?? 0}</strong>
                      <span>Leads Imported</span>
                    </div>
                    <div className="import-metric-pill-card duplicate">
                      <strong>{preview?.counts?.duplicate ?? 0}</strong>
                      <span>Duplicates Skipped</span>
                    </div>
                    <div className="import-metric-pill-card failed">
                      <strong>{preview?.counts?.failed ?? 0}</strong>
                      <span>Invalid Rows</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                    <Button
                      onClick={() => {
                        setImportStep(1);
                        setFile(null);
                        setPreview(null);
                        changePage('Leads');
                      }}
                    >
                      View Imported Leads in Directory <ArrowRight size={16}/>
                    </Button>
                    <Button
                      secondary
                      onClick={() => {
                        setImportStep(1);
                        setFile(null);
                        setPreview(null);
                      }}
                    >
                      Start Another Import
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mapping-header-bar">
                    <div>
                      <h2 style={{ fontSize: 20, fontWeight: 750, margin: '0 0 4px 0', color: 'var(--ink)' }}>
                        Validation Preview &amp; Pre-Import Inspection
                      </h2>
                      <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
                        Review the parsed data before committing to the database. Duplicates will be safely skipped.
                      </p>
                    </div>
                  </div>

                  <div className="import-metric-pill-cards">
                    <div className="import-metric-pill-card valid">
                      <strong>{preview?.counts?.valid ?? 0}</strong>
                      <span>Ready to Import</span>
                    </div>
                    <div className="import-metric-pill-card duplicate">
                      <strong>{preview?.counts?.duplicate ?? 0}</strong>
                      <span>Duplicate Warnings</span>
                    </div>
                    <div className="import-metric-pill-card failed">
                      <strong>{preview?.counts?.failed ?? 0}</strong>
                      <span>Invalid Rows (Will Skip)</span>
                    </div>
                  </div>

                  {(() => {
                    const filteredRows = (preview?.rows || []).filter((row: any) => {
                      if (previewFilter === 'valid') return row.status === 'valid';
                      if (previewFilter === 'duplicate') return row.status === 'duplicate';
                      if (previewFilter === 'failed') return row.status === 'failed' || row.status === 'invalid';
                      return true;
                    });

                    return (
                      <>
                        <div className="preview-table-filter-bar">
                          <div className="website-filter-tabs">
                            <button
                              type="button"
                              className={`website-filter-tab ${previewFilter === 'all' ? 'active' : ''}`}
                              onClick={() => setPreviewFilter('all')}
                            >
                              All Rows ({preview?.rows?.length || 0})
                            </button>
                            <button
                              type="button"
                              className={`website-filter-tab ${previewFilter === 'valid' ? 'active' : ''}`}
                              onClick={() => setPreviewFilter('valid')}
                            >
                              Ready ({preview?.counts?.valid || 0})
                            </button>
                            <button
                              type="button"
                              className={`website-filter-tab ${previewFilter === 'duplicate' ? 'active' : ''}`}
                              onClick={() => setPreviewFilter('duplicate')}
                            >
                              Duplicates ({preview?.counts?.duplicate || 0})
                            </button>
                            <button
                              type="button"
                              className={`website-filter-tab ${previewFilter === 'failed' ? 'active' : ''}`}
                              onClick={() => setPreviewFilter('failed')}
                            >
                              Invalid ({preview?.counts?.failed || 0})
                            </button>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                            Showing {filteredRows.length} of {preview?.rows?.length || 0} previewed rows
                          </span>
                        </div>

                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th style={{ width: 70 }}>Row #</th>
                                <th>Full Name</th>
                                <th>Contact Info</th>
                                <th>Result Status</th>
                                <th>Validation Message</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredRows.map((row: any) => (
                                <tr key={row.row_number}>
                                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{row.row_number}</td>
                                  <td><strong>{row.data?.full_name || '—'}</strong></td>
                                  <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
                                      {row.data?.email && <span>{row.data.email}</span>}
                                      {row.data?.phone && <span className="muted">{row.data.phone}</span>}
                                      {!row.data?.email && !row.data?.phone && <span className="muted">—</span>}
                                    </div>
                                  </td>
                                  <td>
                                    <Badge value={row.status === 'valid' ? 'new' : row.status === 'duplicate' ? 'contacted' : 'lost'}/>
                                  </td>
                                  <td style={{ fontSize: 12, color: row.status === 'valid' ? '#059669' : row.status === 'duplicate' ? '#D97706' : '#DC2626' }}>
                                    {row.message || 'Ready to import'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()}

                  <div className="modal-actions" style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <Button secondary onClick={() => setImportStep(2)}>
                        <ChevronLeft size={16}/> Back to Mapping
                      </Button>
                      {preview?.counts?.failed > 0 && (
                        <a
                          className="button secondary"
                          href={`/api/v1/imports/${preview.id}/errors`}
                          title="Download spreadsheet of rows with errors"
                        >
                          <ArrowDownToLine size={15}/> Download Error Report
                        </a>
                      )}
                    </div>

                    <Button
                      disabled={busy || !preview?.counts?.valid}
                      onClick={() => perform(async () => {
                        const committed = await api('/imports/commit', send({ import_job_id: preview.id }));
                        setPreview(committed);
                        setImportStep(4);
                        setToast(`Successfully imported ${committed?.counts?.imported || preview.counts.valid} leads!`);
                        refresh();
                      })}
                    >
                      {busy ? <LoaderCircle className="spin" size={16}/> : <>Commit &amp; Import {preview?.counts?.valid} Valid Leads <Check size={16}/></>}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Batch Import History <span className="count-pill">{jobs.length}</span></h2>
              <p>Historical audit record of all uploaded CSV &amp; Excel lead batches.</p>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Spreadsheet File</th>
                  <th>Upload Date</th>
                  <th>Status</th>
                  <th>Imported</th>
                  <th>Duplicates Skipped</th>
                  <th>Invalid Rows</th>
                  <th style={{ textAlign: 'right', paddingRight: 20 }}>Error Report</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileSpreadsheet size={16} color="#2563EB"/>
                        <strong>{job.filename}</strong>
                      </div>
                    </td>
                    <td>{formatDate(job.created_at)}</td>
                    <td><Badge value={job.status}/></td>
                    <td><strong style={{ color: '#059669' }}>{job.counts?.imported || 0}</strong></td>
                    <td><span className="muted">{job.counts?.duplicate || 0}</span></td>
                    <td>
                      {job.counts?.failed > 0 ? (
                        <span style={{ color: '#DC2626', fontWeight: 600 }}>{job.counts.failed}</span>
                      ) : (
                        <span className="muted">0</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: 20 }}>
                      {job.counts?.failed > 0 ? (
                        <a className="button secondary" style={{ fontSize: 11, padding: '4px 10px', height: 26 }} href={`/api/v1/imports/${job.id}/errors`}>
                          <ArrowDownToLine size={12}/> Errors CSV
                        </a>
                      ) : (
                        <span className="muted" style={{ fontSize: 11 }}>Clean batch</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!jobs.length && (
              <p className="empty-inline" style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)' }}>
                No batch imports recorded yet. Files uploaded above will appear here.
              </p>
            )}
          </div>
        </section>
      </div>
    )}
    {page === 'Follow-ups' && (() => {
      const nowMs = Date.now();
      const todayDateStr = new Date().toDateString();
      const tomorrowMidnight = new Date();
      tomorrowMidnight.setHours(0, 0, 0, 0);
      tomorrowMidnight.setDate(tomorrowMidnight.getDate() + 1);

      const overdueCount = tasks.filter(t => new Date(t.due_at).getTime() < nowMs).length;
      const todayCount = tasks.filter(t => new Date(t.due_at).toDateString() === todayDateStr).length;
      const upcomingCount = tasks.filter(t => new Date(t.due_at).getTime() >= tomorrowMidnight.getTime()).length;

      const filteredTasks = tasks.filter(task => {
        if (taskTab === 'overdue' && new Date(task.due_at).getTime() >= nowMs) return false;
        if (taskTab === 'today' && new Date(task.due_at).toDateString() !== todayDateStr) return false;
        if (taskTab === 'upcoming' && new Date(task.due_at).getTime() < tomorrowMidnight.getTime()) return false;

        if (taskSearch) {
          const q = taskSearch.toLowerCase();
          const titleMatch = task.title?.toLowerCase().includes(q);
          const leadMatch = task.lead_name?.toLowerCase().includes(q);
          const ownerName = members.find(m => m.id === task.assigned_to)?.name?.toLowerCase() || '';
          const ownerMatch = ownerName.includes(q);
          if (!titleMatch && !leadMatch && !ownerMatch) return false;
        }

        if (taskOwnerFilter) {
          if (taskOwnerFilter === 'unassigned' && task.assigned_to) return false;
          if (taskOwnerFilter !== 'unassigned' && task.assigned_to !== taskOwnerFilter) return false;
        }

        return true;
      });

      filteredTasks.sort((a, b) => {
        if (taskSort === 'due_asc') return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
        if (taskSort === 'due_desc') return new Date(b.due_at).getTime() - new Date(a.due_at).getTime();
        if (taskSort === 'name_asc') return (a.lead_name || '').localeCompare(b.lead_name || '');
        return 0;
      });

      const localTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

      return (
        <div className="followups-page">
          <div className="followups-header">
            <div className="followups-header-left">
              <h1>
                <span>Follow-ups & Next Steps</span>
                <span className="count-pill">{tasks.length}</span>
              </h1>
              <p>Keep healthcare inquiries and clinic conversations moving forward on schedule.</p>
            </div>
            <div className="followups-header-actions">
              <span className="time-zone-pill">
                <Clock3 size={13}/>
                <span>{localTz} · {localTime}</span>
              </span>
              {canWrite && (
                <Button onClick={() => openScheduleFollowUp(undefined, 'Client call & discovery')}>
                  <Plus size={16}/> Schedule follow-up
                </Button>
              )}
            </div>
          </div>

          <div className="followups-metrics-grid">
            <div
              className={`followup-metric-card ${taskTab === 'all' ? 'active' : ''}`}
              onClick={() => setTaskTab('all')}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setTaskTab('all')}
            >
              <div className="followup-metric-info">
                <span className="followup-metric-value">{tasks.length}</span>
                <span className="followup-metric-label">All Open Tasks</span>
                <span className="followup-metric-subtext">Total active commitments</span>
              </div>
              <div className="followup-metric-icon blue">
                <Clock3 size={20}/>
              </div>
            </div>

            <div
              className={`followup-metric-card ${taskTab === 'overdue' ? 'active' : ''}`}
              onClick={() => setTaskTab('overdue')}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setTaskTab('overdue')}
            >
              <div className="followup-metric-info">
                <span className="followup-metric-value" style={{ color: overdueCount > 0 ? '#DC2626' : undefined }}>
                  {overdueCount}
                </span>
                <span className="followup-metric-label">Overdue</span>
                <span className="followup-metric-subtext">
                  {overdueCount > 0 ? 'Requires prompt follow-up' : 'Zero overdue tasks'}
                </span>
              </div>
              <div className="followup-metric-icon red">
                <AlertCircle size={20}/>
              </div>
            </div>

            <div
              className={`followup-metric-card ${taskTab === 'today' ? 'active' : ''}`}
              onClick={() => setTaskTab('today')}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setTaskTab('today')}
            >
              <div className="followup-metric-info">
                <span className="followup-metric-value" style={{ color: todayCount > 0 ? '#D97706' : undefined }}>
                  {todayCount}
                </span>
                <span className="followup-metric-label">Due Today</span>
                <span className="followup-metric-subtext">Today’s schedule</span>
              </div>
              <div className="followup-metric-icon amber">
                <Calendar size={20}/>
              </div>
            </div>

            <div
              className={`followup-metric-card ${taskTab === 'upcoming' ? 'active' : ''}`}
              onClick={() => setTaskTab('upcoming')}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setTaskTab('upcoming')}
            >
              <div className="followup-metric-info">
                <span className="followup-metric-value">{upcomingCount}</span>
                <span className="followup-metric-label">Upcoming</span>
                <span className="followup-metric-subtext">Scheduled ahead</span>
              </div>
              <div className="followup-metric-icon green">
                <Sparkles size={20}/>
              </div>
            </div>
          </div>

          <div className="followups-filter-panel">
            <div className="followup-filter-tabs">
              <button
                type="button"
                className={`followup-tab-button ${taskTab === 'all' ? 'active' : ''}`}
                onClick={() => setTaskTab('all')}
              >
                <span>All Open</span>
                <span className="followup-tab-badge">{tasks.length}</span>
              </button>
              <button
                type="button"
                className={`followup-tab-button ${taskTab === 'overdue' ? 'active' : ''}`}
                onClick={() => setTaskTab('overdue')}
              >
                <span>Overdue</span>
                <span className={`followup-tab-badge ${overdueCount > 0 ? 'danger' : ''}`}>
                  {overdueCount}
                </span>
              </button>
              <button
                type="button"
                className={`followup-tab-button ${taskTab === 'today' ? 'active' : ''}`}
                onClick={() => setTaskTab('today')}
              >
                <span>Due Today</span>
                <span className={`followup-tab-badge ${todayCount > 0 ? 'warning' : ''}`}>
                  {todayCount}
                </span>
              </button>
              <button
                type="button"
                className={`followup-tab-button ${taskTab === 'upcoming' ? 'active' : ''}`}
                onClick={() => setTaskTab('upcoming')}
              >
                <span>Upcoming</span>
                <span className="followup-tab-badge">{upcomingCount}</span>
              </button>
            </div>

            <div className="followups-filter-tools">
              <div className="followup-search-wrap">
                <Search size={15} className="search-icon"/>
                <input
                  type="text"
                  className="followup-search-input"
                  placeholder="Search follow-ups or leads…"
                  value={taskSearch}
                  onChange={e => setTaskSearch(e.target.value)}
                />
                {taskSearch && (
                  <button
                    type="button"
                    className="followup-search-clear"
                    onClick={() => setTaskSearch('')}
                    aria-label="Clear search"
                  >
                    <X size={13}/>
                  </button>
                )}
              </div>

              <select
                className="followup-select"
                value={taskOwnerFilter}
                onChange={e => setTaskOwnerFilter(e.target.value)}
                aria-label="Filter by owner"
              >
                <option value="">All Owners</option>
                <option value="unassigned">Unassigned</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>

              <select
                className="followup-select"
                value={taskSort}
                onChange={e => setTaskSort(e.target.value as any)}
                aria-label="Sort order"
              >
                <option value="due_asc">Soonest due first</option>
                <option value="due_desc">Latest due first</option>
                <option value="name_asc">Lead name A–Z</option>
              </select>
            </div>
          </div>

          <div className="followups-panel">
            {filteredTasks.length > 0 ? (
              <div className="followup-list">
                {filteredTasks.map(task => {
                  const lead = leads.find(l => l.id === task.lead_id);
                  const owner = members.find(m => m.id === task.assigned_to);
                  const urgency = getTaskUrgency(task.due_at);
                  const cardBorderClass = urgency.type === 'overdue' ? 'is-overdue' : urgency.type === 'today' ? 'is-today' : 'is-upcoming';

                  return (
                    <div className={`followup-card ${cardBorderClass}`} key={task.id}>
                      <div className="followup-left">
                        <button
                          className="followup-check-btn"
                          disabled={!canWrite || busy}
                          title="Mark follow-up as completed"
                          aria-label={`Mark completed: ${task.title}`}
                          onClick={() => completeTask(task.id, task.title)}
                        >
                          <Check size={16}/>
                        </button>
                        <div className="followup-details">
                          <h3 className="followup-title">{task.title}</h3>
                          <div className="followup-meta-row">
                            <button
                              type="button"
                              className="followup-lead-btn"
                              title="Inspect lead profile & history"
                              onClick={() => showDetail({ id: task.lead_id, full_name: task.lead_name } as any)}
                            >
                              <span className="followup-lead-avatar">{initials(task.lead_name || 'L')}</span>
                              <span>{task.lead_name || 'View Lead'}</span>
                            </button>
                            {lead?.company_name && (
                              <span className="followup-company-chip">
                                <Building2 size={12}/>
                                <span>{lead.company_name}</span>
                              </span>
                            )}
                            <span className="followup-owner-chip">
                              <UsersRound size={12}/>
                              <span>{owner?.name || 'Unassigned'}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="followup-right">
                        <span className={`urgency-badge ${urgency.type}`}>
                          {urgency.type === 'overdue' ? <AlertCircle size={13}/> : urgency.type === 'today' ? <Calendar size={13}/> : <Clock3 size={13}/>}
                          {urgency.label}
                        </span>
                        <div className="followup-actions">
                          {canWrite && (
                            <button
                              type="button"
                              className="task-action-button primary"
                              title="Mark follow-up as completed"
                              disabled={busy}
                              onClick={() => completeTask(task.id, task.title)}
                            >
                              <Check size={13}/> Done
                            </button>
                          )}
                          <button
                            type="button"
                            className="task-action-button secondary"
                            title="Open lead details"
                            onClick={() => showDetail({ id: task.lead_id, full_name: task.lead_name } as any)}
                          >
                            <Eye size={13}/> Lead
                          </button>
                          {canWrite && (
                            <>
                              <button
                                type="button"
                                className="task-action-button secondary"
                                title="Reschedule to another time"
                                disabled={busy}
                                onClick={() => openRescheduleModal(task)}
                              >
                                <Calendar size={13}/> Reschedule
                              </button>
                              <button
                                type="button"
                                className="task-action-button subtle"
                                title="Quick postpone by +1 day"
                                disabled={busy}
                                onClick={() => quickPostpone(task, 1)}
                              >
                                +1d
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="followups-empty">
                <div className={`followups-empty-icon ${taskTab === 'overdue' || !tasks.length ? 'green' : ''}`}>
                  {taskTab === 'overdue' ? <CheckCircle2 size={30}/> : <Sparkles size={28}/>}
                </div>
                <h3>
                  {taskTab === 'overdue'
                    ? 'Zero overdue tasks!'
                    : taskTab === 'today'
                    ? 'No follow-ups due today'
                    : taskTab === 'upcoming'
                    ? 'No upcoming follow-ups scheduled'
                    : taskSearch || taskOwnerFilter
                    ? 'No follow-ups match your filters'
                    : 'All caught up!'}
                </h3>
                <p>
                  {taskTab === 'overdue'
                    ? 'Great job keeping client communications on track. There are no overdue commitments.'
                    : taskTab === 'today'
                    ? 'You have completed all scheduled follow-ups for today.'
                    : taskTab === 'upcoming'
                    ? 'Schedule a future check-in or client touchpoint anytime.'
                    : taskSearch || taskOwnerFilter
                    ? 'Try adjusting your search query or team member filter to find other tasks.'
                    : 'Plan your next client conversation or schedule an introductory discovery call.'}
                </p>
                {canWrite && (
                  <Button onClick={() => openScheduleFollowUp()}>
                    <Plus size={16}/> Schedule a follow-up
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      );
    })()}
    {page === 'Settings' && <><section className="panel settings-profile"><div><span className="eyebrow">ORGANIZATION</span><h2>{me.organization.name}</h2><p>Workspace ID: {me.organization.slug}</p><small>Your access: {me.role}</small><div style={{ marginTop: 12 }}><button type="button" className="button secondary danger-text" style={{ minHeight: 32, fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={handleRevokeAll}><LogOut size={13}/> Revoke all active sessions</button></div></div><ShieldCheck size={44}/></section><section className="panel"><div className="section-heading"><div><h2>The people behind the connections</h2><p>Admins manage integrations. Agents manage leads. Viewers can browse.</p></div>{isAdmin && <Button onClick={() => setMemberModal(true)}><Plus size={16}/> Add teammate</Button>}</div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th>{isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}</tr></thead><tbody>{members.map(m => { const canEdit = isAdmin || m.id === me?.user?.id; return <tr key={m.id}><td><div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span>{m.name}</span>{canEdit && <button type="button" className="icon-button" style={{ width: 22, height: 22, padding: 0, opacity: 0.7 }} title={`Edit ${m.name}'s name`} aria-label={`Edit ${m.name}'s name`} onClick={() => openEditMember(m)}><Pencil size={11}/></button>}</div></td><td><div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span>{m.email}</span>{canEdit && <button type="button" className="icon-button" style={{ width: 22, height: 22, padding: 0, opacity: 0.7 }} title={`Edit ${m.name}'s email`} aria-label={`Edit ${m.name}'s email`} onClick={() => openEditMember(m)}><Pencil size={11}/></button>}</div></td><td><div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Badge value={m.role}/>{isAdmin && <button type="button" className="icon-button" style={{ width: 22, height: 22, padding: 0, opacity: 0.7 }} title={`Edit ${m.name}'s role`} aria-label={`Edit ${m.name}'s role`} onClick={() => openEditMember(m)}><Pencil size={11}/></button>}</div></td><td>{m.membership_status}</td>{isAdmin && <td style={{ textAlign: 'right' }}><button type="button" className="button secondary" style={{ minHeight: 28, padding: '3px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => openEditMember(m)}><Pencil size={12}/> Edit</button></td>}</tr>; })}</tbody></table></div></section>{isAdmin && <section className="panel"><div className="section-heading"><div><h2>Workspace audit trail</h2><p>Sensitive actions, recorded for your organization.</p></div>{logs.length > 0 && <button type="button" className="button secondary danger-text" style={{ minHeight: 32, fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={clearAllAuditLogs} title="Clear all recorded audit logs"><Trash2 size={13}/> Clear audit trail</button>}</div><div className="table-wrap"><table><thead><tr><th>Action</th><th>Target</th><th>Time</th></tr></thead><tbody>{logs.map(log => <tr key={log.id}><td><span className="audit-action-chip">{log.action}</span></td><td className="mono">{log.target}</td><td>{formatDate(log.created_at)}</td></tr>)}</tbody></table>{!logs.length && <p className="empty-inline">Administrative activity will appear here.</p>}</div></section>}</>}
    <footer className="workspace-footer"><span><span className="live-dot"/> A little more connected, every day.</span><span>Timely CRM <span className="footer-dot">·</span> Your team’s shared perspective</span></footer></div></main>
    {toast && <div role="status" className="toast"><Check size={17}/>{toast}</div>}
    {busy && <div className="busy-indicator"><LoaderCircle className="spin" size={18}/></div>}
    {canWrite && hasUnclaimed && (
      <div className="claim-floating-popup" role="status" aria-live="polite">
        <div className="claim-floating-pulse">
          <Zap size={15} fill="currentColor" />
        </div>
        <div className="claim-floating-body">
          <strong>{unclaimedCount} {unclaimedCount === 1 ? 'lead' : 'leads'} awaiting claim</strong>
          <span>Incoming inquiry ready to assign</span>
        </div>
        <button
          type="button"
          className="claim-floating-btn"
          onClick={claimNextLead}
          disabled={busy}
          title="Claim next incoming lead for yourself"
        >
          <Zap size={13} fill="currentColor" />
          <span>Claim Lead</span>
        </button>
      </div>
    )}
    {leadModal && <Modal title={selected ? (selected.accepted_by ? `Edit lead · Accepted by ${members.find(m => m.id === selected.accepted_by)?.name || 'Agent'}` : 'Edit lead (Awaiting Claim)') : 'Add Lead'} close={() => setLeadModal(false)}><form onSubmit={saveLead} className="consult-form">{!selected && <p className="consult-subtitle">Fill in the details below and we'll be in touch shortly.</p>}<div className="consult-grid"><label className="consult-field"><span className="consult-label">NAME <span className="required">*</span></span><div className="consult-input-wrap"><svg className="consult-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><input required placeholder="Your full name" type="text" value={leadForm.full_name} onChange={e => setLeadForm({ ...leadForm, full_name: e.target.value })}/></div></label><label className="consult-field"><span className="consult-label">BUSINESS NAME <span className="required">*</span></span><div className="consult-input-wrap"><svg className="consult-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="8" x2="16" y1="10" y2="10"/><line x1="8" x2="12" y1="14" y2="14"/></svg><input required placeholder="Your clinic or business name" type="text" value={leadForm.company_name} onChange={e => setLeadForm({ ...leadForm, company_name: e.target.value })}/></div></label><label className="consult-field"><span className="consult-label">PHONE NUMBER <span className="required">*</span></span><div className="consult-input-wrap"><svg className="consult-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.58 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.56a16 16 0 0 0 5.37 5.37l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg><input required placeholder="+91 9000000000" type="tel" value={leadForm.phone} onChange={e => setLeadForm({ ...leadForm, phone: e.target.value })}/></div></label><label className="consult-field"><span className="consult-label">EMAIL ADDRESS <span className="required">*</span></span><div className="consult-input-wrap"><svg className="consult-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg><input required placeholder="you@yourbusiness.com" type="email" value={leadForm.email} onChange={e => setLeadForm({ ...leadForm, email: e.target.value })}/></div></label><label className="consult-field"><span className="consult-label">BUSINESS TYPE <span className="required">*</span></span><div className="consult-select-wrap"><select required value={leadForm.inquiry_type} onChange={e => setLeadForm({ ...leadForm, inquiry_type: e.target.value })}><option value="">Select business type</option>{['Clinic / Hospital', 'Pharmacy', 'Diagnostic Lab', 'Wellness Centre', 'Dental Practice', 'Physiotherapy', 'Ayurveda / Naturopathy', 'Other Healthcare'].map(v => <option key={v} value={v}>{v}</option>)}</select></div></label><label className="consult-field"><span className="consult-label">WHAT ARE YOU LOOKING FOR? <span className="required">*</span></span><div className="consult-select-wrap"><select required value={leadForm.tags} onChange={e => setLeadForm({ ...leadForm, tags: e.target.value })}><option value="">Select a service</option>{['Website Design', 'SEO & Content', 'Social Media Marketing', 'Google Ads', 'Patient Engagement', 'Reputation Management', 'Full Digital Package', 'Other'].map(v => <option key={v} value={v}>{v}</option>)}</select></div></label></div><details className="consult-advanced"><summary>Advanced CRM fields</summary><div className="form-grid" style={{marginTop:'12px'}}><label>Status<select value={leadForm.status} onChange={e => setLeadForm({ ...leadForm, status: e.target.value })}>{stages.map(s => <option key={s}>{s}</option>)}</select></label><label>Priority<select value={leadForm.priority} onChange={e => setLeadForm({ ...leadForm, priority: e.target.value })}>{['low', 'medium', 'high'].map(s => <option key={s}>{s}</option>)}</select></label><label>Assigned Agent<select disabled={Boolean(selected?.accepted_by && !isAdmin)} value={leadForm.assigned_to} onChange={e => setLeadForm({ ...leadForm, assigned_to: e.target.value })}><option value="">Unassigned</option>{members.filter(m => m.role !== 'viewer').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>{selected?.accepted_by && !isAdmin && <small className="muted" style={{ display: 'block', marginTop: 4 }}>🔒 Once accepted, reassigning this lead requires administrator authorization.</small>}</label><label>Website attribution<select value={leadForm.website_id} onChange={e => setLeadForm({ ...leadForm, website_id: e.target.value })}><option value="">No website</option>{websites.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label>Next follow-up<input type="datetime-local" value={leadForm.next_follow_up_at} onChange={e => setLeadForm({ ...leadForm, next_follow_up_at: e.target.value })}/></label><label>Tags (comma-separated)<input type="text" value={leadForm.tags.includes(',') || !['Website Design','SEO & Content','Social Media Marketing','Google Ads','Patient Engagement','Reputation Management','Full Digital Package','Other',''].includes(leadForm.tags) ? leadForm.tags : ''} onChange={e => setLeadForm({ ...leadForm, tags: e.target.value })}/></label></div></details><button type="submit" className="consult-submit" disabled={busy}>{selected ? 'Save changes' : 'Add Lead'} <ArrowRight size={18}/></button><p className="consult-secure">🔒 Your information is secure and will never be shared.</p></form></Modal>}
    {detail && <Modal title={detail.full_name} close={() => setDetail(null)}><div className="detail-body">{!detail.accepted_by && <div className="unaccepted-lead-strip"><div><strong>Awaiting Claim / Acceptance</strong><p>This lead arrived via {detail.source === 'website' ? 'Website Form' : detail.source} and has not yet been claimed by an agent.</p></div>{canWrite && <Button onClick={() => acceptLead(detail.id, detail.full_name)} className="claim-lead-header-btn" style={{ flexShrink: 0 }}><Zap size={14} fill="currentColor"/> Claim Lead</Button>}</div>}<div className="detail-tags"><Badge value={detail.status}/><Badge value={detail.priority}/><span className="muted">via {detail.source}</span>{detail.accepted_by ? (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
    <span className="detail-meta-chip" style={{ margin: 0 }}>
      <CheckCircle2 size={12}/> Accepted by {members.find(m => m.id === detail.accepted_by)?.name || 'Agent'}{detail.accepted_at ? ` (${formatDate(detail.accepted_at)})` : ''}
    </span>
    {isAdmin && (
      <select
        className="detail-reassign-select"
        value={detail.assigned_to || ''}
        aria-label="Reassign agent"
        title="Reassign this lead to another agent"
        disabled={busy}
        onChange={async e => {
          const newId = e.target.value;
          await assignLeadAgent(detail.id, newId, detail.full_name);
          try {
            const updated = await api(`/leads/${detail.id}`);
            setDetail(updated);
          } catch {}
        }}
      >
        <option value="">— Reassign agent —</option>
        {members.filter(m => m.role !== 'viewer').map(m => (
          <option key={m.id} value={m.id}>Assign: {m.name} ({titleCase(m.role)})</option>
        ))}
      </select>
    )}
  </div>
) : (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
    <span className="detail-meta-chip" style={{ margin: 0, background: '#FFFBEB', color: '#B45309', borderColor: '#FDE68A' }}>
      ⚠️ Awaiting Claim / Unassigned
    </span>
    {isAdmin && (
      <select
        className="detail-reassign-select"
        value={detail.assigned_to || ''}
        aria-label="Assign agent"
        title="Assign an agent to this lead"
        disabled={busy}
        onChange={async e => {
          const newId = e.target.value;
          await assignLeadAgent(detail.id, newId, detail.full_name);
          try {
            const updated = await api(`/leads/${detail.id}`);
            setDetail(updated);
          } catch {}
        }}
      >
        <option value="">— Assign an agent —</option>
        {members.filter(m => m.role !== 'viewer').map(m => (
          <option key={m.id} value={m.id}>Assign: {m.name} ({titleCase(m.role)})</option>
        ))}
      </select>
    )}
  </div>
)}</div><div className="detail-grid"><div><small>Email</small><p>{detail.email ? <a href={`mailto:${detail.email}`} className="detail-contact-link" title={`Email ${detail.email}`}><Mail size={13} style={{ flexShrink: 0 }}/><span>{detail.email}</span></a> : '—'}</p></div><div><small>Phone</small><p>{detail.phone ? <a href={`tel:${detail.phone.replace(/[^0-9+]/g, '')}`} className="phone-call-btn" title={`Call ${detail.phone}`}><Phone size={13} style={{ flexShrink: 0 }}/><span>{detail.phone}</span><span className="call-now-badge">Call</span></a> : '—'}</p></div><div><small>Company</small><p>{detail.company_name || '—'}</p></div><div><small>Next follow-up</small><p>{formatDate(detail.next_follow_up_at)}</p></div></div>{detail.attribution && Object.keys(detail.attribution).length > 0 && <div className="detail-attribution-block"><small className="muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Attribution Metadata</small><div className="attribution-chips-row">{Object.entries(detail.attribution).map(([k, v]) => <span className="attribution-chip" key={k}><span className="attr-key">{k.replace('_', ' ')}:</span> <span className="attr-val">{String(v)}</span></span>)}</div></div>}{detail.duplicate_of && <div className="info-strip duplicate-warning"><CircleHelp size={18}/><div>Possible duplicate detected.{isAdmin && <button className="text-button" onClick={() => { if (confirm('Merge this lead into the matching lead? Existing target fields will be kept and tasks moved.')) perform(async () => { await api(`/leads/${detail.id}/merge`, send({ target_id: detail.duplicate_of })); setDetail(null); setToast('Leads merged'); }); }}>Review complete — merge into match</button>}</div></div>}<div className="detail-actions">{!detail.accepted_by && canWrite && <Button onClick={() => acceptLead(detail.id, detail.full_name)} className="claim-lead-header-btn"><Zap size={14} fill="currentColor"/> Claim Lead</Button>}{canWrite && <Button secondary onClick={() => editLead(detail)}>Edit lead</Button>}{canWrite && <Button secondary onClick={() => { const targetId = detail.id; setDetail(null); openScheduleFollowUp(targetId); }}>Schedule follow-up</Button>}{isAdmin && <button className="icon-button danger" aria-label="Delete lead" onClick={() => { if (confirm('Remove this lead from the active directory?')) perform(async () => { await api(`/leads/${detail.id}`, { method: 'DELETE' }); setDetail(null); setToast('Lead removed'); }); }}><Trash2 size={17}/></button>}</div><h3>Activity timeline</h3>{canWrite && <form className="note-form" onSubmit={e => { e.preventDefault(); perform(async () => { await api(`/leads/${detail.id}/notes`, send({ description: note })); setNote(''); setDetail(await api(`/leads/${detail.id}`)); }); }}><textarea aria-label="Add activity note" placeholder="Leave a helpful note for your team…" value={note} onChange={e => setNote(e.target.value)} required/><Button disabled={busy}>Add note</Button></form>}<div className="timeline">{detail.activities?.map(a => <article key={a.id}><span className="timeline-dot"/><div><strong>{titleCase(a.type.replaceAll('_', ' '))}</strong><p>{a.description}</p><small>{formatDate(a.created_at)}</small></div></article>)}</div></div></Modal>}
    {websiteModal && <Modal title={editingSite ? 'Configure website' : 'Connect a website'} close={() => setWebsiteModal(false)}><form onSubmit={e => { e.preventDefault(); perform(async () => { let field_mapping; try { field_mapping = JSON.parse(siteForm.field_mapping); } catch { throw new Error('Field mapping must be valid JSON'); } const body = { ...siteForm, field_mapping, assigned_to: siteForm.assigned_to || null }; await api(editingSite ? `/websites/${editingSite.id}` : '/websites', send(body, editingSite ? 'PATCH' : 'POST')); setWebsiteModal(false); setToast('Website configuration saved'); }); }}><div className="form-grid"><label>Website name<input required value={siteForm.name} onChange={e => setSiteForm({ ...siteForm, name: e.target.value })}/></label><label>Domain<input required placeholder="digital.timelyhealth.in" value={siteForm.domain} onChange={e => setSiteForm({ ...siteForm, domain: e.target.value })}/></label><label>Status<select value={siteForm.status} onChange={e => setSiteForm({ ...siteForm, status: e.target.value })}><option>active</option><option>paused</option></select></label><label>Default Agent<select value={siteForm.assigned_to} onChange={e => setSiteForm({ ...siteForm, assigned_to: e.target.value })}><option value="">Unassigned</option>{members.filter(m => m.role !== 'viewer').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label className="full-width">Form field mapping (JSON)<textarea value={siteForm.field_mapping} onChange={e => setSiteForm({ ...siteForm, field_mapping: e.target.value })}/><small>Example: {`{"your-name":"full_name","your-email":"email"}`}</small></label></div><div className="modal-actions"><Button disabled={busy}>Save website</Button></div></form></Modal>}
    {secret && <Modal title="Your new integration credential" close={() => setSecret('')}><div className="detail-body"><p>This credential is shown once. Save it in your website server’s environment. Previously issued keys have been revoked.</p><code className="secret">{secret}</code><Button onClick={async () => { await navigator.clipboard.writeText(secret); setToast('Credential copied'); }}><Copy size={16}/> Copy credential</Button></div></Modal>}
    {taskModal && <Modal title={rescheduleOldTaskId ? 'Reschedule follow-up' : 'Plan the next conversation'} close={() => { setTaskModal(false); setRescheduleOldTaskId(null); }}><form onSubmit={e => {
      e.preventDefault();
      perform(async () => {
        const dueIso = taskForm.due_at 
          ? new Date(taskForm.due_at).toISOString() 
          : new Date(Date.now() + 86400000).toISOString();

        // Proactively complete any existing open tasks for this lead to avoid remote offset-naive comparison crash
        const priorOpen = tasks.filter(t => t.lead_id === taskForm.lead_id && t.status === 'open');
        for (const t of priorOpen) {
          try {
            await api(`/follow-ups/${t.id}`, send({ status: 'completed' }, 'PATCH'));
          } catch (err) {
            console.warn('Prior task completion bypassed:', err);
          }
        }
        if (rescheduleOldTaskId && !priorOpen.some(t => t.id === rescheduleOldTaskId)) {
          try {
            await api(`/follow-ups/${rescheduleOldTaskId}`, send({ status: 'completed' }, 'PATCH'));
          } catch (err) {
            console.warn('Reschedule prior task completion bypassed:', err);
          }
        }

        await api('/follow-ups', send({
          lead_id: taskForm.lead_id,
          title: (taskForm.title || 'Client call & check-in').trim(),
          due_at: dueIso,
          assigned_to: taskForm.assigned_to || null
        }, 'POST'));

        setTaskModal(false);
        setRescheduleOldTaskId(null);
        setTaskForm({ lead_id: '', title: '', due_at: '', assigned_to: '' });
        setToast(rescheduleOldTaskId ? 'Follow-up rescheduled' : 'Follow-up scheduled');
      });
    }}><div className="form-grid"><label className="full-width">Lead<select required value={taskForm.lead_id} onChange={e => {
      const selectedLead = leads.find(l => l.id === e.target.value);
      setTaskForm({
        ...taskForm,
        lead_id: e.target.value,
        assigned_to: selectedLead?.assigned_to || taskForm.assigned_to || me?.user?.id || ''
      });
    }}><option value="">Choose a lead from the directory</option>{(me?.role === 'agent' ? leads.filter(l => l.assigned_to === me?.user?.id || !l.assigned_to) : leads).map(l => <option key={l.id} value={l.id}>{l.full_name}{l.company_name ? ` · ${l.company_name}` : ''}</option>)}</select><small>For other leads, open the lead and choose Schedule follow-up.</small></label><label className="full-width">What’s next?<input required value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })}/></label><label>Due date and time<input required type="datetime-local" value={taskForm.due_at} onChange={e => setTaskForm({ ...taskForm, due_at: e.target.value })}/></label><label>Assigned Agent<select value={taskForm.assigned_to} onChange={e => setTaskForm({ ...taskForm, assigned_to: e.target.value })}><option value="">Unassigned</option>{members.filter(m => m.role !== 'viewer').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label></div><div className="modal-actions"><Button disabled={busy}>{rescheduleOldTaskId ? 'Save rescheduled follow-up' : 'Schedule follow-up'}</Button></div></form></Modal>}
    {integrationGuideSite && (
      <Modal title={`Integration Guide · ${integrationGuideSite.name}`} close={() => setIntegrationGuideSite(null)}>
        <div className="integration-modal-body">
          <div className="info-strip">
            <ShieldCheck size={18}/>
            <div>
              <strong>Secure Form Endpoint for {integrationGuideSite.name}</strong>
              <p>Domain: <code>{integrationGuideSite.domain}</code> · Stream consultation leads directly into the CRM from any frontend or backend.</p>
            </div>
          </div>

          <div className="integration-tabs-bar">
            {(['curl', 'javascript', 'html'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                className={`integration-tab-btn ${integrationTab === tab ? 'active' : ''}`}
                onClick={() => setIntegrationTab(tab)}
              >
                {tab === 'curl' ? 'cURL Command' : tab === 'javascript' ? 'JavaScript (fetch)' : 'HTML / Webhook Form'}
              </button>
            ))}
          </div>

          <div style={{ position: 'relative' }}>
            {integrationTab === 'curl' && (
              <pre className="code-snippet-box">
{`curl -X POST "${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/api/v1/public/leads" \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: YOUR_${integrationGuideSite.name.toUpperCase().replace(/\\s+/g, '_')}_API_KEY" \\
  -d '{
    "full_name": "Dr. Sarah Jenkins",
    "phone": "+91 9876543210",
    "email": "sarah@clinic.example",
    "company_name": "Jenkins Dental Care",
    "inquiry_type": "Clinic / Hospital"
  }'`}
              </pre>
            )}

            {integrationTab === 'javascript' && (
              <pre className="code-snippet-box">
{`// Submit lead from your website frontend or API route
async function submitInquiry(formData) {
  const response = await fetch('${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/api/v1/public/leads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': 'YOUR_WEBSITE_API_KEY'
    },
    body: JSON.stringify({
      full_name: formData.name,
      phone: formData.phone,
      email: formData.email,
      company_name: formData.clinic,
      inquiry_type: formData.serviceType
    })
  });
  return response.json();
}`}
              </pre>
            )}

            {integrationTab === 'html' && (
              <pre className="code-snippet-box">
{`<!-- Standard Form Post into CRM Public Ingest -->
<form action="${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/api/v1/public/leads" method="POST">
  <input type="hidden" name="api_key" value="YOUR_WEBSITE_API_KEY" />
  <input type="text" name="full_name" placeholder="Full Name" required />
  <input type="tel" name="phone" placeholder="Phone Number" required />
  <input type="email" name="email" placeholder="Email Address" required />
  <input type="text" name="company_name" placeholder="Clinic / Company Name" />
  <button type="submit">Submit Request</button>
</form>`}
              </pre>
            )}

            <button
              type="button"
              className="code-copy-floating-btn"
              onClick={async () => {
                const code = integrationTab === 'curl'
                  ? `curl -X POST "${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/api/v1/public/leads" \\\n  -H "Content-Type: application/json" \\\n  -H "X-Api-Key: YOUR_API_KEY" \\\n  -d '{"full_name": "Dr. Sarah", "phone": "+91 9876543210", "email": "sarah@clinic.example"}'`
                  : `fetch('${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/api/v1/public/leads', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'YOUR_API_KEY' }, body: JSON.stringify({ full_name: 'Dr. Sarah', phone: '+91 9876543210' }) });`;
                await navigator.clipboard.writeText(code);
                setToast('Snippet copied to clipboard');
              }}
            >
              <Copy size={13}/> Copy Code
            </button>
          </div>

          <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid var(--line)', fontSize: 11.5 }}>
            <strong style={{ color: 'var(--ink)', display: 'block', marginBottom: 4 }}>Field Mapping Active:</strong>
            <p style={{ margin: 0, color: 'var(--muted)' }}>
              {Object.keys(integrationGuideSite.config?.field_mapping || {}).length > 0
                ? `Active Mappings: ${Object.entries(integrationGuideSite.config.field_mapping).map(([k, v]) => `${k} → ${v}`).join(', ')}`
                : 'No custom field mappings configured. Incoming attributes match standard CRM fields directly (full_name, phone, email, company_name, inquiry_type, tags).'}
            </p>
          </div>
        </div>
      </Modal>
    )}
    {memberModal && <Modal title="Add a teammate" close={() => setMemberModal(false)}><form onSubmit={e => { e.preventDefault(); perform(async () => { await api('/members', send(memberForm)); setMemberModal(false); setMemberForm({ name: '', email: '', password: '', role: 'agent' }); setToast('Teammate added'); }); }}><div className="form-grid">{['name', 'email', 'password'].map(field => <label key={field}>{titleCase(field)}<input required type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'} minLength={field === 'password' ? 12 : 1} value={(memberForm as any)[field]} onChange={e => setMemberForm({ ...memberForm, [field]: e.target.value })}/></label>)}<label>Role<select value={memberForm.role} onChange={e => setMemberForm({ ...memberForm, role: e.target.value })}>{['admin', 'agent', 'viewer'].map(role => <option key={role}>{role}</option>)}</select></label></div><div className="modal-actions"><Button disabled={busy}>Create teammate</Button></div></form></Modal>}
    {editMemberModal && editingMember && (
      <Modal title={`Edit teammate · ${editingMember.name}`} close={() => { setEditMemberModal(false); setEditingMember(null); }}>
        <form onSubmit={saveMember}>
          <div className="form-grid">
            <label className="full-width">
              Full Name <span style={{ color: '#ef4444' }}>*</span>
              <input
                required
                type="text"
                placeholder="Teammate's full name"
                minLength={1}
                maxLength={160}
                value={editMemberForm.name}
                onChange={e => setEditMemberForm({ ...editMemberForm, name: e.target.value })}
              />
            </label>

            <label className="full-width">
              Email Address <span style={{ color: '#ef4444' }}>*</span>
              <input
                required
                type="email"
                placeholder="teammate@company.com"
                minLength={3}
                maxLength={254}
                value={editMemberForm.email}
                onChange={e => setEditMemberForm({ ...editMemberForm, email: e.target.value })}
              />
            </label>

            <label className="full-width">
              Role Permission
              <select
                disabled={!isAdmin}
                value={editMemberForm.role}
                onChange={e => setEditMemberForm({ ...editMemberForm, role: e.target.value as any })}
              >
                <option value="admin">Admin — Full workspace control & integrations</option>
                <option value="agent">Agent — Manage leads, inquiries & follow-ups</option>
                <option value="viewer">Viewer — Read-only access across workspace</option>
              </select>
              {!isAdmin && <small className="muted" style={{ display: 'block', marginTop: 4 }}>Role permissions can only be modified by workspace administrators.</small>}
            </label>

            <div className="full-width" style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5, background: '#f1f5f9', padding: '10px 12px', borderRadius: 6 }}>
              {editMemberForm.role === 'admin' && '👑 Admins can manage teammates, rotate website integration keys, export lead data, and configure websites.'}
              {editMemberForm.role === 'agent' && '🎯 Agents can claim new incoming inquiries, view assigned leads, schedule follow-ups, and update stage pipelines.'}
              {editMemberForm.role === 'viewer' && '👀 Viewers have read-only browsing access to leads, websites, and dashboard metrics.'}
            </div>
          </div>
          <div className="modal-actions" style={{ marginTop: 20 }}>
            <Button secondary type="button" onClick={() => { setEditMemberModal(false); setEditingMember(null); }}>
              Cancel
            </Button>
            <Button disabled={busy} type="submit">
              Save changes
            </Button>
          </div>
        </form>
      </Modal>
    )}
  </div>;
}

function Login({ onLogin }: { onLogin: (value: any) => void }) {
  const [form, setForm] = useState({ email: '', password: '', organization_slug: 'timely-health' });
  const [selectedOrg, setSelectedOrg] = useState('timely-health');
  const [customOrg, setCustomOrg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);

  const handleOrgChange = (value: string) => {
    setSelectedOrg(value);
    if (value === 'other') {
      setForm(prev => ({ ...prev, organization_slug: customOrg }));
    } else {
      setForm(prev => ({ ...prev, organization_slug: value }));
    }
  };

  const handleCustomOrgChange = (val: string) => {
    setCustomOrg(val);
    setForm(prev => ({ ...prev, organization_slug: val }));
  };

  return (
    <div className="login-page">
      <section className="login-story">
        <a className="brand">
          <img src="/timely-logo.png" alt="Timely Health" className="brand-logo-img login-logo" />
          <span className="brand-crm">CRM</span>
        </a>
        <div>
          <span className="eyebrow">A MORE CONNECTED WAY TO WORK</span>
          <h1>Good relationships<br/>start with<br/><em>great follow-through.</em></h1>
          <p>Every website. Every inquiry. Every next step.<br/>Bring your opportunities into one clear view.</p>
          <div className="login-orbit">
            <div className="orbit-center"><Activity size={36}/></div>
            <span className="orbit-item one"><Globe2 size={22}/> Your websites</span>
            <span className="orbit-item two"><UsersRound size={22}/> Your connections</span>
            <span className="orbit-item three"><Check size={22}/> Your next step</span>
          </div>
        </div>
        <small>Built for the people behind every connection.</small>
      </section>
      <section className="login-form-area">
        <form onSubmit={async e => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const userData = await api('/auth/login', send(form));
            onLogin(userData);
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}>
          <span className="login-welcome">YOUR WORKSPACE AWAITS</span>
          <h2>Welcome back.</h2>
          <p>Let’s pick up where your connections left off.</p>
          {error && <div className="error-banner" role="alert">{error}</div>}
          <label>
            Organization
            <select
              value={selectedOrg}
              onChange={e => handleOrgChange(e.target.value)}
              aria-label="Select organization"
            >
              <option value="timely-health">Timely Health (timely-health)</option>
              <option value="other">Other organization / Custom ID…</option>
            </select>
            {selectedOrg === 'other' && (
              <input
                style={{ marginTop: 8 }}
                required
                placeholder="Enter custom organization slug (e.g. acme-health)"
                value={customOrg}
                onChange={e => handleCustomOrgChange(e.target.value)}
                autoFocus
              />
            )}
          </label>
          <label>
            Email address
            <input
              type="email"
              required
              autoComplete="username"
              placeholder="you@timelyhealth.in"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Password
            <div className="password-input-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          <Button disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={18}/> : <>Sign in to your workspace <ArrowRight size={17}/></>}
          </Button>
          <div className="login-security">
            <ShieldCheck size={16}/> Your organization. Your data. Securely connected.
          </div>
        </form>
      </section>
    </div>
  );
}
